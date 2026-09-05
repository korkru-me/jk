import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFixtures, writeBundle, matchesCopiedConfigKey, LAB_START_URL } from './bundle.mjs'
import { configKey, decodeExamFile, passwordHash, sha256 } from './config.mjs'

describe('isolated per-exam lab artifacts', () => {
  it('A/B differ only in quit-password hash, not URL/admin password/exam salt', () => {
    const [a, b, modified] = createFixtures()
    expect(a.quitPassword).not.toBe(b.quitPassword)
    expect(a.openingPassword).not.toBe(a.quitPassword)
    expect(a.adminPassword).not.toBe(a.quitPassword)
    expect(b.settings).toEqual({ ...a.settings, hashedQuitPassword: passwordHash(b.quitPassword) })
    expect(a.settings.startURL).toBe(LAB_START_URL)
    expect(modified.settings.allowQuit).toBe(true) // tamper case must still be recoverable
    expect(new Set([a, b, modified].map(fixture => configKey(fixture.settings))).size).toBe(3)
    for (const fixture of [b, modified]) {
      expect(matchesCopiedConfigKey(configKey(a.settings), configKey(fixture.settings))).toBe(false)
    }
  })
  it('writes fresh private directories and encrypted, independently identified files', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'korkru-seb-bundle-test-'))
    try {
      const first = await writeBundle(parent), second = await writeBundle(parent)
      expect(first.directory).not.toBe(second.directory)
      expect(await readdir(first.directory)).toHaveLength(5)
      if (process.platform !== 'win32') expect((await stat(first.directory)).mode & 0o777).toBe(0o700)
      const manifest = JSON.parse(await readFile(join(first.directory, 'private-manifest.json'), 'utf8'))
      expect(manifest).toEqual(first.manifest)
      for (const fixture of manifest.cases) {
        const file = join(first.directory, fixture.filename)
        const bytes = await readFile(file)
        if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600)
        expect(sha256(bytes)).toBe(fixture.fileSha256)
        const xml = decodeExamFile(bytes, fixture.openingPassword)
        expect(xml).toContain(passwordHash(fixture.quitPassword))
        expect(xml).not.toContain(fixture.quitPassword)
        expect(xml).toContain(fixture.startUrl)
      }
      if (process.platform !== 'win32') expect((await stat(join(first.directory, 'private-manifest.json'))).mode & 0o777).toBe(0o600)
    } finally {
      // Only the exact mkdtemp directory created by THIS test; never a user's bundle.
      await rm(parent, { recursive: true, force: true })
    }
  })
  it('manual comparison accepts only a complete CK, not shared file text or a list of keys', () => {
    const ck = configKey(createFixtures()[0].settings)
    expect(matchesCopiedConfigKey(ck, `  ${ck.toUpperCase()}\n`)).toBe(true)
    for (const value of [null, '', 'SEB Config File for starting an exam', `${ck},${ck}`, ck.slice(1)]) {
      expect(matchesCopiedConfigKey(ck, value)).toBe(false)
    }
  })
})
