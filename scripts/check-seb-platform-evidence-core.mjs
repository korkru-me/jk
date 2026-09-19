const REQUIRED_PLATFORM_IDS = ['macos', 'ipados', 'ios', 'windows']
const EVIDENCE_STATES = new Set(['passed', 'pending'])
const BEK_STATES = new Set(['registered', 'pending', 'unverified'])

function plainText(value, maxLength = 80) {
  return typeof value === 'string'
    && value.trim() === value
    && value.length > 0
    && value.length <= maxLength
}

/**
 * Validate non-secret release evidence. Raw CK/BEK/password/token/hash values
 * must never be stored in this manifest; only a review status belongs here.
 */
export function inspectSebPlatformEvidence(manifest) {
  const checks = []
  const platformRows = Array.isArray(manifest?.platforms) ? manifest.platforms : []
  const ids = platformRows.map(row => row?.id)
  const uniqueIds = new Set(ids)

  checks.push(manifest?.schemaVersion === 1
    ? { status: 'pass', field: 'schemaVersion', message: 'ใช้ schema 1' }
    : { status: 'blocker', field: 'schemaVersion', message: 'ต้องเป็น 1' })
  checks.push(plainText(manifest?.configId)
    ? { status: 'pass', field: 'configId', message: 'มีชื่อ config ที่ไม่ใช่ secret' }
    : { status: 'blocker', field: 'configId', message: 'ต้องมีชื่อ config แบบไม่เก็บ key/password' })

  if (uniqueIds.size !== ids.length) {
    checks.push({ status: 'blocker', field: 'platforms', message: 'platform id ต้องไม่ซ้ำ' })
  }

  for (const id of REQUIRED_PLATFORM_IDS) {
    const row = platformRows.find(candidate => candidate?.id === id)
    if (!row) {
      checks.push({ status: 'blocker', field: id, message: 'ไม่มีรายการ platform ที่ต้องรองรับ' })
      continue
    }

    const shapeReady = plainText(row.label)
      && plainText(row.osVersion)
      && plainText(row.sebVersion)
      && EVIDENCE_STATES.has(row.nativeCore)
      && BEK_STATES.has(row.productionBek)
      && EVIDENCE_STATES.has(row.stagingMockExam)
      && EVIDENCE_STATES.has(row.physicalUat)
    checks.push(shapeReady
      ? { status: 'pass', field: `${id} evidence`, message: 'รูปแบบหลักฐานครบ' }
      : { status: 'blocker', field: `${id} evidence`, message: 'ข้อมูลรุ่นหรือสถานะไม่ครบ/ไม่ถูกต้อง' })

    if (!shapeReady) continue
    const releaseReady = row.nativeCore === 'passed'
      && row.productionBek === 'registered'
      && row.stagingMockExam === 'passed'
      && row.physicalUat === 'passed'
    checks.push(releaseReady
      ? { status: 'pass', field: `${id} release gate`, message: 'หลักฐานครบสำหรับ config/build นี้' }
      : {
          status: 'blocker',
          field: `${id} release gate`,
          message: 'ยังขาด BEK verification, staging mock exam หรือ physical UAT อย่างน้อยหนึ่งรายการ',
        })
  }

  const forbiddenFields = []
  const visit = (value, path = '') => {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key
      const keyTokens = key
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
      const secretLike = ['ck', 'bek', 'key', 'password', 'secret', 'token', 'hash']
        .some(term => keyTokens.includes(term))
      if (secretLike && key !== 'productionBek') {
        forbiddenFields.push(childPath)
      }
      visit(child, childPath)
    }
  }
  visit(manifest)
  checks.push(forbiddenFields.length === 0
    ? { status: 'pass', field: 'secret hygiene', message: 'ไม่พบ field สำหรับ raw key/password/token/hash' }
    : { status: 'blocker', field: 'secret hygiene', message: 'manifest มี field ที่เสี่ยงเก็บข้อมูลลับ' })

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
    ? 'READY: every required platform passed the exact production-config gate.'
    : 'NOT READY: do not advertise every platform as production-ready yet.')
  return lines.join('\n')
}
