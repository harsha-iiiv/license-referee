/**
 * The keyword baseline searches the SAME material the Knowledge Base was built
 * from: the authority pages plus our dataset rendered as text. This keeps the
 * comparison honest — the only difference is structure (Knowledge Base
 * outline + entries + GROQ over typed rulings) versus flat keyword search.
 *
 * Pages are fetched once and cached under eval/corpus/ (root of the repo).
 */
import {createClient} from '@sanity/client'
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import MiniSearch from 'minisearch'

export const SOURCE_PAGES = [
  'https://www.gnu.org/licenses/license-list.html',
  'https://www.gnu.org/licenses/gpl-faq.html',
  'https://www.apache.org/licenses/GPL-compatibility.html',
  'https://www.apache.org/legal/resolved.html',
  'https://www.mozilla.org/en-US/MPL/2.0/FAQ/',
  'https://www.eclipse.org/legal/epl-2.0/faq.php',
  'https://opensource.org/blog/the-sspl-is-not-an-open-source-license',
  'https://opensource.org/faq/cc0',
  'https://choosealicense.com/licenses/',
  'https://choosealicense.com/appendix/',
  'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository',
]

export type Passage = {id: string; url: string; title: string; text: string}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|dt|dd|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

function chunk(text: string, size = 900, overlap = 150): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += size - overlap) out.push(text.slice(i, i + size))
  return out
}

async function fetchPage(url: string, dir: string): Promise<string> {
  const file = join(dir, url.replace(/[^a-z0-9]+/gi, '_').slice(0, 120) + '.txt')
  if (existsSync(file)) return readFileSync(file, 'utf8')
  const res = await fetch(url, {headers: {'user-agent': 'license-referee-eval/0.1'}})
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  const text = htmlToText(await res.text())
  writeFileSync(file, text)
  return text
}

/** Renders every dataset document as prose so keyword search can see it too. */
async function datasetAsText(): Promise<Passage[]> {
  const projectId = process.env.SANITY_PROJECT_ID
  const token = process.env.SANITY_AUTH_TOKEN
  if (!projectId) return []
  const client = createClient({
    projectId,
    dataset: process.env.SANITY_DATASET ?? 'production',
    token,
    apiVersion: '2025-02-19',
    useCdn: false,
  })
  const [licenses, rulings, obligations] = await Promise.all([
    client.fetch<Record<string, unknown>[]>(
      `*[_type=="license"]{spdxId, name, category, osiApproved, fsfLibre, gplCompatibility, summary, permissions, conditions, limitations}`,
    ),
    client.fetch<Record<string, unknown>[]>(
      `*[_type=="compatibilityRuling"]{"from": from->spdxId, "into": into->spdxId, verdict, combination, conditions, rationale, quote, sourceUrl, "authority": authority->name, dissent{claim, url}}`,
    ),
    client.fetch<Record<string, unknown>[]>(
      `*[_type=="obligation"]{"license": license->spdxId, trigger, severity, requirement, sourceUrl}`,
    ),
  ])
  const studio = 'https://license-referee.sanity.studio/'
  const out: Passage[] = []
  licenses.forEach((l, i) =>
    out.push({
      id: `license-${i}`,
      url: studio,
      title: `License ${l.spdxId}`,
      text: Object.entries(l)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v ?? '')}`)
        .join('\n'),
    }),
  )
  rulings.forEach((r, i) =>
    out.push({
      id: `ruling-${i}`,
      url: String(r.sourceUrl ?? studio),
      title: `Ruling ${r.from} into ${r.into}`,
      text: Object.entries(r)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')}`)
        .join('\n'),
    }),
  )
  obligations.forEach((o, i) =>
    out.push({
      id: `obligation-${i}`,
      url: String(o.sourceUrl ?? studio),
      title: `Obligation ${o.license} ${o.trigger}`,
      text: Object.entries(o)
        .map(([k, v]) => `${k}: ${String(v ?? '')}`)
        .join('\n'),
    }),
  )
  return out
}

export async function buildCorpus(cacheDir: string): Promise<Passage[]> {
  mkdirSync(cacheDir, {recursive: true})
  const passages: Passage[] = []
  for (const url of SOURCE_PAGES) {
    try {
      const text = await fetchPage(url, cacheDir)
      chunk(text).forEach((t, i) =>
        passages.push({id: `${url}#${i}`, url, title: new URL(url).pathname, text: t}),
      )
    } catch (err) {
      console.warn(`corpus: skipping ${url}: ${(err as Error).message}`)
    }
  }
  passages.push(...(await datasetAsText()))
  return passages
}

export function buildIndex(passages: Passage[]) {
  const index = new MiniSearch<Passage>({
    fields: ['title', 'text'],
    storeFields: ['url', 'title', 'text'],
    searchOptions: {boost: {title: 2}, prefix: true, fuzzy: 0.1},
  })
  index.addAll(passages)
  return index
}
