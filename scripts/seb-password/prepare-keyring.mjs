import { randomBytes } from 'node:crypto'
import { chmod, lstat, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Creates a new, private deployment-secret proposal. Never edits an existing
 * env, replaces a keyring, deploys, connects to a DB, or enables the feature. */
export async function preparePasswordKeyring(root = fileURLToPath(new URL('../../', import.meta.url))) {
  const local = resolve(root, '.local')
  await mkdir(local, { recursive: true, mode: 0o700 })
  if ((await lstat(local)).isSymbolicLink()) throw new Error('PRIVATE_DIRECTORY_REQUIRED')
  const directory = await mkdtemp(resolve(local, 'seb-password-'))
  await chmod(directory, 0o700)
  const keyId = `key_${randomBytes(8).toString('hex')}`
  const key = randomBytes(32)
  try {
    await writeFile(resolve(directory, 'keyring.env'), [
      'SEB_PASSWORD_DRAFTS_ENABLED=false',
      `SEB_PASSWORD_ACTIVE_KEY_ID=${keyId}`,
      `SEB_PASSWORD_KEYRING='${JSON.stringify({ [keyId]: key.toString('base64') })}'`,
      '',
    ].join('\n'), { mode: 0o600, flag: 'wx' })
  } finally { key.fill(0) }
  return { directory }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('NO_ARGUMENTS')
    const result = await preparePasswordKeyring()
    console.log(`เตรียมไฟล์ keyring.env ส่วนตัวไว้ที่ ${result.directory}`)
    console.log('ยังไม่เปลี่ยน env, ฐานข้อมูล หรือเปิดฟีเจอร์ อย่าวางไฟล์หรือรหัสในแชต/Git ดู docs/SEB_PASSWORD_ROLLOUT.md')
  } catch {
    console.error('KEYRING_PREPARE_FAILED — ตรวจสิทธิ์โฟลเดอร์ ไม่แสดงรายละเอียดที่อาจมีรหัส')
    process.exitCode = 1
  }
}
