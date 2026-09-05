import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { matchesCopiedConfigKey } from './bundle.mjs'

const [directory, expectedCase, ...extra] = process.argv.slice(2)
if (!directory || !['a', 'b', 'a-modified'].includes(expectedCase) || extra.length) {
  console.error('Usage: npm run seb:phase1:compare -- <bundle-directory> <a|b|a-modified>')
  process.exitCode = 1
} else {
  const path = join(resolve(directory), 'private-manifest.json')
  const info = await stat(path)
  if (!info.isFile() || info.size > 65536) throw new Error('Invalid lab manifest')
  const manifest = JSON.parse(await readFile(path, 'utf8'))
  const fixture = manifest.labVersion === 1 && Array.isArray(manifest.cases)
    ? manifest.cases.find(item => item.id === expectedCase) : null
  if (!fixture || !/^[a-f0-9]{64}$/.test(fixture.expectedConfigKey)) throw new Error('Invalid lab case')
  if (!process.stdin.isTTY) throw new Error('Use an interactive terminal; do not put keys in shell arguments/history')
  const terminal = createInterface({ input: process.stdin, output: process.stdout })
  try {
    console.log('วาง Config Key จาก SEB ไฟล์ทดลองเท่านั้น (ไม่ใช่ Browser Exam Key และไม่ใช่ key production)')
    const copied = await terminal.question('Config Key: ')
    const matches = matchesCopiedConfigKey(fixture.expectedConfigKey, copied)
    console.log(matches ? 'MATCH: CK ตรงกับไฟล์ที่เลือก' : 'MISMATCH: CK ไม่ตรง หรือรูปแบบไม่ใช่ 64 hex')
    console.log('เป็นเพียงการเทียบข้อความที่คัดลอก ไม่ใช่การยืนยัน SEB จริงหรือสิทธิ์เข้าสอบ')
    if (!matches) process.exitCode = 1
  } finally { terminal.close() }
}
