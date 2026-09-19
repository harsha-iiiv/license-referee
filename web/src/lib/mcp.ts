/**
 * Server-side connections to Sanity Context.
 *
 * Two endpoints, two jobs:
 *  - Knowledge Base mode (`SANITY_CONTEXT_MCP_URL`): the outline + entries that
 *    the Knowledge Base compiled from the FSF, OSI, ASF, Mozilla, Eclipse pages
 *    and from our own dataset. Used for explanations, obligations, edge cases
 *    and citations.
 *  - GROQ mode (`SANITY_CONTEXT_GROQ_MCP_URL`): live queries over the
 *    structured dataset (license, compatibilityRuling, obligation, source).
 *    Used for deterministic verdict lookups.
 *
 * Tokens never leave the server. Clients are created per request and closed
 * when the stream ends.
 */
import {createMCPClient, type MCPClient} from '@ai-sdk/mcp'
import type {ToolSet} from 'ai'

export type ContextEndpoint = {
  url: string
  token: string
}

export function kbEndpoint(): ContextEndpoint | null {
  const url = process.env.SANITY_CONTEXT_MCP_URL
  const token = process.env.SANITY_ORGANIZATION_TOKEN
  return url && token ? {url, token} : null
}

export function groqEndpoint(): ContextEndpoint | null {
  const url = process.env.SANITY_CONTEXT_GROQ_MCP_URL
  const token = process.env.SANITY_CONTEXT_GROQ_TOKEN ?? process.env.SANITY_ORGANIZATION_TOKEN
  return url && token ? {url, token} : null
}

export async function connect(endpoint: ContextEndpoint): Promise<MCPClient> {
  return createMCPClient({
    transport: {
      type: 'http',
      url: endpoint.url,
      headers: {Authorization: `Bearer ${endpoint.token}`},
    },
  })
}

/**
 * Sanity serves the schema overview / Knowledge Base outline over plain HTTP
 * at `<mcp url>/initial-context`. Fetching it once and putting it in the
 * system prompt saves a tool round-trip on every conversation.
 */
const initialContextCache = new Map<string, {at: number; text: string}>()
const INITIAL_CONTEXT_TTL_MS = 10 * 60 * 1000

export async function fetchInitialContext(endpoint: ContextEndpoint): Promise<string | null> {
  const cached = initialContextCache.get(endpoint.url)
  if (cached && Date.now() - cached.at < INITIAL_CONTEXT_TTL_MS) return cached.text
  const url = new URL(endpoint.url)
  url.pathname = url.pathname.replace(/\/$/, '') + '/initial-context'
  try {
    const res = await fetch(url, {
      headers: {Authorization: `Bearer ${endpoint.token}`},
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const text = await res.text()
    initialContextCache.set(endpoint.url, {at: Date.now(), text})
    return text
  } catch {
    return null
  }
}

/**
 * Falls back to calling the MCP `initial_context` tool over plain JSON-RPC
 * when the `/initial-context` HTTP endpoint is unavailable.
 */
export async function initialContextViaTool(endpoint: ContextEndpoint): Promise<string | null> {
  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${endpoint.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {name: 'initial_context', arguments: {}},
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    const raw = await res.text()
    const line = raw
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .pop()
    const json = JSON.parse(line ? line.slice(5) : raw) as {
      result?: {content?: {type: string; text?: string}[]}
    }
    const text = json.result?.content
      ?.filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n')
    if (text) initialContextCache.set(endpoint.url, {at: Date.now(), text})
    return text || null
  } catch {
    return null
  }
}

/**
 * Re-describes the generic Sanity tools with domain framing. Fewer, more
 * distinct tools route better than many overlapping ones, so `initial_context`
 * is dropped when its text is already in the system prompt.
 */
export function shapeTools(
  tools: ToolSet,
  descriptions: Record<string, string>,
  opts: {drop?: string[]; prefix?: string} = {},
): ToolSet {
  const out: ToolSet = {}
  for (const [name, tool] of Object.entries(tools)) {
    if (opts.drop?.includes(name)) continue
    const key = opts.prefix ? `${opts.prefix}${name}` : name
    out[key] = descriptions[name]
      ? ({...tool, description: descriptions[name]} as ToolSet[string])
      : tool
  }
  return out
}
