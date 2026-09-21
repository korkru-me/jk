const EXPECTED_MIGRATION = '20260921185046'
const PENDING_VERSION = 'record during phase 8 UAT'
const REQUIRED_SUITES = [
  ['iphone-safari', 'iPhone Safari drawing board'],
  ['ipad-safari-pencil', 'iPad Safari and Apple Pencil'],
  ['desktop-browsers', 'Desktop Safari and Chromium'],
  ['student-auth-storage-attachment', 'Student Auth Storage attachment flow'],
  ['teacher-auth-storage-board', 'Teacher Auth Storage board flow'],
  ['cross-account-authorization', 'Cross-account authorization boundaries'],
  ['qa-data-cleanup', 'Drawing board QA data cleanup'],
]
const TOP_LEVEL_FIELDS = new Set([
  'schemaVersion',
  'candidateId',
  'sourceRevision',
  'stagingBuild',
  'migrationVersion',
  'lockedAt',
  'suites',
])
const SUITE_FIELDS = new Set(['id', 'label', 'status', 'testedAt', 'testedVersion'])

function safeId(value, maxLength = 100) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
    && /^[A-Za-z0-9._-]+$/.test(value)
    && !value.includes('@')
    && !value.includes('://')
    && !/[a-f0-9]{48,}/i.test(value)
}

function validIsoTimestamp(value) {
  if (typeof value !== 'string' || value.length > 40) return false
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
}

export function inspectDrawingBoardUatEvidence(manifest) {
  const checks = []
  const suites = Array.isArray(manifest?.suites) ? manifest.suites : []
  const unknownTopFields = manifest && typeof manifest === 'object'
    ? Object.keys(manifest).filter(field => !TOP_LEVEL_FIELDS.has(field))
    : []

  checks.push(manifest?.schemaVersion === 1
    ? { status: 'pass', field: 'schemaVersion', message: 'ใช้ schema 1' }
    : { status: 'blocker', field: 'schemaVersion', message: 'ต้องเป็น 1' })
  checks.push(unknownTopFields.length === 0
    ? { status: 'pass', field: 'manifest schema', message: 'ไม่มี field นอก schema' }
    : { status: 'blocker', field: 'manifest schema', message: 'พบ field นอก schema' })

  const candidateReady = safeId(manifest?.candidateId) && manifest.candidateId !== 'pending'
  checks.push(candidateReady
    ? { status: 'pass', field: 'candidate id release gate', message: 'ล็อก candidate id แล้ว' }
    : { status: 'blocker', field: 'candidate id release gate', message: 'ยังไม่ได้ล็อก candidate id' })

  const revisionReady = typeof manifest?.sourceRevision === 'string'
    && /^[a-f0-9]{40}$/.test(manifest.sourceRevision)
  checks.push(revisionReady
    ? { status: 'pass', field: 'source revision release gate', message: 'ล็อก Git revision แล้ว' }
    : { status: 'blocker', field: 'source revision release gate', message: 'ยังไม่ได้ล็อก Git revision 40 ตัว' })

  const buildReady = safeId(manifest?.stagingBuild) && manifest.stagingBuild !== 'pending'
  checks.push(buildReady
    ? { status: 'pass', field: 'staging build release gate', message: 'ล็อก Staging build แล้ว' }
    : { status: 'blocker', field: 'staging build release gate', message: 'ยังไม่ได้ล็อก Staging build id' })

  checks.push(manifest?.migrationVersion === EXPECTED_MIGRATION
    ? { status: 'pass', field: 'migration release gate', message: 'ผูกกับ migration PNG path ที่ตรวจแล้ว' }
    : { status: 'blocker', field: 'migration release gate', message: 'migration version ไม่ตรงกับ candidate contract' })

  checks.push(validIsoTimestamp(manifest?.lockedAt)
    ? { status: 'pass', field: 'candidate lock release gate', message: 'มีเวลาล็อก candidate แบบ ISO UTC' }
    : { status: 'blocker', field: 'candidate lock release gate', message: 'ยังไม่มีเวลาล็อก candidate' })

  const suiteIds = suites.map(row => row?.id)
  const expectedIds = new Set(REQUIRED_SUITES.map(([id]) => id))
  checks.push(new Set(suiteIds).size === suiteIds.length
    && suiteIds.every(id => expectedIds.has(id))
    && suiteIds.length === REQUIRED_SUITES.length
    ? { status: 'pass', field: 'suite schema', message: 'ชุด UAT ครบและ id ไม่ซ้ำ' }
    : { status: 'blocker', field: 'suite schema', message: 'ชุด UAT ขาด เกิน หรือ id ซ้ำ' })

  for (const [id, label] of REQUIRED_SUITES) {
    const row = suites.find(candidate => candidate?.id === id)
    if (!row) continue
    const unknownFields = Object.keys(row).filter(field => !SUITE_FIELDS.has(field))
    const statusAllowed = ['pending', 'failed', 'passed'].includes(row.status)
    const pendingShape = row.status === 'pending'
      && row.testedAt === null
      && row.testedVersion === PENDING_VERSION
    const testedShape = ['failed', 'passed'].includes(row.status)
      && validIsoTimestamp(row.testedAt)
      && safeId(row.testedVersion)
      && row.testedVersion !== PENDING_VERSION
    const shapeReady = unknownFields.length === 0
      && row.label === label
      && statusAllowed
      && (pendingShape || testedShape)
    checks.push(shapeReady
      ? { status: 'pass', field: `${id} evidence`, message: 'รูปแบบหลักฐานครบ' }
      : { status: 'blocker', field: `${id} evidence`, message: 'หลักฐานไม่ครบหรือมี field นอก schema' })
    if (shapeReady) {
      checks.push(row.status === 'passed'
        ? { status: 'pass', field: `${id} release gate`, message: 'ยืนยันผลผ่านบน candidate เดียวกัน' }
        : { status: 'blocker', field: `${id} release gate`, message: 'ยังไม่มีผลผ่าน' })
    }
  }

  const cleanup = suites.find(row => row?.id === 'qa-data-cleanup')
  if (cleanup?.status === 'passed') {
    const prerequisites = suites.filter(row => expectedIds.has(row?.id) && row.id !== 'qa-data-cleanup')
    const allPassed = prerequisites.length === REQUIRED_SUITES.length - 1
      && prerequisites.every(row => row.status === 'passed' && validIsoTimestamp(row.testedAt))
    const latestPrerequisite = allPassed
      ? Math.max(...prerequisites.map(row => new Date(row.testedAt).getTime()))
      : Number.POSITIVE_INFINITY
    checks.push(allPassed && new Date(cleanup.testedAt).getTime() >= latestPrerequisite
      ? { status: 'pass', field: 'cleanup ordering', message: 'ล้างข้อมูลหลัง UAT ชุดอื่นครบ' }
      : { status: 'blocker', field: 'cleanup ordering', message: 'cleanup ต้องเกิดหลัง UAT ชุดอื่นผ่านครบ' })
  }

  return { ready: checks.every(check => check.status !== 'blocker'), checks }
}

export function formatDrawingBoardUatEvidenceReport(checks) {
  const blockers = checks.filter(check => check.status === 'blocker').length
  return [
    'Drawing board phase 8 UAT (fixed schema, no secrets or personal data)',
    '',
    ...checks.map(check => `[${check.status === 'pass' ? 'PASS' : 'BLOCKER'}] ${check.field}: ${check.message}`),
    '',
    blockers === 0
      ? 'READY: candidate and every required Drawing Board UAT suite passed.'
      : `NOT READY: ${blockers} Drawing Board release blocker(s).`,
  ].join('\n')
}
