const REQUIRED_SUITE_IDS = [
  'iphone-responsive',
  'ipad-responsive',
  'mac-responsive',
  'windows-responsive',
  'authenticated-exam',
  'recovery-proctor',
  'qa-data-cleanup',
]
const ALLOWED_TOP_LEVEL_FIELDS = new Set(['schemaVersion', 'runId', 'suites'])
const ALLOWED_SUITE_FIELDS = new Set(['id', 'label', 'status', 'testedAt', 'testedVersion'])
const REQUIRED_LABELS = {
  'iphone-responsive': 'iPhone responsive UI',
  'ipad-responsive': 'iPad responsive UI',
  'mac-responsive': 'Mac responsive UI',
  'windows-responsive': 'Windows responsive UI',
  'authenticated-exam': 'Authenticated staging exam',
  'recovery-proctor': 'Recovery and proctor drill',
  'qa-data-cleanup': 'QA data cleanup',
}

function plainText(value, maxLength = 100) {
  return typeof value === 'string'
    && value.trim() === value
    && value.length > 0
    && value.length <= maxLength
}

function validIsoTimestamp(value) {
  if (!plainText(value, 40)) return false
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
}

function safeVersionMetadata(value) {
  return plainText(value)
    && !value.includes('://')
    && !value.includes('@')
    && !/[a-f0-9]{48,}/i.test(value)
}

/**
 * Validate only non-sensitive UAT metadata. The fixed schema deliberately has
 * no free-text notes, account identifiers, URLs, file paths or secret fields.
 */
export function inspectExamUatEvidence(manifest) {
  const checks = []
  const suites = Array.isArray(manifest?.suites) ? manifest.suites : []
  const topLevelFields = manifest && typeof manifest === 'object'
    ? Object.keys(manifest)
    : []
  const unknownTopLevelFields = topLevelFields.filter(field => !ALLOWED_TOP_LEVEL_FIELDS.has(field))

  checks.push(manifest?.schemaVersion === 1
    ? { status: 'pass', field: 'schemaVersion', message: 'ใช้ schema 1' }
    : { status: 'blocker', field: 'schemaVersion', message: 'ต้องเป็น 1' })
  checks.push(plainText(manifest?.runId, 80) && /^[A-Za-z0-9._-]+$/.test(manifest.runId)
    ? { status: 'pass', field: 'runId', message: 'มีชื่อรอบ UAT ที่ไม่ใช่ข้อมูลลับ' }
    : { status: 'blocker', field: 'runId', message: 'ต้องมีชื่อรอบ UAT แบบสั้น' })
  checks.push(unknownTopLevelFields.length === 0
    ? { status: 'pass', field: 'top-level schema', message: 'ไม่มี field นอก schema' }
    : { status: 'blocker', field: 'top-level schema', message: 'พบ field นอก schema ที่อาจเก็บข้อมูลไม่เหมาะสม' })

  const ids = suites.map(row => row?.id)
  if (new Set(ids).size !== ids.length) {
    checks.push({ status: 'blocker', field: 'suites', message: 'suite id ต้องไม่ซ้ำ' })
  }
  const unexpectedSuiteIds = ids.filter(id => !REQUIRED_SUITE_IDS.includes(id))
  checks.push(unexpectedSuiteIds.length === 0
    ? { status: 'pass', field: 'suite schema', message: 'ไม่มี suite นอก schema' }
    : { status: 'blocker', field: 'suite schema', message: 'พบ suite นอก schema ที่อาจเก็บข้อมูลไม่เหมาะสม' })

  for (const id of REQUIRED_SUITE_IDS) {
    const row = suites.find(candidate => candidate?.id === id)
    if (!row) {
      checks.push({ status: 'blocker', field: id, message: 'ไม่มีรายการ UAT ที่จำเป็น' })
      continue
    }

    const unknownFields = Object.keys(row).filter(field => !ALLOWED_SUITE_FIELDS.has(field))
    const statusReady = row.status === 'pending' || row.status === 'passed'
    const shapeReady = unknownFields.length === 0
      && row.label === REQUIRED_LABELS[id]
      && statusReady
      && safeVersionMetadata(row.testedVersion)
      && (row.testedAt === null || validIsoTimestamp(row.testedAt))
    checks.push(shapeReady
      ? { status: 'pass', field: `${id} evidence`, message: 'รูปแบบหลักฐานครบและไม่มี free text' }
      : { status: 'blocker', field: `${id} evidence`, message: 'ข้อมูลไม่ครบ, เวลาไม่ใช่ ISO หรือมี field นอก schema' })

    if (!shapeReady) continue
    const releaseReady = row.status === 'passed'
      && validIsoTimestamp(row.testedAt)
      && row.testedVersion !== 'record during final UAT'
    checks.push(releaseReady
      ? { status: 'pass', field: `${id} release gate`, message: 'มีผลผ่านและรุ่นที่ทดสอบ' }
      : { status: 'blocker', field: `${id} release gate`, message: 'ยังไม่ได้ยืนยันผลผ่านพร้อมวันและรุ่นที่ทดสอบ' })
  }

  return { ready: checks.every(check => check.status !== 'blocker'), checks }
}

export function formatExamUatEvidenceReport(checks) {
  const lines = [
    'Exam UAT evidence (fixed schema, no secrets or personal data)',
    '',
    ...checks.map(check => `[${check.status === 'pass' ? 'PASS' : 'BLOCKER'}] ${check.field}: ${check.message}`),
  ]
  const blockers = checks.filter(check => check.status === 'blocker').length
  lines.push('', blockers === 0
    ? 'READY: every required external UAT suite has evidence.'
    : `NOT READY: ${blockers} UAT evidence blocker(s).`)
  return lines.join('\n')
}
