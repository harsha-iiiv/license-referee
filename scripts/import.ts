/**
 * Builds the structured license dataset in Sanity from three inputs:
 *
 *   data/spdx-licenses.json      SPDX License List (identifiers, OSI / FSF flags, links)
 *   data/choosealicense/         choosealicense.com front-matter (permissions / conditions / limitations)
 *   data/licenses-extra.json     category, FSF GPL-compatibility verdict, aliases, steward
 *   data/sources.json            the authorities we cite
 *   data/rulings.json            directional compatibility rulings with quotes + URLs
 *   data/obligations.json        per-license obligations
 *
 * Documents get Sanity-generated ids; relationships are resolved by looking up
 * `slug.current` (sources) and `spdxId` (licenses), so the script is re-runnable:
 * existing documents are patched, missing ones created, and rulings /
 * obligations are replaced wholesale (they are derived data).
 *
 *   npm run import            write to the dataset in .env
 *   npm run import:check      build everything, print counts, write nothing
 */
import {createClient, type SanityClient} from '@sanity/client'
import {config as loadEnv} from 'dotenv'
import {readFileSync, readdirSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {parse as parseYaml} from 'yaml'

loadEnv({path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env')})

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data')
const DRY_RUN = process.argv.includes('--dry-run')

type SpdxEntry = {
  licenseId: string
  name: string
  isOsiApproved: boolean
  isFsfLibre?: boolean
  isDeprecatedLicenseId: boolean
  reference: string
  seeAlso: string[]
}

type Extra = {
  category: string
  gplCompatibility: string
  aliases?: string[]
  steward?: string
  deprecatedIds?: string[]
}

type Source = {
  slug: string
  name: string
  url: string
  scope: string[]
  authorityRank: number
  trustNote: string
}

type Ruling = {
  from: string
  into: string
  verdict: 'compatible' | 'conditional' | 'incompatible' | 'disputed'
  combination?: 'any' | 'linking' | 'source' | 'separate'
  authority: string
  quote: string
  sourceUrl: string
  rationale: string
  conditions?: string
  dissent?: {authority: string; claim: string; url: string}
}

type Obligation = {
  license: string
  trigger: string
  severity: string
  requirement: string
  authority: string
  sourceUrl: string
}

type ChooseALicense = {
  spdxId: string
  description?: string
  permissions?: string[]
  conditions?: string[]
  limitations?: string[]
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(DATA, file), 'utf8')) as T
}

/** choosealicense stores YAML front-matter above the license text. */
export function parseChooseALicense(text: string): ChooseALicense | null {
  const match = text.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  const fm = parseYaml(match[1]) as Record<string, unknown>
  const spdxId = fm['spdx-id']
  if (typeof spdxId !== 'string') return null
  return {
    spdxId,
    description: typeof fm.description === 'string' ? fm.description : undefined,
    permissions: Array.isArray(fm.permissions) ? (fm.permissions as string[]) : undefined,
    conditions: Array.isArray(fm.conditions) ? (fm.conditions as string[]) : undefined,
    limitations: Array.isArray(fm.limitations) ? (fm.limitations as string[]) : undefined,
  }
}

function loadChooseALicense(): Map<string, ChooseALicense> {
  const dir = join(DATA, 'choosealicense', '_licenses')
  const out = new Map<string, ChooseALicense>()
  for (const file of readdirSync(dir)) {
    const parsed = parseChooseALicense(readFileSync(join(dir, file), 'utf8'))
    if (parsed) out.set(parsed.spdxId, parsed)
  }
  return out
}

/** Licenses SPDX and choosealicense do not know but npm metadata uses. */
const SYNTHETIC: Record<string, {name: string; links: {label: string; url: string}[]}> = {
  'LicenseRef-Unlicensed': {
    name: 'No license / UNLICENSED (all rights reserved)',
    links: [
      {
        label: 'GitHub Docs: Licensing a repository',
        url: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository',
      },
    ],
  },
}

export function buildLicenseDocs() {
  const spdx = readJson<{licenses: SpdxEntry[]}>('spdx-licenses.json').licenses
  const extra = readJson<Record<string, Extra | string>>('licenses-extra.json')
  const cal = loadChooseALicense()
  const byId = new Map(spdx.map((l) => [l.licenseId, l]))

  const docs: Record<string, unknown>[] = []
  for (const [spdxId, value] of Object.entries(extra)) {
    if (spdxId.startsWith('_') || typeof value === 'string') continue
    const entry = byId.get(spdxId)
    const synthetic = SYNTHETIC[spdxId]
    if (!entry && !synthetic) throw new Error(`Unknown SPDX id in licenses-extra.json: ${spdxId}`)
    const summary = cal.get(spdxId)
    const links = entry
      ? [
          {label: 'SPDX', url: entry.reference},
          ...entry.seeAlso.slice(0, 3).map((url) => ({label: 'Reference', url})),
        ]
      : synthetic!.links
    docs.push({
      _type: 'license',
      spdxId,
      name: entry?.name ?? synthetic!.name,
      aliases: value.aliases ?? [],
      category: value.category,
      osiApproved: entry ? (entry.isOsiApproved ? 'yes' : 'no') : 'no',
      fsfLibre: entry ? (entry.isFsfLibre ? 'yes' : 'no') : 'no',
      gplCompatibility: value.gplCompatibility,
      summary: summary?.description,
      permissions: summary?.permissions ?? [],
      conditions: summary?.conditions ?? [],
      limitations: summary?.limitations ?? [],
      links: links.map((l, i) => ({_key: `link${i}`, _type: 'link', ...l})),
      deprecatedIds: value.deprecatedIds ?? [],
      stewardSlug: value.steward,
    })
  }
  return docs
}

async function idBy(client: SanityClient, type: string, field: string, value: string) {
  return client.fetch<string | null>(`*[_type == $type && ${field} == $value][0]._id`, {
    type,
    value,
  })
}

async function upsert(
  client: SanityClient,
  type: string,
  field: string,
  value: string,
  doc: Record<string, unknown>,
) {
  const existing = await idBy(client, type, field, value)
  if (DRY_RUN) return existing ?? `dry-${type}-${value}`
  if (existing) {
    await client.patch(existing).set(doc).commit()
    return existing
  }
  const created = await client.create({_type: type, ...doc})
  return created._id
}

async function main() {
  const projectId = process.env.SANITY_PROJECT_ID
  const dataset = process.env.SANITY_DATASET ?? 'production'
  const token = process.env.SANITY_AUTH_TOKEN
  if (!projectId || !token) throw new Error('SANITY_PROJECT_ID and SANITY_AUTH_TOKEN are required')

  const client = createClient({projectId, dataset, token, apiVersion: '2025-02-19', useCdn: false})

  // 1. Sources
  const sources = readJson<Source[]>('sources.json')
  const sourceIds = new Map<string, string>()
  for (const s of sources) {
    const id = await upsert(client, 'source', 'slug.current', s.slug, {
      name: s.name,
      slug: {_type: 'slug', current: s.slug},
      url: s.url,
      scope: s.scope,
      authorityRank: s.authorityRank,
      trustNote: s.trustNote,
    })
    sourceIds.set(s.slug, id)
  }
  console.log(`sources: ${sourceIds.size}`)

  // 2. Licenses
  const licenseIds = new Map<string, string>()
  for (const doc of buildLicenseDocs()) {
    const {stewardSlug, spdxId, ...rest} = doc as Record<string, unknown> & {
      stewardSlug?: string
      spdxId: string
    }
    const steward = stewardSlug ? sourceIds.get(stewardSlug) : undefined
    if (stewardSlug && !steward) throw new Error(`Unknown steward ${stewardSlug} for ${spdxId}`)
    const id = await upsert(client, 'license', 'spdxId', spdxId, {
      spdxId,
      ...rest,
      ...(steward ? {steward: {_type: 'reference', _ref: steward}} : {}),
    })
    licenseIds.set(spdxId, id)
  }
  console.log(`licenses: ${licenseIds.size}`)

  const ref = (map: Map<string, string>, key: string, what: string) => {
    const id = map.get(key)
    if (!id) throw new Error(`Unknown ${what}: ${key}`)
    return {_type: 'reference', _ref: id}
  }

  // 3. Rulings + obligations are derived: delete and recreate.
  const rulings = readJson<{rulings: Ruling[]}>('rulings.json').rulings
  const obligations = readJson<{obligations: Obligation[]}>('obligations.json').obligations
  const seen = new Set<string>()
  for (const r of rulings) {
    const key = `${r.from}→${r.into}:${r.combination ?? 'any'}`
    if (seen.has(key)) throw new Error(`Duplicate ruling ${key}`)
    seen.add(key)
  }

  let tx = client.transaction()
  if (!DRY_RUN) {
    const old = await client.fetch<string[]>(
      `*[_type in ["compatibilityRuling", "obligation"]]._id`,
    )
    for (const id of old) tx = tx.delete(id)
  }
  for (const r of rulings) {
    tx = tx.create({
      _type: 'compatibilityRuling',
      from: ref(licenseIds, r.from, 'license'),
      into: ref(licenseIds, r.into, 'license'),
      verdict: r.verdict,
      combination: r.combination ?? 'any',
      conditions: r.conditions,
      rationale: r.rationale,
      authority: ref(sourceIds, r.authority, 'source'),
      quote: r.quote,
      sourceUrl: r.sourceUrl,
      ...(r.dissent
        ? {
            dissent: {
              _type: 'dissent',
              authority: ref(sourceIds, r.dissent.authority, 'source'),
              claim: r.dissent.claim,
              url: r.dissent.url,
            },
          }
        : {}),
      lastVerified: '2026-09-18',
    })
  }
  for (const o of obligations) {
    tx = tx.create({
      _type: 'obligation',
      license: ref(licenseIds, o.license, 'license'),
      trigger: o.trigger,
      severity: o.severity,
      requirement: o.requirement,
      authority: ref(sourceIds, o.authority, 'source'),
      sourceUrl: o.sourceUrl,
    })
  }
  console.log(`rulings: ${rulings.length}, obligations: ${obligations.length}`)
  if (DRY_RUN) {
    console.log('dry run: nothing written')
    return
  }
  await tx.commit()
  const counts = await client.fetch(
    `{"license": count(*[_type=="license"]), "ruling": count(*[_type=="compatibilityRuling"]), "obligation": count(*[_type=="obligation"]), "source": count(*[_type=="source"])}`,
  )
  console.log('dataset now:', counts)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
