'use client'

import {useChat} from '@ai-sdk/react'
import {DefaultChatTransport, isToolUIPart, type UIMessage} from 'ai'
import {useEffect, useRef, useState} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type {Report} from '@/lib/tools'
import {ReportView} from './report'
import {ToolActivity} from './tool-activity'

const EXAMPLES: {label: string; text: string}[] = [
  {
    label: 'Audit a GitHub repo',
    text: 'Audit https://github.com/vercel/ai — can it ship as declared?',
  },
  {
    label: 'GPLv2 project + Apache dep',
    text: 'My project is GPL-2.0-only. Can I depend on an Apache-2.0 library?',
  },
  {
    label: 'Closed-source + LGPL',
    text: 'We ship a closed-source Electron app. Can we use an LGPL-2.1 library, and what do we owe?',
  },
  {
    label: 'Who is right: OSI or FSF?',
    text: 'Is CC0 an open-source license? The OSI and the FSF seem to disagree.',
  },
]

const PACKAGE_JSON_PLACEHOLDER = `{
  "name": "my-app",
  "license": "GPL-2.0-only",
  "dependencies": { "express": "^4", "sharp": "^0.33", "lodash": "^4" }
}`

function ReportParts({message}: {message: UIMessage}) {
  return (
    <>
      {message.parts.map((part, i) => {
        if (part.type === 'text') {
          return part.text.trim() ? (
            <div key={i} className="prose-chat text-[15px] leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
            </div>
          ) : null
        }
        if (part.type === 'tool-submit_report') {
          const p = part as {state?: string; output?: Report; input?: Report}
          const report = p.state === 'output-available' ? p.output : undefined
          return report ? <ReportView key={i} report={report} /> : null
        }
        if (isToolUIPart(part)) {
          return <ToolActivity key={i} part={part as never} />
        }
        return null
      })}
    </>
  )
}

export function Chat() {
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<'ask' | 'audit'>('audit')
  const bottomRef = useRef<HTMLDivElement>(null)
  const {messages, sendMessage, status, error, stop} = useChat({
    transport: new DefaultChatTransport({api: '/api/chat'}),
  })
  const busy = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({behavior: 'smooth', block: 'end'})
  }, [messages, status])

  function submit(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    const message =
      mode === 'audit' && trimmed.startsWith('{')
        ? `Audit this project against its declared license. Report every dependency.\n\n\`\`\`json\n${trimmed}\n\`\`\``
        : trimmed
    void sendMessage({text: message})
    setInput('')
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-3xl mx-auto px-4 pb-8">
      {messages.length === 0 && (
        <div className="grid gap-2 sm:grid-cols-2 mt-2">
          {EXAMPLES.map((e) => (
            <button
              key={e.label}
              type="button"
              onClick={() => {
                setMode('ask')
                submit(e.text)
              }}
              className="text-left rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 hover:border-[var(--accent)]"
            >
              <div className="text-sm font-semibold">{e.label}</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">{e.text}</div>
            </button>
          ))}
        </div>
      )}

      <ol className="flex flex-col gap-4">
        {messages.map((m) => (
          <li key={m.id} className={m.role === 'user' ? 'self-end max-w-[90%]' : 'w-full'}>
            {m.role === 'user' ? (
              <div className="rounded-xl bg-[var(--accent)] text-white px-4 py-2.5 text-sm whitespace-pre-wrap break-words">
                {m.parts
                  .filter((p) => p.type === 'text')
                  .map((p) => (p as {text: string}).text)
                  .join('\n')
                  .slice(0, 1200)}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <ReportParts message={m} />
              </div>
            )}
          </li>
        ))}
        {busy && (
          <li className="text-xs text-[var(--muted)] flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{background: 'var(--accent)'}} />
            Working through Sanity Context…
            <button type="button" onClick={() => stop()} className="underline">
              stop
            </button>
          </li>
        )}
        {error && (
          <li className="text-sm rounded-md p-3" style={{background: 'var(--bad-bg)', color: 'var(--bad)'}}>
            {error.message}
          </li>
        )}
      </ol>
      <div ref={bottomRef} />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(input)
        }}
        className="sticky bottom-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-lg p-2"
      >
        <div className="flex items-center gap-2 px-1 pb-1 text-xs">
          <button
            type="button"
            onClick={() => setMode('audit')}
            className={`rounded-full px-2 py-0.5 ${mode === 'audit' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'}`}
          >
            Audit a project
          </button>
          <button
            type="button"
            onClick={() => setMode('ask')}
            className={`rounded-full px-2 py-0.5 ${mode === 'ask' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'}`}
          >
            Ask a question
          </button>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(input)
          }}
          rows={mode === 'audit' ? 5 : 2}
          placeholder={
            mode === 'audit'
              ? `Paste package.json, a GitHub URL, or an npm package name\n\n${PACKAGE_JSON_PLACEHOLDER}`
              : 'Ask about a license, a combination, or an obligation…'
          }
          className="mono w-full resize-y bg-transparent outline-none text-sm p-2"
        />
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-[var(--muted)]">⌘/Ctrl + Enter to send</span>
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-[var(--fg)] text-[var(--bg)] px-3 py-1.5 text-sm font-medium disabled:opacity-40"
          >
            {mode === 'audit' ? 'Audit' : 'Ask'}
          </button>
        </div>
      </form>
    </div>
  )
}
