const ALLOWED_FIELDS = new Set([
  'schemaVersion',
  'candidateId',
  'sourceRevision',
  'stagingBuild',
  'sebConfigId',
  'lockedAt',
])

function safeId(value, maxLength = 100) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
    && /^[A-Za-z0-9._-]+$/.test(value)
}

function safeBuildMetadata(value) {
  return safeId(value)
    && !value.includes('@')
    && !/[a-f0-9]{48,}/i.test(value)
}

function validIsoTimestamp(value) {
  if (typeof value !== 'string' || value.length > 40) return false
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
}

/**
 * Bind external evidence to one frozen code revision, staging deployment and
 * SEB config without storing a URL, credential, key or free-text note.
 */
export function inspectExamReleaseCandidate(manifest, { uatRunId, sebConfigId } = {}) {
  const checks = []
  const fields = manifest && typeof manifest === 'object' ? Object.keys(manifest) : []
  const unknownFields = fields.filter(field => !ALLOWED_FIELDS.has(field))

  checks.push(manifest?.schemaVersion === 1
    ? { status: 'pass', field: 'schemaVersion', message: 'ใช้ schema 1' }
    : { status: 'blocker', field: 'schemaVersion', message: 'ต้องเป็น 1' })
  checks.push(unknownFields.length === 0
    ? { status: 'pass', field: 'candidate schema', message: 'ไม่มี field นอก schema' }
    : { status: 'blocker', field: 'candidate schema', message: 'พบ field นอก schema ที่อาจเก็บข้อมูลไม่เหมาะสม' })
  checks.push(safeId(manifest?.candidateId)
    ? { status: 'pass', field: 'candidateId evidence', message: 'รูปแบบ candidate id ถูกต้อง' }
    : { status: 'blocker', field: 'candidateId evidence', message: 'candidate id ต้องเป็น metadata สั้นที่ไม่เป็นความลับ' })
  checks.push(safeId(manifest?.sebConfigId)
    ? { status: 'pass', field: 'SEB config evidence', message: 'รูปแบบ SEB config id ถูกต้อง' }
    : { status: 'blocker', field: 'SEB config evidence', message: 'SEB config id ต้องเป็น metadata สั้นที่ไม่เป็นความลับ' })

  const sourceReady = typeof manifest?.sourceRevision === 'string'
    && /^[a-f0-9]{40}$/.test(manifest.sourceRevision)
  checks.push(sourceReady
    ? { status: 'pass', field: 'source revision release gate', message: 'ล็อก source revision แล้ว' }
    : { status: 'blocker', field: 'source revision release gate', message: 'ยังไม่ได้ล็อก Git revision 40 ตัวของ code candidate' })

  const stagingBuildReady = safeBuildMetadata(manifest?.stagingBuild)
    && manifest.stagingBuild !== 'pending'
  checks.push(stagingBuildReady
    ? { status: 'pass', field: 'staging build release gate', message: 'ล็อก staging build id แล้ว' }
    : { status: 'blocker', field: 'staging build release gate', message: 'ยังไม่ได้ล็อก staging build id ที่ไม่ใช่ URL/secret' })

  const lockedAtReady = validIsoTimestamp(manifest?.lockedAt)
  checks.push(lockedAtReady
    ? { status: 'pass', field: 'candidate lock release gate', message: 'มีเวลาล็อก candidate แบบ ISO UTC' }
    : { status: 'blocker', field: 'candidate lock release gate', message: 'ยังไม่มีเวลาล็อก candidate แบบ ISO UTC' })

  checks.push(safeId(uatRunId) && manifest?.candidateId === uatRunId
    ? { status: 'pass', field: 'UAT candidate linkage', message: 'UAT run ผูกกับ candidate เดียวกัน' }
    : { status: 'blocker', field: 'UAT candidate linkage', message: 'candidate id ต้องตรงกับ UAT run id' })
  checks.push(safeId(sebConfigId) && manifest?.sebConfigId === sebConfigId
    ? { status: 'pass', field: 'SEB candidate linkage', message: 'SEB evidence ผูกกับ config เดียวกัน' }
    : { status: 'blocker', field: 'SEB candidate linkage', message: 'SEB config id ต้องตรงกับ platform evidence' })

  return { ready: checks.every(check => check.status !== 'blocker'), checks }
}

export function formatExamReleaseCandidateReport(checks) {
  const lines = [
    'Exam release candidate (fixed schema, no secrets)',
    '',
    ...checks.map(check => `[${check.status === 'pass' ? 'PASS' : 'BLOCKER'}] ${check.field}: ${check.message}`),
  ]
  const blockers = checks.filter(check => check.status === 'blocker').length
  lines.push('', blockers === 0
    ? 'READY: UAT evidence is bound to one release candidate.'
    : `NOT READY: ${blockers} release-candidate blocker(s).`)
  return lines.join('\n')
}
