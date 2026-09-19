import type {Report} from '@/lib/tools'

const VERDICT_STYLE: Record<string, {label: string; color: string; bg: string}> = {
  compatible: {label: 'Compatible', color: 'var(--ok)', bg: 'var(--ok-bg)'},
  conditional: {label: 'Conditional', color: 'var(--warn)', bg: 'var(--warn-bg)'},
  incompatible: {label: 'Incompatible', color: 'var(--bad)', bg: 'var(--bad-bg)'},
  disputed: {label: 'Disputed', color: 'var(--dispute)', bg: 'var(--dispute-bg)'},
  unknown: {label: 'Unknown', color: 'var(--unknown)', bg: 'var(--unknown-bg)'},
}

const ORDER = ['incompatible', 'disputed', 'conditional', 'unknown', 'compatible']

export function VerdictPill({verdict}: {verdict: string}) {
  const s = VERDICT_STYLE[verdict] ?? VERDICT_STYLE.unknown
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{color: s.color, background: s.bg}}
    >
      {s.label}
    </span>
  )
}

export function ReportView({report}: {report: Report}) {
  const counts = report.verdicts.reduce<Record<string, number>>((acc, v) => {
    acc[v.verdict] = (acc[v.verdict] ?? 0) + 1
    return acc
  }, {})
  const sorted = [...report.verdicts].sort(
    (a, b) => ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict) || a.package.localeCompare(b.package),
  )
  const blocking = report.verdicts.filter((v) => v.verdict === 'incompatible').length

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
      <header className="px-4 py-3 border-b border-[var(--line)] flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Project license <span className="mono text-[var(--fg)]">{report.projectLicense}</span>
          </div>
          <h2 className="font-semibold text-base mt-0.5">{report.headline}</h2>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {ORDER.filter((k) => counts[k]).map((k) => (
            <span key={k} className="flex items-center gap-1 text-xs">
              <VerdictPill verdict={k} /> {counts[k]}
            </span>
          ))}
        </div>
      </header>

      {blocking > 0 && (
        <div className="px-4 py-2 text-sm" style={{background: 'var(--bad-bg)', color: 'var(--bad)'}}>
          {blocking} dependenc{blocking === 1 ? 'y' : 'ies'} cannot ship under {report.projectLicense} as declared.
        </div>
      )}

      <ul className="divide-y divide-[var(--line)]">
        {sorted.map((v) => (
          <li key={`${v.package}@${v.version ?? ''}`} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="mono font-medium">
                {v.package}
                {v.version && <span className="text-[var(--muted)]">@{v.version}</span>}
              </span>
              <span className="mono text-xs text-[var(--muted)]">{v.license}</span>
              <span className="ml-auto">
                <VerdictPill verdict={v.verdict} />
              </span>
            </div>
            <p className="text-sm mt-1">{v.reason}</p>
            {v.conditions.length > 0 && (
              <ul className="mt-1 text-sm list-disc pl-5" style={{color: 'var(--warn)'}}>
                {v.conditions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
            {v.obligations.length > 0 && (
              <details className="mt-1 text-sm">
                <summary className="cursor-pointer text-[var(--muted)]">
                  {v.obligations.length} obligation{v.obligations.length === 1 ? '' : 's'} when shipping
                </summary>
                <ul className="list-disc pl-5 mt-1">
                  {v.obligations.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              </details>
            )}
            {v.conflict && (
              <div
                className="mt-2 rounded-lg p-3 text-sm"
                style={{background: 'var(--dispute-bg)', borderLeft: '3px solid var(--dispute)'}}
              >
                <div className="font-semibold" style={{color: 'var(--dispute)'}}>
                  Authorities disagree: {v.conflict.topic}
                </div>
                <div className="grid gap-2 mt-2 sm:grid-cols-2">
                  {v.conflict.claims.map((c, i) => (
                    <blockquote key={i} className="rounded-md bg-[var(--panel)] p-2 border border-[var(--line)]">
                      <div className="text-xs font-semibold">{c.authority}</div>
                      <div className="mt-0.5">{c.claim}</div>
                      <a className="text-xs underline text-[var(--accent)] break-all" href={c.url} target="_blank" rel="noreferrer">
                        {c.url}
                      </a>
                    </blockquote>
                  ))}
                </div>
                <div className="mt-2">
                  <span className="font-semibold">Resolution:</span> {v.conflict.resolution}
                </div>
              </div>
            )}
            {v.citations.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {v.citations.map((c, i) => (
                  <li key={i}>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      title={c.quote}
                      className="text-xs rounded-full border border-[var(--line)] px-2 py-0.5 hover:border-[var(--accent)] text-[var(--accent)]"
                    >
                      {c.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {(report.nextSteps.length > 0 || report.caveats.length > 0) && (
        <footer className="px-4 py-3 border-t border-[var(--line)] grid gap-3 sm:grid-cols-2 text-sm">
          {report.nextSteps.length > 0 && (
            <div>
              <div className="font-semibold mb-1">Next steps</div>
              <ol className="list-decimal pl-5 space-y-0.5">
                {report.nextSteps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          )}
          {report.caveats.length > 0 && (
            <div className="text-[var(--muted)]">
              <div className="font-semibold mb-1">Caveats</div>
              <ul className="list-disc pl-5 space-y-0.5">
                {report.caveats.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </footer>
      )}
    </section>
  )
}
