import { resolve } from 'node:path'
import { loadKit, loadNativeKeys, parseProbeOrigin } from './kit.mjs'
import { createProbeServer } from './probe-server.mjs'

const [directory, caseId, ...extra] = process.argv.slice(2)
if (!directory || !['a', 'b', 'a-modified'].includes(caseId) || extra.length) {
  console.error('Usage: npm run seb:n2:probe -- <private-kit-directory> <a|b|a-modified>')
  process.exitCode = 1
} else {
  try {
    const manifest = await loadKit(resolve(directory))
    const browserKeys = await loadNativeKeys(resolve(directory), manifest, caseId)
    const origin = parseProbeOrigin(manifest.origin)
    const server = createProbeServer({ manifest, caseId, browserKeys })
    server.on('error', () => { console.error('เปิด probe ไม่สำเร็จ ตรวจว่า port 4175 ว่าง ห้ามปิดโปรแกรมอื่นโดยเดา'); process.exitCode = 1 })
    server.listen(Number(origin.port), origin.hostname, () => {
      console.log(`${origin.hostname === '127.0.0.1' ? 'N2.1 เฉพาะ Mac เครื่องนี้' : 'N2.1 เฉพาะ Wi-Fi วงเดียวกัน'}: ${manifest.startUrl}`)
      console.log(`คาดหวังไฟล์ ${caseId}; BEK ที่ผู้ทดสอบลงทะเบียน: ${browserKeys.length} ค่า`)
      console.log('ไม่เปิด SEB อัตโนมัติ ไม่ออก session สอบ ไม่บันทึก raw request hashes')
      console.log('หยุดด้วย Ctrl+C หลังออกจาก SEB แล้ว')
    })
  } catch (_) {
    console.error('ชุดทดลองไม่ถูกต้อง/ไฟล์เปลี่ยน/สิทธิ์ไฟล์ไม่เป็นส่วนตัว ดู docs/SEB_NO_SERVER_N2.md')
    process.exitCode = 1
  }
}
