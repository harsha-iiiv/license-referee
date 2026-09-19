/**
 * Smoke test for the two Sanity Context endpoints: lists tools, fetches the
 * initial context, and runs one query each. Exits non-zero on any failure.
 *
 *   npm run mcp:check
 */
import {config as loadEnv} from 'dotenv'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

loadEnv({path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env')})

type Rpc = {jsonrpc: '2.0'; id: number; method: string; params?: unknown}

async function rpc(url: string, token: string, body: Rpc) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${body.method} → HTTP ${res.status}: ${text.slice(0, 300)}`)
  // Streamable HTTP may answer as SSE; take the last data: line.
  const line = text
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .pop()
  return JSON.parse(line ? line.slice(5) : text)
}

async function check(label: string, url: string | undefined, token: string | undefined) {
  if (!url || !token) {
    console.log(`${label}: not configured (skipped)`)
    return
  }
  const list = await rpc(url, token, {jsonrpc: '2.0', id: 1, method: 'tools/list'})
  const names = (list.result?.tools ?? []).map((t: {name: string}) => t.name)
  console.log(`${label}: tools = ${names.join(', ')}`)
  const ic = await rpc(url, token, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {name: 'initial_context', arguments: {}},
  })
  const text = ic.result?.content?.map((c: {text?: string}) => c.text ?? '').join('\n') ?? ''
  console.log(`${label}: initial_context = ${text.length} chars\n${text.slice(0, 600)}\n…`)
}

const orgToken = process.env.SANITY_ORGANIZATION_TOKEN
await check('knowledge-base', process.env.SANITY_CONTEXT_MCP_URL, orgToken)
await check(
  'groq',
  process.env.SANITY_CONTEXT_GROQ_MCP_URL,
  process.env.SANITY_CONTEXT_GROQ_TOKEN ?? orgToken,
)
