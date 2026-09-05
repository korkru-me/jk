import { readLabConfig } from './files.mjs'
import { LabError, probeLab } from './client.mjs'

try {
  if (process.argv.length !== 3) throw new LabError('USAGE: npm run seb:phase2:probe -- .local/seb-phase2-REPLACE/connection.json')
  const result = await probeLab(await readLabConfig(process.argv[2]))
  console.log(JSON.stringify(result, null, 2))
  console.log('ตรวจเฉพาะ API ทดลอง ไม่ใช่ผลยืนยันตัวแอป SEB หรือนักเรียน และไม่ได้เปลี่ยน production')
} catch (error) {
  console.error(error instanceof LabError ? error.code : 'LAB_PROBE_FAILED')
  process.exitCode = 1
}
