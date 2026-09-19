import {afterEach, describe, expect, it, vi} from 'vitest'
import {loadManifest, parseGitHubUrl, resolveDependencies} from './npm'

const manifests: Record<string, unknown> = {
  left: {name: 'left', version: '1.0.0', license: 'MIT'},
  copy: {name: 'copy', version: '2.0.0', license: 'GPL-3.0'},
  legacy: {name: 'legacy', version: '0.1.0', licenses: [{type: 'BSD-3-Clause'}]},
  nolicense: {name: 'nolicense', version: '0.0.1'},
}

function mockFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const m = url.match(/registry\.npmjs\.org\/(.+)\/latest$/)
      const name = m && decodeURIComponent(m[1])
      if (name && manifests[name]) {
        return new Response(JSON.stringify(manifests[name]), {status: 200})
      }
      return new Response('nope', {status: 404})
    }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('parseGitHubUrl', () => {
  it('extracts owner, repo and optional ref', () => {
    expect(parseGitHubUrl('https://github.com/vercel/ai')).toEqual({owner: 'vercel', repo: 'ai', ref: undefined})
    expect(parseGitHubUrl('github.com/vercel/ai.git')).toEqual({owner: 'vercel', repo: 'ai', ref: undefined})
    expect(parseGitHubUrl('https://github.com/vercel/ai/tree/canary')).toEqual({
      owner: 'vercel',
      repo: 'ai',
      ref: 'canary',
    })
    expect(parseGitHubUrl('https://gitlab.com/x/y')).toBeNull()
  })
})

describe('loadManifest', () => {
  it('accepts pasted package.json', async () => {
    const {manifest, source} = await loadManifest('{"name":"x","license":"MIT"}')
    expect(manifest.name).toBe('x')
    expect(source.kind).toBe('package.json')
  })

  it('rejects unknown input', async () => {
    await expect(loadManifest('not a thing at all!')).rejects.toThrow(/Paste a package.json/)
  })
})

describe('resolveDependencies', () => {
  it('resolves each dependency license from the registry', async () => {
    mockFetch()
    const project = await resolveDependencies(
      JSON.stringify({
        name: 'app',
        license: 'Apache-2.0',
        dependencies: {left: '^1', copy: '^2', legacy: '*', nolicense: '*', missing: '*'},
      }),
    )
    expect(project.projectLicense.expression).toBe('Apache-2.0')
    const byName = Object.fromEntries(project.dependencies.map((d) => [d.name, d]))
    expect(byName.left.license.expression).toBe('MIT')
    expect(byName.copy.license.expression).toBe('GPL-3.0-only')
    expect(byName.legacy.license.expression).toBe('BSD-3-Clause')
    expect(byName.nolicense.license.expression).toBe('LicenseRef-Unlicensed')
    expect(byName.missing.error).toBe('not found on npm')
    expect(project.truncated).toBe(0)
  })

  it('skips devDependencies unless asked', async () => {
    mockFetch()
    const pkg = JSON.stringify({dependencies: {left: '*'}, devDependencies: {copy: '*'}})
    expect((await resolveDependencies(pkg)).dependencies.map((d) => d.name)).toEqual(['left'])
    expect(
      (await resolveDependencies(pkg, {includeDev: true})).dependencies.map((d) => d.name),
    ).toEqual(['left', 'copy'])
  })
})
