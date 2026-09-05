/** Synthetic, private test artifacts only. Never reads production configs or environment. */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { configKey, encodeExamFile, labSettings, passwordHash, sha256 } from './config.mjs'

export const LAB_START_URL = 'https://example.invalid/korkru-seb-phase1'
const password = () => randomBytes(18).toString('base64url')

export function createFixtures() {
  const openingPassword = password(), adminPassword = password()
  const quitA = password(), quitB = password()
  const a = labSettings({ startUrl: LAB_START_URL, quitPassword: quitA, adminPassword, salt: randomBytes(32) })
  // Same start URL, admin password, and exam salt: B differs ONLY in quit-password hash.
  const b = { ...a, hashedQuitPassword: passwordHash(quitB) }
  // Re-encrypted, structurally valid file; this is a CK-policy mismatch, not corrupt ciphertext.
  const modified = { ...a, startURL: `${LAB_START_URL}?modified=1` }
  return [
    { id: 'a', settings: a, openingPassword, adminPassword, quitPassword: quitA },
    { id: 'b', settings: b, openingPassword, adminPassword, quitPassword: quitB },
    { id: 'a-modified', settings: modified, openingPassword, adminPassword, quitPassword: quitA },
  ]
}

export async function writeBundle(parentDirectory) {
  await mkdir(parentDirectory, { recursive: true, mode: 0o700 })
  // A new directory on every run; never overwrite a user's config.
  const directory = await mkdtemp(join(parentDirectory, 'seb-phase1-'))
  const fixtures = createFixtures()
  const cases = []
  for (const fixture of fixtures) {
    const bytes = encodeExamFile(fixture.settings, fixture.openingPassword)
    const filename = `LAB-ONLY-${fixture.id}.seb`
    await writeFile(join(directory, filename), bytes, { flag: 'wx', mode: 0o600 })
    cases.push({ id: fixture.id, filename, fileSha256: sha256(bytes),
      expectedConfigKey: configKey(fixture.settings), startUrl: fixture.settings.startURL,
      openingPassword: fixture.openingPassword, adminPassword: fixture.adminPassword, quitPassword: fixture.quitPassword })
  }
  const manifest = { labVersion: 1, createdAt: new Date().toISOString(),
    purpose: 'Synthetic format/Config Key experiment. NOT a secure exam or production config.', cases }
  await writeFile(join(directory, 'private-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  await writeFile(join(directory, 'READ-ME-FIRST.txt'), [
    'KorKru SEB phase 1 — ไฟล์ทดลองเท่านั้น ห้ามแจกนักเรียนหรือแทนไฟล์ production',
    '',
    'คำสั่งสร้างไฟล์นี้ไม่ได้เปิด SEB และไม่ได้แก้ Vercel หรือฐานข้อมูล',
    'เก็บโฟลเดอร์นี้เป็นความลับ: private-manifest.json มีรหัสทดลองและ CK',
    'รหัสเปิดไฟล์ (openingPassword), รหัสตั้งค่า (adminPassword) และรหัสออก (quitPassword) เป็นคนละหน้าที่',
    'A/B ต่างกันเฉพาะรหัสออก; A-modified แก้ Start URL ของ A เพื่อทดสอบการปฏิเสธ CK',
    '',
    'ยังไม่ควรดับเบิลคลิกไฟล์: SEB อาจเปิดโหมดสอบและล็อกอุปกรณ์ โดยเฉพาะ iPad',
    'เมื่อพร้อมทดสอบ ให้จดรหัสออกนอกอุปกรณ์ก่อน และทำตาม docs/SEB_PHASE1.md',
    'Start URL ใช้ example.invalid โดยตั้งใจ: ไม่มีหน้าเว็บจริง ไม่ใช่เว็บ KorKru',
    'ไฟล์นี้ผ่อนคลายข้อจำกัดบางส่วนเพื่อทดลองรูปแบบไฟล์ ไม่ใช่ template สอบที่ปลอดภัย',
    'อย่าบันทึกไฟล์ซ้ำใน SEB ก่อนเทียบ CK เพราะ SEB อาจเพิ่มค่า default ทำให้ CK เปลี่ยน',
    'ไม่มี Browser Exam Key จริงในชุดทดลองนี้ และยังไม่ผ่านการรับรองบน SEB เครื่องจริง',
    '',
  ].join('\n'), { flag: 'wx', mode: 0o600 })
  return { directory, manifest }
}

/** Manual diagnostic only: matching text is NOT proof that a genuine SEB client supplied it. */
export function matchesCopiedConfigKey(expectedKey, copiedKey) {
  if (typeof expectedKey !== 'string' || typeof copiedKey !== 'string') return false
  const expected = expectedKey.trim(), copied = copiedKey.trim()
  if (!/^[a-f0-9]{64}$/i.test(expected) || !/^[a-f0-9]{64}$/i.test(copied)) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(copied, 'hex'))
}
