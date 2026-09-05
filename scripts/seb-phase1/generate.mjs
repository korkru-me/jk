import { fileURLToPath } from 'node:url'
import { writeBundle } from './bundle.mjs'

if (process.argv.length !== 2) {
  console.error('Usage: npm run seb:phase1:generate (no production input or passwords accepted)')
  process.exitCode = 1
} else {
  const { directory } = await writeBundle(fileURLToPath(new URL('../../.local/', import.meta.url)))
  console.log(`สร้างไฟล์ทดลอง A/B/A-modified แล้ว: ${directory}`)
  console.log('ยังไม่ได้เปิด SEB — อ่าน READ-ME-FIRST.txt ก่อนทดสอบบนอุปกรณ์')
  console.log('รหัสทดลองและ CK อยู่ใน private-manifest.json เท่านั้น ไม่แสดงใน terminal')
}
