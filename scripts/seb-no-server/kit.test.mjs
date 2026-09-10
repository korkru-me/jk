import { describe, it, expect } from 'vitest'
import { mkdtemp, readFile, writeFile, rm, stat, chmod, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeKit, loadKit, loadNativeKeys, readPrivateJson, parseProbeOrigin, probeOriginForHost } from './kit.mjs'

async function withKit(run) {
  const parent = await mkdtemp(join(tmpdir(), 'korkru-n2-test-'))
  try { await run(await writeKit(parent), parent) }
  finally { await rm(parent, { recursive: true, force: true }) } // exact test-owned temp directory only
}

describe('private immutable N2 kit', () => {
  it('accepts only exact loopback or private-Wi-Fi HTTP origins on the fixed lab port', () => {
    for (const host of ['127.0.0.1', '10.0.0.8', '172.16.1.2', '172.31.255.254', '192.168.1.20']) {
      const origin = `http://${host}:4175`
      expect(probeOriginForHost(host)).toBe(origin)
      expect(parseProbeOrigin(origin).origin).toBe(origin)
    }
    for (const origin of ['https://192.168.1.20:4175', 'http://192.168.1.20:4176',
      'http://172.32.0.1:4175', 'http://8.8.8.8:4175', 'http://localhost:4175',
      'http://192.168.1.20:4175/path']) expect(() => parseProbeOrigin(origin)).toThrow()
  })
  it('creates a separately fingerprinted kit for a private Wi-Fi origin', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'korkru-n2-lan-test-'))
    try {
      const origin = 'http://192.168.1.20:4175'
      const kit = await writeKit(parent, { origin, simplePasswords: true })
      expect(kit.manifest.origin).toBe(origin)
      expect(kit.manifest.startUrl).toBe(`${origin}/n2/${kit.manifest.runId}`)
      expect(kit.manifest.quitUrl).toBe(`${origin}/quit/${kit.manifest.runId}`)
      expect((await loadKit(kit.directory)).origin).toBe(origin)
    } finally { await rm(parent, { recursive: true, force: true }) }
  })
  it('creates unique private bundles; never seeds an accepted BEK', async () => withKit(async (kit, parent) => {
    const second = await writeKit(parent)
    expect(second.directory).not.toBe(kit.directory)
    expect(second.manifest.runId).not.toBe(kit.manifest.runId)
    expect(await loadKit(kit.directory)).toEqual(kit.manifest)
    expect(await loadNativeKeys(kit.directory, kit.manifest, 'a')).toEqual([])
    if (process.platform !== 'win32') {
      expect((await stat(kit.directory)).mode & 0o777).toBe(0o700)
      for (const filename of ['private-manifest.json', 'native-keys.private.json', 'LAB-N2-a.seb']) {
        expect((await stat(join(kit.directory, filename))).mode & 0o777).toBe(0o600)
      }
    }
  }))
  it('rejects changed files before a probe can run', async () => withKit(async kit => {
    await writeFile(join(kit.directory, 'LAB-N2-a.seb'), 'changed')
    await expect(loadKit(kit.directory)).rejects.toThrow('Lab file changed')
  }))
  it('rejects missing/duplicate cases and path traversal', async () => withKit(async kit => {
    const path = join(kit.directory, 'private-manifest.json')
    for (const cases of [kit.manifest.cases.slice(0, 2), [kit.manifest.cases[0], kit.manifest.cases[0], kit.manifest.cases[2]],
      [{ ...kit.manifest.cases[0], filename: '../outside.seb' }, ...kit.manifest.cases.slice(1)]]) {
      await writeFile(path, JSON.stringify({ ...kit.manifest, cases }))
      await expect(loadKit(kit.directory)).rejects.toThrow()
    }
  }))
  it('binds manually enrolled keys to run, case and file hash', async () => withKit(async kit => {
    const path = join(kit.directory, 'native-keys.private.json')
    const entry = { caseId: 'a', fileSha256: kit.manifest.cases[0].fileSha256,
      platform: 'macOS', build: 'Synthetic 0.0', browserExamKey: 'a'.repeat(64) }
    const registry = { lab: kit.manifest.lab, runId: kit.manifest.runId, entries: [entry] }
    await writeFile(path, JSON.stringify(registry))
    expect(await loadNativeKeys(kit.directory, kit.manifest, 'a')).toEqual(['a'.repeat(64)])
    expect(await loadNativeKeys(kit.directory, kit.manifest, 'b')).toEqual([])
    for (const patch of [{ fileSha256: '0'.repeat(64) }, { platform: 'unknown' }, { browserExamKey: 'SEB Config File' }]) {
      await writeFile(path, JSON.stringify({ ...registry, entries: [{ ...entry, ...patch }] }))
      await expect(loadNativeKeys(kit.directory, kit.manifest, 'a')).rejects.toThrow()
    }
    await writeFile(path, JSON.stringify({ ...registry, runId: 'wrong-run' }))
    await expect(loadNativeKeys(kit.directory, kit.manifest, 'a')).rejects.toThrow()
  }))
  it('rejects oversized private inputs and symlinks', async () => withKit(async kit => {
    const link = join(kit.directory, 'linked.json')
    await symlink(join(kit.directory, 'private-manifest.json'), link)
    await expect(readPrivateJson(link)).rejects.toThrow()
    await writeFile(join(kit.directory, 'native-keys.private.json'), ' '.repeat(65537))
    await expect(readPrivateJson(join(kit.directory, 'native-keys.private.json'))).rejects.toThrow()
  }))
  it('rejects broadly readable private inputs on POSIX', async () => withKit(async kit => {
    if (process.platform === 'win32') return
    const path = join(kit.directory, 'private-manifest.json')
    await chmod(path, 0o644)
    await expect(readPrivateJson(path)).rejects.toThrow('owner-only')
    expect(await readFile(path, 'utf8')).not.toContain('SUPABASE')
  }))
})
