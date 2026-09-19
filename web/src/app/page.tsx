import {Chat} from '@/components/chat'

export default function Home() {
  return (
    <main className="flex-1 flex flex-col">
      <header className="w-full max-w-3xl mx-auto px-4 pt-8 pb-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white font-bold"
            style={{background: 'var(--accent)'}}
          >
            LR
          </span>
          <div>
            <h1 className="text-xl font-semibold leading-tight">License Referee</h1>
            <p className="text-sm text-[var(--muted)]">
              Directional, version-exact license rulings for your dependency tree, with the FSF, OSI,
              Apache, Mozilla and Eclipse sources that back them.
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Verdicts come from a structured Sanity dataset and a Sanity Context Knowledge Base, never
          from the model&apos;s memory. When authorities disagree, both claims are shown. Not legal
          advice.
        </p>
      </header>
      <Chat />
    </main>
  )
}
