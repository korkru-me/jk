import { fileURLToPath } from 'node:url'
import { writeKit } from './kit.mjs'

const args = process.argv.slice(2)
if (args.length > 1 || (args.length === 1 && args[0] !== '--simple-passwords')) {
  console.error('Usage: npm run seb:n2:prepare -- [--simple-passwords] (lab only)')
  process.exitCode = 1
} else {
  const { directory } = await writeKit(fileURLToPath(new URL('../../.local/', import.meta.url)), {
    simplePasswords: args.includes('--simple-passwords'),
  })
  console.log(`สร้างชุดทดลอง N2.1 แล้ว: ${directory}`)
  console.log('ยังไม่ได้เปิด SEB — อ่าน READ-ME-FIRST.txt และ docs/SEB_NO_SERVER_N2.md ก่อน')
  console.log('รหัสทดลองอยู่ใน private-manifest.json ไม่แสดงใน terminal และไม่ใช้กับเว็บจริง')
}
