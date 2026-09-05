import { describe, it, expect } from 'vitest'
import { gunzipSync, gzipSync } from 'node:zlib'
import { XMLParser } from 'fast-xml-parser'
import { encodePlainExam, decodePlainExam } from './format.mjs'
import { createFixtures } from './kit.mjs'
import { MAX_BYTES, configKey, passwordHash } from '../seb-phase1/config.mjs'

describe('N2 no-opening-password format, not native acceptance', () => {
  it('independently unwraps plnd -> gzip -> valid starting-exam XML', () => {
    const { fixtures: [a] } = createFixtures()
    const bytes = encodePlainExam(a.settings)
    const inner = gunzipSync(bytes)
    expect(inner.subarray(0, 4).toString()).toBe('plnd')
    const xml = gunzipSync(inner.subarray(4)).toString('utf8')
    expect(decodePlainExam(bytes)).toBe(xml)
    const parsed = new XMLParser().parse(xml)
    expect(parsed.plist.dict.key).toContain('sebConfigPurpose')
    expect(xml).toContain('<key>sebConfigPurpose</key><integer>0</integer>')
    expect(xml).toContain(passwordHash(a.quitPassword))
    expect(xml).not.toContain(a.quitPassword)
    expect(xml).not.toContain(a.adminPassword)
    expect(xml).toContain(a.settings.quitURL) // plaintext limitation is deliberate and tested
  })
  it('A/B differ only by quit password; valid modified config has a different CK', () => {
    const { fixtures: [a, b, modified] } = createFixtures()
    expect(b.settings).toEqual({ ...a.settings, hashedQuitPassword: passwordHash(b.quitPassword) })
    expect(a.quitPassword).not.toBe(b.quitPassword)
    expect(a.adminPassword).not.toBe(a.quitPassword)
    expect(modified.settings).toEqual({ ...a.settings, allowPrint: true })
    expect(new Set([a, b, modified].map(f => configKey(f.settings))).size).toBe(3)
    expect(a).not.toHaveProperty('openingPassword')
    expect(a.settings.allowQuit).toBe(true)
    expect(a.settings.quitURL).not.toBe('')
  })
  it.each([null, {}, { sebConfigPurpose: 1 }])('refuses non-exam purpose %j', input => {
    expect(() => encodePlainExam(input)).toThrow()
  })
  it('rejects unsupported plist types', () => {
    expect(() => encodePlainExam({ sebConfigPurpose: 0, unsupported: 0.5 })).toThrow()
  })
  it.each([
    null, Buffer.from('not gzip'), gzipSync(Buffer.from('pswd')), gzipSync(Buffer.from('plndgarbage')),
    gzipSync(Buffer.concat([Buffer.from([0xf0, 0xec, 0xee, 0xe4]), gzipSync(Buffer.from('<plist/>'))])),
    Buffer.alloc(MAX_BYTES + 2049), gzipSync(Buffer.alloc(MAX_BYTES + 2049)),
    gzipSync(Buffer.concat([Buffer.from('plnd'), gzipSync(Buffer.alloc(MAX_BYTES + 1))])),
  ])('rejects malformed/oversized envelopes %#', input => {
    expect(() => decodePlainExam(input)).toThrow()
  })
  it('rejects truncated outer and inner streams', () => {
    const file = encodePlainExam({ sebConfigPurpose: 0 })
    expect(() => decodePlainExam(file.subarray(0, -4))).toThrow()
    expect(() => decodePlainExam(gzipSync(gunzipSync(file).subarray(0, -4)))).toThrow()
  })
})
