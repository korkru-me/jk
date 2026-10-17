import sharp from 'sharp'

export const AVATAR_BUCKET = 'profile-avatars'
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function avatarObjectPath(userId: string, fileId: string): string {
  if (!uuid.test(userId) || !uuid.test(fileId)) throw new Error('Invalid avatar identity')
  return `${userId}/${fileId}.png`
}
/** Accept only a decoded square crop, then re-encode to strip metadata/payloads. */
export async function normalizeAvatar(bytes: Uint8Array): Promise<Buffer> {
  if (!bytes.length || bytes.length > AVATAR_MAX_BYTES) throw new Error('Avatar too large')
  const image = sharp(bytes, { limitInputPixels: 512 * 512, animated: false })
  const metadata = await image.metadata()
  if (metadata.format !== 'png' || metadata.width !== 512 || metadata.height !== 512 || (metadata.pages ?? 1) !== 1) throw new Error('Invalid avatar crop')
  return image.png().toBuffer()
}

export interface AvatarStore {
  readAvatar: () => Promise<string | null>
  upload: (path: string, bytes: Buffer) => Promise<void>
  publicUrl: (path: string) => string
  replaceAvatar: (previous: string | null, next: string) => Promise<boolean>
  remove: (path: string) => Promise<void>
}
/** Immutable objects + compare-and-set prevent concurrent saves deleting the winner. */
export async function saveAvatarCrop(userId: string, bytes: Uint8Array, fileId: string, store: AvatarStore) {
  const image = await normalizeAvatar(bytes)
  const path = avatarObjectPath(userId, fileId)
  const previous = await store.readAvatar()
  await store.upload(path, image)
  const url = store.publicUrl(path)
  try {
    if (!(await store.replaceAvatar(previous, url))) throw new Error('Avatar changed, retry')
  } catch (error) {
    await store.remove(path).catch(() => {})
    throw error
  }
  // Delete only an old object in this bucket and this exact owner's namespace.
  const prefix = store.publicUrl(`${userId}/`)
  if (previous?.startsWith(prefix)) {
    const oldName = previous.slice(prefix.length)
    if (/^[0-9a-f-]{36}\.png$/i.test(oldName) && uuid.test(oldName.slice(0, -4))) {
      await store.remove(`${userId}/${oldName}`).catch(() => {})
    }
  }
  return url
}
