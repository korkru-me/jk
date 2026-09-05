import { randomBytes } from 'node:crypto'
import { chmod, lstat, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { repoRoot } from './files.mjs'

export async function prepareLab(root = repoRoot) {
  const local = resolve(root, '.local')
  await mkdir(local, { recursive: true, mode: 0o700 })
  if ((await lstat(local)).isSymbolicLink()) throw new Error('LAB_DIRECTORY_REQUIRED')
  const directory = await mkdtemp(resolve(local, 'seb-phase2-'))
  await chmod(directory, 0o700)
  const secret = () => randomBytes(32).toString('hex')
  const password = secret()
  const clientSecret = secret()
  const projectName = `korkru-seb-phase2-${randomBytes(6).toString('hex')}`
  const environment = {
    LAB_PROJECT_NAME: projectName,
    LAB_DB_ROOT_PASSWORD: secret(), LAB_DB_PASSWORD: secret(),
    LAB_SERVICE_PASSWORD: clientSecret, LAB_ADMIN_PASSWORD: password,
  }
  await writeFile(resolve(directory, '.env'), Object.entries(environment).map(([k, v]) => `${k}=${v}\n`).join(''), { mode: 0o600, flag: 'wx' })
  await writeFile(resolve(directory, 'connection.json'), `${JSON.stringify({
    labOnly: true, baseUrl: 'http://127.0.0.1:18080', username: 'lab-admin', password, clientSecret,
  }, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
  return { directory, projectName }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('NO_ARGUMENTS')
    const { directory } = await prepareLab()
    console.log(`สร้างชุดทดลองส่วนตัวแล้ว: ${directory}`)
    console.log('ยังไม่ได้ติดตั้ง/เปิด Docker หรือ SEB และยังไม่เริ่ม server ดูขั้นตอนใน docs/SEB_PHASE2.md')
  } catch {
    console.error('PREPARE_FAILED — ตรวจสิทธิ์โฟลเดอร์ lab; ไม่แสดงรายละเอียดที่อาจมีรหัส')
    process.exitCode = 1
  }
}
