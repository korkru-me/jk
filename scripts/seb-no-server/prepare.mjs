import { fileURLToPath } from 'node:url'
import { writeKit } from './kit.mjs'

if (process.argv.length !== 2) {
  console.error('Usage: npm run seb:n2:prepare (no passwords or production inputs)')
  process.exitCode = 1
} else {
  const { directory } = await writeKit(fileURLToPath(new URL('../../.local/', import.meta.url)))
  console.log(`สร้างชุดทดลอง N2.1 แล้ว: ${directory}`)
  console.log('ยังไม่ได้เปิด SEB — อ่าน READ-ME-FIRST.txt และ docs/SEB_NO_SERVER_N2.md ก่อน')
  console.log('รหัสทดลองอยู่ใน private-manifest.json ไม่แสดงใน terminal และไม่ใช้กับเว็บจริง')
}
