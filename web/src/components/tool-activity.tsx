'use client'

import {useState} from 'react'

type ToolPart = {
  type: string
  toolName?: string
  state?: string
  input?: unknown
  output?: unknown
  errorText?: string
}

const LABELS: Record<string, string> = {
  resolve_dependencies: 'Resolving dependency licenses from npm',
  parse_license_expression: 'Normalising license expression',
  groq_query: 'Querying the structured dataset (Sanity Context, GROQ)',
  schema_explorer: 'Inspecting dataset schema (Sanity Context)',
  knowledge_base_read: 'Reading Knowledge Base entries (Sanity Context)',
  initial_context: 'Loading Knowledge Base outline (Sanity Context)',
  submit_report: 'Compiling report',
}

function toolName(part: ToolPart): string {
  if (part.type === 'dynamic-tool') return part.toolName ?? 'tool'
  return part.type.replace(/^tool-/, '')
}

function summarizeInput(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const i = input as Record<string, unknown>
  if (name === 'groq_query' && typeof i.query === 'string') return i.query
  if (name === 'knowledge_base_read' && Array.isArray(i.paths)) return i.paths.join(', ')
  if (name === 'resolve_dependencies' && typeof i.source === 'string') {
    return i.source.startsWith('{') ? 'package.json' : i.source
  }
  if (name === 'parse_license_expression') return String(i.expression ?? '')
  if (name === 'schema_explorer') return String(i.type ?? '')
  return ''
}

function outputText(output: unknown): string {
  if (output == null) return ''
  if (typeof output === 'string') return output
  const content = (output as {content?: {type: string; text?: string}[]}).content
  if (Array.isArray(content)) {
    return content.map((c) => c.text ?? '').join('\n')
  }
  return JSON.stringify(output, null, 2)
}

/** One line per tool call; expandable to show the raw input / output. */
export function ToolActivity({part}: {part: ToolPart}) {
  const [open, setOpen] = useState(false)
  const name = toolName(part)
  const done = part.state === 'output-available'
  const failed = part.state === 'output-error'
  const detail = summarizeInput(name, part.input)
  return (
    <div className="text-xs rounded-md border border-[var(--line)] bg-[var(--panel)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-2.5 py-1.5 flex items-center gap-2"
      >
        <span
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{background: failed ? 'var(--bad)' : done ? 'var(--ok)' : 'var(--warn)'}}
        />
        <span className="font-medium">{LABELS[name] ?? name}</span>
        {detail && <span className="mono text-[var(--muted)] truncate">{detail}</span>}
        <span className="ml-auto text-[var(--muted)]">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-2.5 pb-2 space-y-1.5">
          {part.input != null && (
            <pre className="mono whitespace-pre-wrap break-words max-h-48 overflow-auto rounded bg-[var(--unknown-bg)] p-2">
              {JSON.stringify(part.input, null, 2)}
            </pre>
          )}
          {failed ? (
            <div style={{color: 'var(--bad)'}}>{part.errorText}</div>
          ) : (
            part.output != null && (
              <pre className="mono whitespace-pre-wrap break-words max-h-64 overflow-auto rounded bg-[var(--unknown-bg)] p-2">
                {outputText(part.output).slice(0, 6000)}
              </pre>
            )
          )}
        </div>
      )}
    </div>
  )
}
