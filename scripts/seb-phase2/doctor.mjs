import { spawnSync } from 'node:child_process'

// Read-only checks. Never invokes `open`, starts an engine, pulls or runs images.
const checks = [
  ['DOCKER_CLI', ['--version']],
  ['COMPOSE', ['compose', 'version']],
  ['DOCKER_ENGINE', ['info', '--format', '{{.ServerVersion}}']],
]
let ready = true
for (const [name, args] of checks) {
  const result = spawnSync('docker', args, { timeout: 5000, stdio: 'ignore' })
  const ok = !result.error && result.status === 0
  console.log(`${name}: ${ok ? 'AVAILABLE' : 'UNAVAILABLE'}`)
  ready &&= ok
}
console.log('การตรวจนี้ไม่ได้เปิด SEB หรือ Docker และยังไม่ยืนยันว่า server/native integration ผ่าน')
if (!ready) process.exitCode = 1
