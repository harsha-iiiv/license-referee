import {describe, expect, it} from 'vitest'
import {licenseIds, parseLicenseField, UNLICENSED, CUSTOM} from './spdx'

describe('parseLicenseField', () => {
  it('normalises deprecated GPL ids', () => {
    expect(parseLicenseField('GPL-3.0').expression).toBe('GPL-3.0-only')
    expect(parseLicenseField('GPL-3.0+').expression).toBe('GPL-3.0-or-later')
    expect(parseLicenseField('LGPL-2.1').expression).toBe('LGPL-2.1-only')
    expect(parseLicenseField('AGPL-3.0').expression).toBe('AGPL-3.0-only')
  })

  it('parses OR into separate choices', () => {
    const p = parseLicenseField('(MIT OR Apache-2.0)')
    expect(p.choices).toEqual([['MIT'], ['Apache-2.0']])
    expect(p.expression).toBe('(MIT OR Apache-2.0)')
  })

  it('parses AND into one choice with both ids', () => {
    const p = parseLicenseField('MIT AND CC-BY-4.0')
    expect(p.choices).toEqual([['MIT', 'CC-BY-4.0']])
  })

  it('distributes AND over OR', () => {
    const p = parseLicenseField('(MIT OR GPL-2.0) AND CC0-1.0')
    expect(p.choices).toEqual([
      ['MIT', 'CC0-1.0'],
      ['GPL-2.0-only', 'CC0-1.0'],
    ])
  })

  it('keeps WITH exceptions attached', () => {
    const p = parseLicenseField('GPL-2.0-only WITH Classpath-exception-2.0')
    expect(p.choices).toEqual([['GPL-2.0-only WITH Classpath-exception-2.0']])
    expect(licenseIds(p)).toEqual(['GPL-2.0-only'])
  })

  it('maps human spellings', () => {
    expect(parseLicenseField('Apache 2.0').expression).toBe('Apache-2.0')
    expect(parseLicenseField('New BSD').expression).toBe('BSD-3-Clause')
    expect(parseLicenseField('MIT License').expression).toBe('MIT')
  })

  it('flags bare family names as ambiguous', () => {
    const p = parseLicenseField('BSD')
    expect(p.ambiguous).toEqual({BSD: ['BSD-2-Clause', 'BSD-3-Clause']})
    expect(p.notes[0]).toMatch(/family/)
  })

  it('treats missing and UNLICENSED as all rights reserved', () => {
    expect(parseLicenseField(undefined).expression).toBe(UNLICENSED)
    expect(parseLicenseField('').expression).toBe(UNLICENSED)
    expect(parseLicenseField('UNLICENSED').expression).toBe(UNLICENSED)
  })

  it('marks SEE LICENSE IN as custom', () => {
    const p = parseLicenseField('SEE LICENSE IN LICENSE.md')
    expect(p.expression).toBe(CUSTOM)
    expect(p.notes[0]).toMatch(/Custom license/)
  })

  it('handles legacy object and array forms', () => {
    expect(parseLicenseField({type: 'MIT', url: 'x'}).expression).toBe('MIT')
    expect(parseLicenseField([{type: 'MIT'}, {type: 'GPL-2.0'}]).choices).toEqual([
      ['MIT'],
      ['GPL-2.0-only'],
    ])
  })

  it('never throws on garbage', () => {
    const p = parseLicenseField('MIT OR')
    expect(p.expression).toBe(CUSTOM)
    expect(p.ast).toBeNull()
  })
})
