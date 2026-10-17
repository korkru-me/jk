import { describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { avatarObjectPath, normalizeAvatar, saveAvatarCrop, type AvatarStore } from './avatar-storage'
const user = '10000000-0000-4000-8000-000000000001'
const file = '10000000-0000-4000-8000-000000000002'
const other = '10000000-0000-4000-8000-000000000003'
const png = (width = 512) => sharp({ create: { width, height: width, channels: 4, background: '#abcdef' } }).png().toBuffer()
function fixture(previous: string | null, succeeds = true) {
  const store: AvatarStore = {
    readAvatar: vi.fn(async () => previous), upload: vi.fn(async () => {}),
    publicUrl: path => `https://example.invalid/storage/v1/object/public/profile-avatars/${path}`,
    replaceAvatar: vi.fn(async () => succeeds), remove: vi.fn(async () => {}),
  }
  return store
}
describe('persistent avatar crop', () => {
  it('rejects forged MIME, malformed, oversized, or non-square crops before upload', async () => {
    await expect(normalizeAvatar(Buffer.from('<svg/>'))).rejects.toThrow()
    await expect(normalizeAvatar(await png(510))).rejects.toThrow()
    await expect(normalizeAvatar(Buffer.alloc(2 * 1024 * 1024 + 1))).rejects.toThrow()
    await expect(normalizeAvatar(await sharp(await png()).jpeg().toBuffer())).rejects.toThrow()
    expect(() => avatarObjectPath('../owner', file)).toThrow()
    expect(() => avatarObjectPath(user, '../file')).toThrow()
  })
  it('saves an immutable owner path, then removes only the previous owned avatar', async () => {
    const store = fixture(`https://example.invalid/storage/v1/object/public/profile-avatars/${user}/${other}.png`)
    const url = await saveAvatarCrop(user, await png(), file, store)
    expect(url).toBe(store.publicUrl(`${user}/${file}.png`))
    expect(store.replaceAvatar).toHaveBeenCalledWith(await store.readAvatar(), url)
    expect(store.remove).toHaveBeenCalledWith(`${user}/${other}.png`)
    expect(store.upload).toHaveBeenCalledBefore(vi.mocked(store.replaceAvatar))
    expect(store.replaceAvatar).toHaveBeenCalledBefore(vi.mocked(store.remove))
  })
  it.each([null, 'https://external.invalid/avatar.png', `https://example.invalid/storage/v1/object/public/profile-avatars/${other}/${file}.png`])('does not delete unrelated old images (%s)', async previous => {
    const store = fixture(previous)
    await saveAvatarCrop(user, await png(), file, store)
    expect(store.remove).not.toHaveBeenCalled()
  })
  it('rolls back the new object on a failed or concurrent profile change without deleting the old one', async () => {
    const store = fixture('https://external.invalid/avatar.png', false)
    await expect(saveAvatarCrop(user, await png(), file, store)).rejects.toThrow()
    expect(store.remove).toHaveBeenCalledExactlyOnceWith(`${user}/${file}.png`)
  })
  it('does not update the profile when upload fails', async () => {
    const store = fixture(null)
    store.upload = vi.fn(async () => { throw new Error('offline') })
    await expect(saveAvatarCrop(user, await png(), file, store)).rejects.toThrow()
    expect(store.replaceAvatar).not.toHaveBeenCalled()
  })
})
