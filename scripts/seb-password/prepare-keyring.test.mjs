import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { preparePasswordKeyring } from './prepare-keyring.mjs'

const directories = []
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'korkru-keyring-test-'))
  directories.push(root)
  return root
}
afterEach(async () => {
  // Each exact directory was created by this test; no real keyrings live here.
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true })
})
describe('offline deployment keyring preparation', () => {
  it('creates a private key file without enabling the app or returning the key', async () => {
    const result = await preparePasswordKeyring(await fixture())
    expect(Object.keys(result)).toEqual(['directory'])
    const file = join(result.directory, 'keyring.env')
    expect((await stat(result.directory)).mode & 0o777).toBe(0o700)
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    const text = await readFile(file, 'utf8')
    expect(text).toContain('SEB_PASSWORD_DRAFTS_ENABLED=false')
    const active = text.match(/SEB_PASSWORD_ACTIVE_KEY_ID=(\w+)/)[1]
    const keys = JSON.parse(text.match(/SEB_PASSWORD_KEYRING='(.+)'/)[1])
    expect(Buffer.from(keys[active], 'base64')).toHaveLength(32)
    expect(Object.keys(keys)).toEqual([active])
    expect(JSON.stringify(result)).not.toContain(keys[active])
  })
  it('generates new material without overwriting an existing keyring', async () => {
    const root = await fixture()
    const first = await preparePasswordKeyring(root)
    const original = await readFile(join(first.directory, 'keyring.env'), 'utf8')
    const second = await preparePasswordKeyring(root)
    expect(first.directory).not.toBe(second.directory)
    expect(await readFile(join(first.directory, 'keyring.env'), 'utf8')).toBe(original)
    expect(await readFile(join(second.directory, 'keyring.env'), 'utf8')).not.toBe(original)
  })
  it('refuses to follow a symlink for its private output root', async () => {
    const root = await fixture()
    const target = await fixture()
    await symlink(target, join(root, '.local'))
    await expect(preparePasswordKeyring(root)).rejects.toThrow('PRIVATE_DIRECTORY_REQUIRED')
  })
})
