/**
 * SPDX license expression parsing and normalisation.
 *
 * npm `license` fields are messy: "MIT", "(MIT OR Apache-2.0)", "GPL-3.0+",
 * "BSD", "SEE LICENSE IN LICENSE.txt", "UNLICENSED", or a legacy object.
 * This module turns all of that into a small AST plus a list of "choices":
 * each choice is a set of SPDX ids that ALL apply if the consumer picks that
 * branch of an OR. A dependency is usable under a project license if at least
 * one choice is compatible.
 */

export type SpdxNode =
  | {kind: 'license'; id: string; exception?: string; orLater?: boolean}
  | {kind: 'and'; left: SpdxNode; right: SpdxNode}
  | {kind: 'or'; left: SpdxNode; right: SpdxNode}

export const UNLICENSED = 'LicenseRef-Unlicensed'
export const CUSTOM = 'LicenseRef-Custom'

/** Deprecated SPDX ids and common non-SPDX spellings → canonical id. */
const CANONICAL: Record<string, string> = {
  'GPL-1.0': 'GPL-1.0-only',
  'GPL-1.0+': 'GPL-1.0-or-later',
  'GPL-2.0': 'GPL-2.0-only',
  'GPL-2.0+': 'GPL-2.0-or-later',
  'GPL-3.0': 'GPL-3.0-only',
  'GPL-3.0+': 'GPL-3.0-or-later',
  'LGPL-2.0': 'LGPL-2.0-only',
  'LGPL-2.0+': 'LGPL-2.0-or-later',
  'LGPL-2.1': 'LGPL-2.1-only',
  'LGPL-2.1+': 'LGPL-2.1-or-later',
  'LGPL-3.0': 'LGPL-3.0-only',
  'LGPL-3.0+': 'LGPL-3.0-or-later',
  'AGPL-1.0': 'AGPL-1.0-only',
  'AGPL-3.0': 'AGPL-3.0-only',
  'AGPL-3.0+': 'AGPL-3.0-or-later',
  'GFDL-1.3': 'GFDL-1.3-only',
  'BSD-2-Clause-FreeBSD': 'BSD-2-Clause',
  'BSD-2-Clause-NetBSD': 'BSD-2-Clause',
  'MPL2': 'MPL-2.0',
  'MPL-2': 'MPL-2.0',
  'APACHE-2.0': 'Apache-2.0',
  'APACHE2': 'Apache-2.0',
  'APACHE-2': 'Apache-2.0',
  'APACHE 2.0': 'Apache-2.0',
  'APACHE LICENSE 2.0': 'Apache-2.0',
  'APACHE LICENSE, VERSION 2.0': 'Apache-2.0',
  'ASL-2.0': 'Apache-2.0',
  'ASL 2.0': 'Apache-2.0',
  'BSD-3': 'BSD-3-Clause',
  'BSD3': 'BSD-3-Clause',
  'BSD-2': 'BSD-2-Clause',
  'BSD2': 'BSD-2-Clause',
  'NEW BSD': 'BSD-3-Clause',
  'MODIFIED BSD': 'BSD-3-Clause',
  'SIMPLIFIED BSD': 'BSD-2-Clause',
  'FREEBSD': 'BSD-2-Clause',
  'MIT LICENSE': 'MIT',
  'MIT/X11': 'MIT',
  'EXPAT': 'MIT',
  'ISC LICENSE': 'ISC',
  'PUBLIC DOMAIN': 'Unlicense',
  'CC0': 'CC0-1.0',
  'WTFPL-2.0': 'WTFPL',
  'GPLV2': 'GPL-2.0-only',
  'GPLV3': 'GPL-3.0-only',
  'GPL2': 'GPL-2.0-only',
  'GPL3': 'GPL-3.0-only',
  'LGPLV2.1': 'LGPL-2.1-only',
  'LGPLV3': 'LGPL-3.0-only',
  'AGPLV3': 'AGPL-3.0-only',
  'PYTHON-2.0.1': 'Python-2.0',
  'PSF': 'Python-2.0',
  'ZLIB/LIBPNG': 'Zlib',
}

/** Bare family names that cannot be resolved to a version without reading the license file. */
const AMBIGUOUS: Record<string, string[]> = {
  BSD: ['BSD-2-Clause', 'BSD-3-Clause'],
  GPL: ['GPL-2.0-only', 'GPL-3.0-only'],
  LGPL: ['LGPL-2.1-only', 'LGPL-3.0-only'],
  AGPL: ['AGPL-3.0-only'],
  APACHE: ['Apache-2.0'],
  MPL: ['MPL-2.0', 'MPL-1.1'],
  EPL: ['EPL-2.0', 'EPL-1.0'],
  CC: ['CC-BY-4.0'],
}

export type ParsedLicense = {
  raw: string
  /** Canonical expression string, or a LicenseRef-* marker. */
  expression: string
  ast: SpdxNode | null
  /** DNF: pick one choice; every id in it applies. */
  choices: string[][]
  /** Unresolvable family names such as "BSD" with the candidates they might mean. */
  ambiguous: Record<string, string[]>
  /** Flags the model should surface. */
  notes: string[]
}

function canonicalId(token: string): {id: string; orLater: boolean} {
  let t = token.trim()
  let orLater = false
  if (t.endsWith('+') && !CANONICAL[t.toUpperCase()]) {
    orLater = true
    t = t.slice(0, -1)
  }
  const upper = t.toUpperCase()
  if (CANONICAL[upper]) return {id: CANONICAL[upper], orLater}
  if (CANONICAL[t]) return {id: CANONICAL[t], orLater}
  // GPL-3.0+ style handled above; "GPL-3.0-or-later" passes through.
  return {id: t, orLater}
}

function tokenize(expr: string): string[] {
  const out: string[] = []
  const re = /\(|\)|\bAND\b|\bOR\b|\bWITH\b|[^\s()]+/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(expr))) out.push(m[0])
  return out
}

/** Recursive-descent parser for the SPDX expression grammar. */
function parseTokens(tokens: string[]): SpdxNode {
  let i = 0
  const peek = () => tokens[i]
  const next = () => tokens[i++]

  function primary(): SpdxNode {
    const t = next()
    if (t === undefined) throw new Error('Unexpected end of expression')
    if (t === '(') {
      const node = orExpr()
      if (next() !== ')') throw new Error('Expected )')
      return node
    }
    if (/^(AND|OR|WITH|\))$/i.test(t)) throw new Error(`Unexpected token ${t}`)
    const {id, orLater} = canonicalId(t)
    const node: SpdxNode = {kind: 'license', id, ...(orLater ? {orLater} : {})}
    if (peek() && /^WITH$/i.test(peek())) {
      next()
      const exception = next()
      if (!exception) throw new Error('Expected exception after WITH')
      node.exception = exception
    }
    return node
  }
  function andExpr(): SpdxNode {
    let left = primary()
    while (peek() && /^AND$/i.test(peek())) {
      next()
      left = {kind: 'and', left, right: primary()}
    }
    return left
  }
  function orExpr(): SpdxNode {
    let left = andExpr()
    while (peek() && /^OR$/i.test(peek())) {
      next()
      left = {kind: 'or', left, right: andExpr()}
    }
    return left
  }
  const node = orExpr()
  if (i !== tokens.length) throw new Error(`Trailing tokens after ${tokens[i - 1]}`)
  return node
}

export function toExpression(node: SpdxNode): string {
  switch (node.kind) {
    case 'license': {
      const base = node.orLater && !/-or-later$/.test(node.id) ? `${node.id}+` : node.id
      return node.exception ? `${base} WITH ${node.exception}` : base
    }
    case 'and':
      return `(${toExpression(node.left)} AND ${toExpression(node.right)})`
    case 'or':
      return `(${toExpression(node.left)} OR ${toExpression(node.right)})`
  }
}

/** Disjunctive normal form: list of conjunctions. */
export function choices(node: SpdxNode): string[][] {
  switch (node.kind) {
    case 'license':
      return [[node.exception ? `${node.id} WITH ${node.exception}` : node.id]]
    case 'or':
      return [...choices(node.left), ...choices(node.right)]
    case 'and': {
      const out: string[][] = []
      for (const l of choices(node.left)) for (const r of choices(node.right)) out.push([...l, ...r])
      return out
    }
  }
}

/**
 * Accepts the raw npm `license` value (string, legacy object, or array) and
 * returns a normalised parse. Never throws: unparseable input becomes a
 * LicenseRef-Custom marker with a note.
 */
export function parseLicenseField(value: unknown): ParsedLicense {
  const notes: string[] = []
  let raw = ''
  if (typeof value === 'string') raw = value
  else if (Array.isArray(value)) {
    raw = value
      .map((v) => (typeof v === 'string' ? v : (v as {type?: string})?.type ?? ''))
      .filter(Boolean)
      .join(' OR ')
    if (raw) notes.push('Legacy "licenses" array; treated as an OR of its entries.')
  } else if (value && typeof value === 'object' && 'type' in value) {
    raw = String((value as {type: unknown}).type ?? '')
    notes.push('Legacy license object; only the "type" field was used.')
  }
  raw = raw.trim()

  if (!raw) {
    return {
      raw,
      expression: UNLICENSED,
      ast: {kind: 'license', id: UNLICENSED},
      choices: [[UNLICENSED]],
      ambiguous: {},
      notes: ['No license declared. Default copyright applies: all rights reserved.'],
    }
  }
  if (/^UNLICENSED$/i.test(raw)) {
    return {
      raw,
      expression: UNLICENSED,
      ast: {kind: 'license', id: UNLICENSED},
      choices: [[UNLICENSED]],
      ambiguous: {},
      notes: ['Declared UNLICENSED: the author grants no rights to use this package.'],
    }
  }
  if (/^SEE LICENSE IN/i.test(raw)) {
    return {
      raw,
      expression: CUSTOM,
      ast: {kind: 'license', id: CUSTOM},
      choices: [[CUSTOM]],
      ambiguous: {},
      notes: [`Custom license: "${raw}". Read the file in the package before relying on it.`],
    }
  }

  const ambiguous: Record<string, string[]> = {}
  let ast: SpdxNode | null = null
  try {
    ast = parseTokens(tokenize(raw))
  } catch (err) {
    // Try a couple of common human spellings before giving up.
    const upper = raw.toUpperCase()
    if (CANONICAL[upper]) ast = {kind: 'license', id: CANONICAL[upper]}
    else {
      return {
        raw,
        expression: CUSTOM,
        ast: null,
        choices: [[CUSTOM]],
        ambiguous,
        notes: [`Could not parse "${raw}" as an SPDX expression (${(err as Error).message}).`],
      }
    }
  }

  // Flag bare family names.
  const visit = (n: SpdxNode) => {
    if (n.kind === 'license') {
      const candidates = AMBIGUOUS[n.id.toUpperCase()]
      if (candidates) ambiguous[n.id] = candidates
    } else {
      visit(n.left)
      visit(n.right)
    }
  }
  visit(ast)
  for (const [id, cands] of Object.entries(ambiguous)) {
    notes.push(`"${id}" names a family, not a license; it could be ${cands.join(' or ')}.`)
  }

  return {raw, expression: toExpression(ast), ast, choices: choices(ast), ambiguous, notes}
}

/** All license ids mentioned anywhere in the expression (for lookups). */
export function licenseIds(parsed: ParsedLicense): string[] {
  const ids = new Set<string>()
  for (const choice of parsed.choices) for (const id of choice) ids.add(id.split(' WITH ')[0])
  return [...ids]
}
