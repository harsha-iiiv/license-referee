/**
 * Resolves a dependency tree's declared licenses from the npm registry.
 *
 * Input can be a package.json (text), a GitHub repository URL, or an npm
 * package name. Only direct dependencies are resolved (the registry's
 * `latest` metadata), which is what a license review of *your* project needs:
 * transitive dependencies are the responsibility of the packages you depend
 * on. `resolveDependencies` never throws for a single bad package; it records
 * the error on that entry.
 */
import {parseLicenseField, type ParsedLicense} from './spdx'

export type ResolvedDependency = {
  name: string
  range: string
  version?: string
  kind: 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'
  license: ParsedLicense
  repository?: string
  error?: string
}

export type ResolvedProject = {
  name?: string
  projectLicense: ParsedLicense
  dependencies: ResolvedDependency[]
  truncated: number
  source: {kind: 'package.json' | 'github' | 'npm'; ref: string}
}

type PackageJson = {
  name?: string
  version?: string
  license?: unknown
  licenses?: unknown
  repository?: unknown
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

const REGISTRY = 'https://registry.npmjs.org'
const MAX_DEPS = 120
const CONCURRENCY = 8

const cache = new Map<string, Promise<PackageJson | null>>()

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(url, {
    ...init,
    headers: {accept: 'application/json', 'user-agent': 'license-referee/0.1', ...init?.headers},
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) return null
  return (await res.json()) as T
}

/** Latest published manifest for a package (cached per server instance). */
export function fetchManifest(name: string): Promise<PackageJson | null> {
  let hit = cache.get(name)
  if (!hit) {
    // The abbreviated metadata endpoint is small; `latest` gives the dist-tag.
    hit = fetchJson<PackageJson>(`${REGISTRY}/${encodeURIComponent(name).replace('%40', '@')}/latest`)
    cache.set(name, hit)
  }
  return hit
}

function repoUrl(repository: unknown): string | undefined {
  const url =
    typeof repository === 'string'
      ? repository
      : (repository as {url?: string} | undefined)?.url
  if (!url) return undefined
  return url
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/\.git$/, '')
}

export function parseGitHubUrl(input: string): {owner: string; repo: string; ref?: string} | null {
  const m = input
    .trim()
    .match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)(?:\/(?:tree|blob)\/([^/\s]+))?/i)
  if (!m) return null
  return {owner: m[1], repo: m[2].replace(/\.git$/, ''), ref: m[3]}
}

export async function fetchGitHubPackageJson(url: string): Promise<PackageJson> {
  const gh = parseGitHubUrl(url)
  if (!gh) throw new Error(`Not a GitHub repository URL: ${url}`)
  const ref = gh.ref ?? 'HEAD'
  const raw = `https://raw.githubusercontent.com/${gh.owner}/${gh.repo}/${ref}/package.json`
  const res = await fetch(raw, {signal: AbortSignal.timeout(15_000)})
  if (!res.ok) throw new Error(`No package.json at ${raw} (HTTP ${res.status})`)
  return (await res.json()) as PackageJson
}

/** Detects what the user pasted and loads the manifest accordingly. */
export async function loadManifest(input: string): Promise<{
  manifest: PackageJson
  source: ResolvedProject['source']
}> {
  const text = input.trim()
  if (text.startsWith('{')) {
    return {manifest: JSON.parse(text) as PackageJson, source: {kind: 'package.json', ref: 'pasted'}}
  }
  if (parseGitHubUrl(text)) {
    return {manifest: await fetchGitHubPackageJson(text), source: {kind: 'github', ref: text}}
  }
  if (/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(text)) {
    const manifest = await fetchManifest(text)
    if (!manifest) throw new Error(`npm package not found: ${text}`)
    return {manifest, source: {kind: 'npm', ref: text}}
  }
  throw new Error('Paste a package.json, a GitHub repository URL, or an npm package name.')
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({length: Math.min(limit, items.length)}, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

export async function resolveDependencies(
  input: string,
  opts: {includeDev?: boolean; includePeer?: boolean} = {},
): Promise<ResolvedProject> {
  const {manifest, source} = await loadManifest(input)
  const kinds: ResolvedDependency['kind'][] = ['dependencies', 'optionalDependencies']
  if (opts.includeDev) kinds.push('devDependencies')
  if (opts.includePeer) kinds.push('peerDependencies')

  const wanted: {name: string; range: string; kind: ResolvedDependency['kind']}[] = []
  for (const kind of kinds) {
    for (const [name, range] of Object.entries(manifest[kind] ?? {})) {
      if (!wanted.some((w) => w.name === name)) wanted.push({name, range, kind})
    }
  }
  const truncated = Math.max(0, wanted.length - MAX_DEPS)
  const batch = wanted.slice(0, MAX_DEPS)

  const dependencies = await mapLimit(batch, CONCURRENCY, async (dep): Promise<ResolvedDependency> => {
    try {
      const pkg = await fetchManifest(dep.name)
      if (!pkg) return {...dep, license: parseLicenseField(undefined), error: 'not found on npm'}
      return {
        ...dep,
        version: pkg.version,
        license: parseLicenseField(pkg.license ?? pkg.licenses),
        repository: repoUrl(pkg.repository),
      }
    } catch (err) {
      return {...dep, license: parseLicenseField(undefined), error: (err as Error).message}
    }
  })

  return {
    name: manifest.name,
    projectLicense: parseLicenseField(manifest.license ?? manifest.licenses),
    dependencies,
    truncated,
    source,
  }
}
