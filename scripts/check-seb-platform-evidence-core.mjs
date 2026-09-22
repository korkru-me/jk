const REQUIRED_PLATFORM_IDS = ['macos', 'ipados', 'ios', 'windows']
const TOP_LEVEL_FIELDS = new Set(['schemaVersion', 'configId', 'configRevision', 'platforms'])
const PLATFORM_FIELDS = new Set([
  'id',
  'label',
  'buildId',
  'nativeCore',
  'productionBek',
  'stagingMockExam',
  'physicalUat',
])
const EVIDENCE_STATES = new Set(['passed', 'pending'])
const BEK_STATES = new Set(['registered', 'pending', 'unverified'])

function plainText(value, maxLength = 120) {
  return typeof value === 'string'
    && value.trim() === value
    && value.length > 0
    && value.length <= maxLength
}

function safeId(value, maxLength = 120) {
  return plainText(value, maxLength) && /^[A-Za-z0-9._-]+$/.test(value)
}

function exactFields(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === allowed.size
    && Object.keys(value).every(field => allowed.has(field))
}

/**
 * Validate non-secret release evidence and bind every row to a build in the
 * immutable config revision. Raw CK/BEK/password values must never appear.
 */
export function inspectSebPlatformEvidence(manifest, { releaseRegistry } = {}) {
  const checks = []
  const platformRows = Array.isArray(manifest?.platforms) ? manifest.platforms : []
  const ids = platformRows.map(row => row?.id)
  const uniqueIds = new Set(ids)

  checks.push(manifest?.schemaVersion === 2
    ? { status: 'pass', field: 'schemaVersion', message: 'ใช้ schema 2' }
    : { status: 'blocker', field: 'schemaVersion', message: 'ต้องเป็น 2' })
  checks.push(exactFields(manifest, TOP_LEVEL_FIELDS)
    ? { status: 'pass', field: 'evidence schema', message: 'fixed schema ถูกต้อง' }
    : { status: 'blocker', field: 'evidence schema', message: 'พบ field ขาด/เกิน schema' })
  checks.push(safeId(manifest?.configId)
    ? { status: 'pass', field: 'configId', message: 'มีชื่อ config ที่ไม่ใช่ secret' }
    : { status: 'blocker', field: 'configId', message: 'ต้องมีชื่อ config แบบไม่เก็บ key/password' })
  checks.push(safeId(manifest?.configRevision)
    ? { status: 'pass', field: 'configRevision', message: 'มี immutable config revision' }
    : { status: 'blocker', field: 'configRevision', message: 'ต้องมี config revision แบบ fixed metadata' })

  const revisions = Array.isArray(releaseRegistry?.revisions) ? releaseRegistry.revisions : []
  const revision = revisions.find(row => row?.revision === manifest?.configRevision)
  const registryLinked = revision?.configId === manifest?.configId
    && releaseRegistry?.candidateRevision === manifest?.configRevision
  checks.push(registryLinked
    ? { status: 'pass', field: 'release registry linkage', message: 'evidence ผูก candidate revision เดียวกัน' }
    : { status: 'blocker', field: 'release registry linkage', message: 'config id/revision ไม่ตรง candidate ใน registry' })

  if (uniqueIds.size !== ids.length) {
    checks.push({ status: 'blocker', field: 'platforms', message: 'platform id ต้องไม่ซ้ำ' })
  }

  for (const id of REQUIRED_PLATFORM_IDS) {
    const row = platformRows.find(candidate => candidate?.id === id)
    if (!row) {
      checks.push({ status: 'blocker', field: id, message: 'ไม่มีรายการ platform ที่ต้องรองรับ' })
      continue
    }

    const build = Array.isArray(revision?.builds)
      ? revision.builds.find(candidate => candidate?.id === row.buildId && candidate?.target === id)
      : null
    const shapeReady = exactFields(row, PLATFORM_FIELDS)
      && plainText(row.label)
      && safeId(row.buildId)
      && EVIDENCE_STATES.has(row.nativeCore)
      && BEK_STATES.has(row.productionBek)
      && EVIDENCE_STATES.has(row.stagingMockExam)
      && EVIDENCE_STATES.has(row.physicalUat)
    checks.push(shapeReady
      ? { status: 'pass', field: `${id} evidence`, message: 'รูปแบบหลักฐานครบ' }
      : { status: 'blocker', field: `${id} evidence`, message: 'ข้อมูลสถานะหรือ fixed schema ไม่ถูกต้อง' })
    checks.push(build
      ? { status: 'pass', field: `${id} build linkage`, message: 'build id ตรงกับ config revision' }
      : { status: 'blocker', field: `${id} build linkage`, message: 'build id ไม่อยู่ใน config revision นี้' })

    if (!shapeReady || !build) continue
    const releaseReady = build.approval === 'approved'
      && row.nativeCore === 'passed'
      && row.productionBek === 'registered'
      && row.stagingMockExam === 'passed'
      && row.physicalUat === 'passed'
    checks.push(releaseReady
      ? { status: 'pass', field: `${id} release gate`, message: 'หลักฐานครบสำหรับ exact config/build นี้' }
      : {
          status: 'blocker',
          field: `${id} release gate`,
          message: 'build ยังไม่อนุมัติหรือยังขาด BEK, staging mock exam, physical UAT',
        })
  }

  const unexpectedRows = platformRows.filter(row => !REQUIRED_PLATFORM_IDS.includes(row?.id))
  checks.push(platformRows.length === REQUIRED_PLATFORM_IDS.length && unexpectedRows.length === 0
    ? { status: 'pass', field: 'platform schema', message: 'ไม่มี platform นอก schema' }
    : { status: 'blocker', field: 'platform schema', message: 'platform ต้องมีเฉพาะ target ที่กำหนดและครบสี่รายการ' })

  return { ready: checks.every(check => check.status !== 'blocker'), checks }
}

export function formatSebPlatformEvidenceReport(checks) {
  const labels = { pass: 'PASS', blocker: 'BLOCKER', warning: 'WARNING' }
  const lines = [
    'SEB platform release evidence (no secrets)',
    '',
    ...checks.map(check => `[${labels[check.status]}] ${check.field}: ${check.message}`),
  ]
  const blockers = checks.filter(check => check.status === 'blocker').length
  const passed = checks.filter(check => check.status === 'pass').length
  lines.push('', `Summary: ${passed} passed, ${blockers} blocker(s).`)
  lines.push(blockers === 0
    ? 'READY: every required platform passed the exact config revision/build gate.'
    : 'NOT READY: do not advertise every platform as production-ready yet.')
  return lines.join('\n')
}
