import { fileURLToPath } from 'node:url'
import { ORIGIN, probeOriginForHost, writeKit } from './kit.mjs'

const args = process.argv.slice(2)
let simplePasswords = false
let lanHost
let invalid = false
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--simple-passwords' && !simplePasswords) simplePasswords = true
  else if (args[index] === '--lan-host' && !lanHost && args[index + 1]) lanHost = args[++index]
  else invalid = true
}

if (invalid) {
  console.error('Usage: npm run seb:n2:prepare -- [--simple-passwords] [--lan-host <private-ipv4>] (lab only)')
  process.exitCode = 1
} else {
  try {
    const origin = lanHost ? probeOriginForHost(lanHost) : ORIGIN
    const { directory } = await writeKit(fileURLToPath(new URL('../../.local/', import.meta.url)), {
      simplePasswords, origin,
    })
    console.log(`สร้างชุดทดลอง N2.1 แล้ว: ${directory}`)
    console.log(`Origin ทดลอง: ${origin}`)
    console.log('ยังไม่ได้เปิด SEB — อ่าน READ-ME-FIRST.txt และ docs/SEB_NO_SERVER_N2.md ก่อน')
    console.log('รหัสทดลองอยู่ใน private-manifest.json ไม่แสดงใน terminal และไม่ใช้กับเว็บจริง')
  } catch (_) {
    console.error('สร้างชุดทดลองไม่สำเร็จ: --lan-host ต้องเป็น private IPv4 ของ Mac และใช้ port 4175 เท่านั้น')
    process.exitCode = 1
  }
}
