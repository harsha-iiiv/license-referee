/**
 * Assembles the agent: model, system prompt and tool set. Shared by the chat
 * route and the eval harness so both run the exact same configuration.
 *
 * `mode` selects what the model is allowed to retrieve from:
 *  - 'sanity'   Sanity Context (Knowledge Base + GROQ) + local tools  ← production
 *  - 'keyword'  the same source pages, but only a BM25 keyword search   ← eval baseline
 *  - 'none'     no retrieval at all                                    ← eval baseline
 */
import {google} from '@ai-sdk/google'
import type {MCPClient} from '@ai-sdk/mcp'
import type {LanguageModel, ToolSet} from 'ai'
import {
  connect,
  fetchInitialContext,
  groqEndpoint,
  initialContextViaTool,
  kbEndpoint,
  shapeTools,
} from './mcp'
import {buildSystemPrompt} from './prompt'
import {localTools} from './tools'

export type AgentMode = 'sanity' | 'keyword' | 'none'

export type Agent = {
  model: LanguageModel
  system: string
  tools: ToolSet
  close: () => Promise<void>
  /** What retrieval this agent actually had (for logging / caveats). */
  retrieval: {knowledgeBase: boolean; groq: boolean; keyword: boolean}
}

export const DEFAULT_MODEL = process.env.LLM_MODEL ?? 'gemini-3.5-flash'

const KB_DESCRIPTIONS = {
  knowledge_base_read:
    'Read one or more entries from the License Referee Knowledge Base, indexed from our structured rulings dataset (each ruling carries a verbatim quote and sourceUrl, checked against the FSF, GNU, Apache, Mozilla, Eclipse and OSI pages during verification). Pass the entry paths from the outline. Use it for explanations, obligations, linking/plugin/SaaS edge cases and for citations when authorities disagree.',
}

const GROQ_DESCRIPTIONS = {
  groq_query:
    'Run a GROQ query over the structured license dataset: license (spdxId, category, osiApproved, fsfLibre, gplCompatibility, permissions, conditions, limitations), compatibilityRuling (from->, into->, verdict, combination, conditions, rationale, quote, sourceUrl, authority->, dissent), obligation (license->, trigger, severity, requirement, sourceUrl), source (name, url, scope, authorityRank, trustNote). Use it for exact verdicts and obligations.',
  schema_explorer: 'Inspect the fields of one dataset type before writing a groq_query.',
}

export async function buildAgent(
  opts: {mode?: AgentMode; model?: string; extraTools?: ToolSet} = {},
): Promise<Agent> {
  const mode = opts.mode ?? 'sanity'
  const clients: MCPClient[] = []
  let tools: ToolSet = {...localTools, ...(opts.extraTools ?? {})}
  let knowledgeBaseOutline: string | null = null
  let datasetContext: string | null = null
  const retrieval = {knowledgeBase: false, groq: false, keyword: mode === 'keyword'}

  if (mode === 'sanity') {
    const kb = kbEndpoint()
    const groq = groqEndpoint()
    try {
      if (kb) {
        const client = await connect(kb)
        clients.push(client)
        const [outline, kbTools] = await Promise.all([fetchInitialContext(kb), client.tools()])
        knowledgeBaseOutline = outline ?? (await initialContextViaTool(kb))
        tools = {
          ...tools,
          ...shapeTools(kbTools, KB_DESCRIPTIONS, {
            drop: knowledgeBaseOutline ? ['initial_context'] : [],
          }),
        }
        retrieval.knowledgeBase = true
      }
      if (groq) {
        const client = await connect(groq)
        clients.push(client)
        const [context, groqTools] = await Promise.all([fetchInitialContext(groq), client.tools()])
        datasetContext = context ?? (await initialContextViaTool(groq))
        tools = {
          ...tools,
          ...shapeTools(groqTools, GROQ_DESCRIPTIONS, {
            drop: [...(datasetContext ? ['initial_context'] : []), 'array_field_reader'],
          }),
        }
        retrieval.groq = true
      }
    } catch (err) {
      await Promise.all(clients.map((c) => c.close()))
      throw err
    }
  }

  const system = buildSystemPrompt({datasetContext, knowledgeBaseOutline, mode})

  return {
    model: google(opts.model ?? DEFAULT_MODEL),
    system,
    tools,
    retrieval,
    close: async () => {
      await Promise.all(clients.map((c) => c.close()))
    },
  }
}
