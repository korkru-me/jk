/** Private synthetic fixtures. No environment, production config, network or native app access. */
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, writeFile, readFile, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { labSettings, configKey, passwordHash, sha256 } from '../seb-phase1/config.mjs'
import { encodePlainExam } from './format.mjs'

export const ORIGIN = 'http://127.0.0.1:4175'
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const password = () => randomBytes(18).toString('base64url')
export const CASE_IDS = ['a', 'b', 'a-modified']

export function createFixtures() {
  const runId = randomBytes(16).toString('hex')
  const adminPassword = password(), quitA = password(), quitB = password()
  const a = { ...labSettings({ startUrl: `${ORIGIN}/n2/${runId}`, quitPassword: quitA,
    adminPassword, salt: randomBytes(32) }), quitURL: `${ORIGIN}/quit/${runId}`,
    quitURLConfirm: true }
  return { runId, fixtures: [
    { id: 'a', settings: a, adminPassword, quitPassword: quitA },
    { id: 'b', settings: { ...a, hashedQuitPassword: passwordHash(quitB) }, adminPassword, quitPassword: quitB },
    // Same reachable start page and recovery; a valid edit, not damaged compression.
    { id: 'a-modified', settings: { ...a, allowPrint: true }, adminPassword, quitPassword: quitA },
  ] }
}

export async function writeKit(parent) {
  await mkdir(parent, { recursive: true, mode: 0o700 })
  const directory = await mkdtemp(join(parent, 'seb-no-server-'))
  const { runId, fixtures } = createFixtures()
  const cases = []
  for (const fixture of fixtures) {
    const bytes = encodePlainExam(fixture.settings)
    const filename = `LAB-N2-${fixture.id}.seb`
    await writeFile(join(directory, filename), bytes, { flag: 'wx', mode: 0o600 })
    cases.push({ id: fixture.id, filename, fileSha256: sha256(bytes),
      expectedConfigKey: configKey(fixture.settings), quitPassword: fixture.quitPassword,
      adminPassword: fixture.adminPassword })
  }
  const manifest = { lab: 'no-server-n2-v1', runId, createdAt: new Date().toISOString(),
    origin: ORIGIN, startUrl: fixtures[0].settings.startURL, quitUrl: fixtures[0].settings.quitURL, cases }
  await writeFile(join(directory, 'private-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  await writeFile(join(directory, 'native-keys.private.json'), JSON.stringify({
    lab: manifest.lab, runId, entries: [],
  }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  await writeFile(join(directory, 'READ-ME-FIRST.txt'), [
    'KorKru N2.1 — ชุดทดลอง Mac เครื่องเดียว ไม่ใช่ข้อสอบหรือ template ล็อกเครื่องจริง',
    'ยังไม่ได้เปิด SEB / ไม่เปลี่ยนเว็บจริง / ไม่มี opening password',
    'ห้ามแจกนักเรียนหรืออัปโหลดชุดทดลองนี้เข้า public, Vercel หรือ Git',
    'ไฟล์ plnd ไม่เข้ารหัส อ่านค่าตั้ง/ลิงก์ออก/รหัสแบบ hash ได้',
    'ก่อนเปิด .seb ให้บันทึกงานอื่นและจด quitPassword กับ adminPassword ไว้นอกเครื่องทดสอบ',
    'A/B ต่างกันเฉพาะรหัสออก; A-modified แก้ค่าหนึ่งอย่างเพื่อทดสอบการปฏิเสธ',
    'อ่านขั้นตอนที่ docs/SEB_NO_SERVER_N2.md และเปิด probe ก่อนเปิด .seb',
    'Start URL เป็น 127.0.0.1 จึงใช้บน Mac ที่รัน probe เท่านั้น ไม่ส่งไฟล์นี้ไป iPad/Windows เครื่องอื่น',
    'รหัสและ CK อยู่ใน private-manifest.json; native-keys.private.json ว่างโดยตั้งใจ',
    'CK ตรงอย่างเดียวยังไม่ผ่าน BEK และไม่ใช่สิทธิ์เข้าสอบ',
    'อย่าบันทึกไฟล์ซ้ำใน SEB เพราะ CK/BEK อาจเปลี่ยน',
    'ชุดนี้ผ่อนคลาย desktop restrictions เพื่อกู้คืนง่าย ไม่ใช้รับรองความปลอดภัยของ kiosk',
    '',
  ].join('\n'), { flag: 'wx', mode: 0o600 })
  return { directory, manifest }
}

export async function readPrivateJson(path) {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > 65536) throw new Error('Invalid private lab input')
  if (process.platform !== 'win32' && (info.mode & 0o077)) throw new Error('Lab input must be owner-only')
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function loadKit(directory) {
  const manifest = await readPrivateJson(join(directory, 'private-manifest.json'))
  if (manifest.lab !== 'no-server-n2-v1' || !/^[a-f0-9]{32}$/.test(manifest.runId)
    || manifest.origin !== ORIGIN || manifest.startUrl !== `${ORIGIN}/n2/${manifest.runId}`
    || manifest.quitUrl !== `${ORIGIN}/quit/${manifest.runId}` || !Array.isArray(manifest.cases)
    || manifest.cases.length !== 3) throw new Error('Invalid N2 manifest')
  for (const id of CASE_IDS) {
    const matching = manifest.cases.filter(item => item.id === id)
    if (matching.length !== 1) throw new Error('Invalid N2 cases')
    const item = matching[0]
    if (item.filename !== `LAB-N2-${id}.seb` || !hex(item.fileSha256) || !hex(item.expectedConfigKey)) {
      throw new Error('Invalid N2 case')
    }
    const info = await lstat(join(directory, item.filename))
    if (!info.isFile() || info.size > 1050624) throw new Error('Invalid N2 fixture')
    if (sha256(await readFile(join(directory, item.filename))) !== item.fileSha256) {
      throw new Error('Lab file changed: regenerate instead of silently re-enrolling')
    }
  }
  return manifest
}

// Enrollment is a trusted operator task, never accepted from a student's probe request.
export async function loadNativeKeys(directory, manifest, caseId) {
  const registry = await readPrivateJson(join(directory, 'native-keys.private.json'))
  if (registry.lab !== manifest.lab || registry.runId !== manifest.runId || !Array.isArray(registry.entries)
    || registry.entries.length > 24) throw new Error('Invalid private native registry')
  for (const entry of registry.entries) {
    const fixture = manifest.cases.find(item => item.id === entry.caseId)
    if (!fixture || entry.fileSha256 !== fixture.fileSha256 || !hex(entry.browserExamKey)
      || !['macOS', 'iOS', 'Windows'].includes(entry.platform)
      || typeof entry.build !== 'string' || !/^[A-Za-z0-9._ -]{1,100}$/.test(entry.build)) {
      throw new Error('Invalid native key binding')
    }
  }
  return registry.entries.filter(entry => entry.caseId === caseId).map(entry => entry.browserExamKey)
}
