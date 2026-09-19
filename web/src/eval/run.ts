/**
 * Eval: the same golden set, three retrieval configurations.
 *
 *   sanity   Sanity Context Knowledge Base + GROQ over the structured dataset
 *   keyword  BM25 keyword search over the same source pages + dataset as text
 *   none     no retrieval (model memory)
 *
 *   npx tsx src/eval/run.ts [--mode sanity,keyword,none] [--only id] [--model gemini-3.5-flash]
 *
 * Writes eval/results/<timestamp>.json and prints a summary table.
 */
import {generateText, isStepCount, tool, type ToolSet} from 'ai'
import {config as loadEnv} from 'dotenv'
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {z} from 'zod'
import {buildAgent, type AgentMode} from '../lib/agent'
import type {Report} from '../lib/tools'
import {buildCorpus, buildIndex} from './corpus'

const ROOT = resolve(process.cwd(), '..')
loadEnv({path: join(ROOT, '.env')})

type Case = {
  id: string
  kind: 'project' | 'question'
  prompt: string
  pairs?: {package: string; expect: string}[]
  mustMention?: string[]
  mustNotSay?: string[]
  expectVerdict?: string
}

type CaseResult = {
  id: string
  mode: AgentMode
  ok: boolean
  score: number
  details: string[]
  toolCalls: string[]
  ms: number
  text: string
  report?: Report
  error?: string
}

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const VERDICT_WORDS: Record<string, RegExp> = {
  compatible: /\bcompatible\b(?!\s+with\s+conditions)/i,
  conditional: /\b(conditional|with conditions|as long as|provided that|only if|you must)\b/i,
  incompatible: /\b(incompatible|not compatible|cannot|can't|not allowed|prohibit)/i,
  disputed: /\b(disagree|dispute|not osi|withdrew|does not consider|not a free)/i,
}

function scoreCase(c: Case, text: string, report?: Report): {score: number; details: string[]} {
  const details: string[] = []
  let earned = 0
  let total = 0
  const haystack = `${text}\n${report ? JSON.stringify(report) : ''}`

  if (c.kind === 'project') {
    for (const p of c.pairs ?? []) {
      total += 1
      const v = report?.verdicts.find((x) => x.package === p.package)
      if (!v) details.push(`missing verdict for ${p.package}`)
      else if (v.verdict === p.expect) earned += 1
      else details.push(`${p.package}: expected ${p.expect}, got ${v.verdict}`)
    }
    total += 1
    if (report) earned += 1
    else details.push('no submit_report call')
  } else if (c.expectVerdict) {
    total += 1
    if (VERDICT_WORDS[c.expectVerdict]?.test(text)) earned += 1
    else details.push(`prose does not express verdict "${c.expectVerdict}"`)
  }
  const normalize = (s: string) => s.toLowerCase().replace(/-/g, ' ')
  const normalizedHaystack = normalize(haystack)
  for (const m of c.mustMention ?? []) {
    total += 1
    if (normalizedHaystack.includes(normalize(m))) earned += 1
    else details.push(`missing mention: "${m}"`)
  }
  for (const m of c.mustNotSay ?? []) {
    total += 1
    if (!normalizedHaystack.includes(normalize(m))) earned += 1
    else details.push(`should not say: "${m}"`)
  }
  // Citations: at least one http URL in prose or report.
  total += 1
  if (/https?:\/\//.test(haystack)) earned += 1
  else details.push('no citation URL')
  return {score: total ? earned / total : 0, details}
}

async function keywordTools(): Promise<ToolSet> {
  const passages = await buildCorpus(join(ROOT, 'eval', 'corpus'))
  const index = buildIndex(passages)
  console.log(`keyword corpus: ${passages.length} passages`)
  return {
    keyword_search: tool({
      description:
        'BM25 keyword search over the license source pages (FSF list, GNU FAQ, Apache, Mozilla, Eclipse, OSI, choosealicense) and the dataset rendered as text. Returns the top passages with URLs.',
      inputSchema: z.object({query: z.string(), limit: z.number().int().min(1).max(10).default(6)}),
      execute: async ({query, limit}) =>
        index.search(query).slice(0, limit).map((r) => ({
          url: r.url as string,
          title: r.title as string,
          text: (r.text as string).slice(0, 1200),
          score: Math.round(r.score * 100) / 100,
        })),
    }),
  }
}

async function runCase(c: Case, mode: AgentMode, extraTools: ToolSet, model?: string): Promise<CaseResult> {
  const started = Date.now()
  const agent = await buildAgent({mode, extraTools, model})
  const toolCalls: string[] = []
  let report: Report | undefined
  try {
    const result = await generateText({
      model: agent.model,
      system: agent.system,
      prompt: c.prompt,
      tools: agent.tools,
      stopWhen: isStepCount(18),
      onStepEnd: ({toolCalls: calls, toolResults}) => {
        for (const call of calls) toolCalls.push(call.toolName)
        for (const r of toolResults) {
          if (r.toolName === 'submit_report') report = r.output as Report
        }
      },
    })
    const {score, details} = scoreCase(c, result.text, report)
    return {
      id: c.id,
      mode,
      ok: score === 1,
      score,
      details,
      toolCalls,
      ms: Date.now() - started,
      text: result.text,
      report,
    }
  } catch (err) {
    return {
      id: c.id,
      mode,
      ok: false,
      score: 0,
      details: ['error'],
      toolCalls,
      ms: Date.now() - started,
      text: '',
      error: (err as Error).message,
    }
  } finally {
    await agent.close()
  }
}

async function main() {
  const modes = (arg('mode', 'sanity,keyword,none') as string).split(',') as AgentMode[]
  const only = arg('only')
  const model = arg('model')
  const golden = JSON.parse(readFileSync(join(process.cwd(), 'src/eval/golden.json'), 'utf8')) as {
    cases: Case[]
  }
  const cases = golden.cases.filter((c) => !only || c.id === only)
  const kw = modes.includes('keyword') ? await keywordTools() : {}

  const results: CaseResult[] = []
  for (const mode of modes) {
    for (const c of cases) {
      const r = await runCase(c, mode, mode === 'keyword' ? kw : {}, model)
      results.push(r)
      const mark = r.ok ? 'PASS' : `${Math.round(r.score * 100)}%`
      console.log(
        `[${mode}] ${c.id.padEnd(26)} ${mark.padEnd(5)} ${r.ms}ms tools=${r.toolCalls.length}${
          r.details.length ? '  ' + r.details.join('; ') : ''
        }${r.error ? '  ERROR ' + r.error.slice(0, 120) : ''}`,
      )
    }
  }

  const summary = modes.map((mode) => {
    const rs = results.filter((r) => r.mode === mode)
    const pass = rs.filter((r) => r.ok).length
    const avg = rs.reduce((a, r) => a + r.score, 0) / Math.max(1, rs.length)
    const cited = rs.filter((r) => !r.details.includes('no citation URL')).length
    const tools = rs.reduce((a, r) => a + r.toolCalls.length, 0) / Math.max(1, rs.length)
    const ms = rs.reduce((a, r) => a + r.ms, 0) / Math.max(1, rs.length)
    return {mode, cases: rs.length, pass, avgScore: Math.round(avg * 100), cited, avgTools: Math.round(tools * 10) / 10, avgMs: Math.round(ms)}
  })
  console.table(summary)

  const dir = join(ROOT, 'eval', 'results')
  mkdirSync(dir, {recursive: true})
  const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify({model: model ?? process.env.LLM_MODEL, summary, results}, null, 2))
  console.log(`wrote ${file}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
