const REQUIRED_PLATFORMS = Object.freeze([
  ['windows', 'Windows'],
  ['macos', 'macOS'],
  ['ipados', 'iPadOS'],
  ['ios', 'iPhone / iOS'],
])

const REQUIRED_CASES = Object.freeze([
  'opens-without-entry-password',
  'system-check',
  'autosave-reconnect-upload-submit',
  'quit-link-after-submit',
  'wrong-config-rejected',
  'modified-config-rejected',
  'wrong-quit-password-rejected',
  'normal-browser-rejected',
])

const TOP_LEVEL_FIELDS = new Set(['schemaVersion', 'candidate', 'platforms'])
const CANDIDATE_FIELDS = new Set([
  'candidateId',
  'sourceRevision',
  'stagingDeploymentId',
  'releaseCommitmentSha256',
  'lockedAt',
])
const PLATFORM_FIELDS = new Set([
  'id',
  'label',
  'sebVersion',
  'buildNumber',
  'osVersion',
  'cases',
])
const CASE_FIELDS = new Set(['id', 'status', 'testedAt'])
const CASE_STATES = new Set(['pending', 'failed', 'passed'])
const SAFE_ID = /^[A-Za-z0-9._-]{1,120}$/
const SAFE_METADATA = /^[A-Za-z0-9 ._()+/-]{1,80}$/
const SHA256 = /^[a-f0-9]{64}$/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/

function record(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return (prototype === Object.prototype || prototype === null)
      && Reflect.ownKeys(value).every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        return typeof key === 'string'
          && descriptor !== undefined
          && Object.hasOwn(descriptor, 'value')
          && descriptor.enumerable === true
      })
  } catch {
    return false
  }
}

function exactFields(value, fields) {
  return record(value)
    && Object.keys(value).length === fields.size
    && Object.keys(value).every(field => fields.has(field))
}

function exactIso(value) {
  if (typeof value !== 'string' || value.length > 40) return false
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
}

function safeMetadata(value) {
  return typeof value === 'string' && (value === 'pending' || SAFE_METADATA.test(value))
}

function candidateShapeReady(candidate) {
  return exactFields(candidate, CANDIDATE_FIELDS)
    && typeof candidate.candidateId === 'string'
    && (candidate.candidateId === 'pending' || SAFE_ID.test(candidate.candidateId))
    && (candidate.sourceRevision === 'pending' || SOURCE_REVISION.test(candidate.sourceRevision))
    && (candidate.stagingDeploymentId === 'pending'
      || DEPLOYMENT_ID.test(candidate.stagingDeploymentId))
    && (candidate.releaseCommitmentSha256 === 'pending'
      || SHA256.test(candidate.releaseCommitmentSha256))
    && (candidate.lockedAt === null || exactIso(candidate.lockedAt))
}

function candidateLocked(candidate) {
  return candidateShapeReady(candidate)
    && candidate.candidateId !== 'pending'
    && candidate.sourceRevision !== 'pending'
    && candidate.stagingDeploymentId !== 'pending'
    && candidate.releaseCommitmentSha256 !== 'pending'
    && exactIso(candidate.lockedAt)
}

function caseShapeReady(testCase, lockedAt) {
  if (!exactFields(testCase, CASE_FIELDS)
    || !REQUIRED_CASES.includes(testCase.id)
    || !CASE_STATES.has(testCase.status)) return false
  if (testCase.status === 'pending') return testCase.testedAt === null
  if (!exactIso(testCase.testedAt)) return false
  return lockedAt === null || Date.parse(testCase.testedAt) >= Date.parse(lockedAt)
}

function platformShapeReady(platform, lockedAt) {
  const expectedLabel = REQUIRED_PLATFORMS.find(([id]) => id === platform?.id)?.[1]
  if (!exactFields(platform, PLATFORM_FIELDS)
    || !REQUIRED_PLATFORMS.some(([id]) => id === platform.id)
    || platform.label !== expectedLabel
    || !safeMetadata(platform.sebVersion)
    || !safeMetadata(platform.buildNumber)
    || !safeMetadata(platform.osVersion)
    || !Array.isArray(platform.cases)
    || platform.cases.length !== REQUIRED_CASES.length) return false

  const ids = platform.cases.map(testCase => testCase?.id)
  return new Set(ids).size === REQUIRED_CASES.length
    && REQUIRED_CASES.every(id => ids.includes(id))
    && platform.cases.every(testCase => caseShapeReady(testCase, lockedAt))
}

function platformPassed(platform) {
  return platform.sebVersion !== 'pending'
    && platform.buildNumber !== 'pending'
    && platform.osVersion !== 'pending'
    && platform.cases.every(testCase => testCase.status === 'passed')
}

/** Validate fixed, non-secret physical UAT evidence for one assignment artifact. */
export function inspectSebPhysicalUatEvidence(manifest, { releaseCandidate } = {}) {
  const checks = []
  const candidate = manifest?.candidate
  const platforms = Array.isArray(manifest?.platforms) ? manifest.platforms : []

  checks.push(manifest?.schemaVersion === 1
    ? { status: 'pass', field: 'schemaVersion', message: 'ใช้ schema 1' }
    : { status: 'blocker', field: 'schemaVersion', message: 'ต้องเป็น 1' })
  checks.push(exactFields(manifest, TOP_LEVEL_FIELDS)
    ? { status: 'pass', field: 'evidence schema', message: 'fixed schema ถูกต้อง' }
    : { status: 'blocker', field: 'evidence schema', message: 'พบ field ขาดหรือเกิน schema' })

  const candidateShape = candidateShapeReady(candidate)
  checks.push(candidateShape
    ? { status: 'pass', field: 'candidate schema', message: 'candidate metadata ไม่มีข้อมูลลับ' }
    : { status: 'blocker', field: 'candidate schema', message: 'candidate metadata ไม่ถูกต้อง' })
  const locked = candidateLocked(candidate)
  checks.push(locked
    ? { status: 'pass', field: 'candidate lock release gate', message: 'ผูก source, deployment และ release commitment เดียวกันแล้ว' }
    : { status: 'blocker', field: 'candidate lock release gate', message: 'ยังไม่ได้ล็อก candidate เดียวสำหรับ physical UAT' })

  if (releaseCandidate !== undefined) {
    const linked = locked
      && candidate.candidateId === releaseCandidate?.candidateId
      && candidate.sourceRevision === releaseCandidate?.sourceRevision
      && candidate.stagingDeploymentId === releaseCandidate?.stagingBuild
    checks.push(linked
      ? { status: 'pass', field: 'release candidate linkage', message: 'หลักฐานอุปกรณ์ผูก candidate, source และ deployment เดียวกัน' }
      : { status: 'blocker', field: 'release candidate linkage', message: 'หลักฐานอุปกรณ์ไม่ตรง release candidate ที่ล็อกไว้' })
  }

  const platformIds = platforms.map(platform => platform?.id)
  const platformSetReady = platforms.length === REQUIRED_PLATFORMS.length
    && new Set(platformIds).size === REQUIRED_PLATFORMS.length
    && REQUIRED_PLATFORMS.every(([id]) => platformIds.includes(id))
  checks.push(platformSetReady
    ? { status: 'pass', field: 'platform set', message: 'มี Windows, macOS, iPadOS และ iOS ครบ' }
    : { status: 'blocker', field: 'platform set', message: 'platform ขาด ซ้ำ หรือเกิน schema' })

  for (const [id, label] of REQUIRED_PLATFORMS) {
    const platform = platforms.find(row => row?.id === id)
    if (!platform) continue
    const shapeReady = platformShapeReady(platform, locked ? candidate.lockedAt : null)
    checks.push(shapeReady
      ? { status: 'pass', field: `${id} evidence schema`, message: 'build และ 8 test cases ครบ' }
      : { status: 'blocker', field: `${id} evidence schema`, message: 'build หรือ test case ไม่ตรง fixed schema' })
    if (!shapeReady) continue
    checks.push(locked && platformPassed(platform)
      ? { status: 'pass', field: `${id} physical release gate`, message: `${label} ผ่านทุกเคสบน candidate เดียวกัน` }
      : { status: 'blocker', field: `${id} physical release gate`, message: `${label} ยังมี build หรือ test case ที่ไม่ผ่าน` })
  }

  return { ready: checks.every(check => check.status !== 'blocker'), checks }
}

export function formatSebPhysicalUatReport(checks) {
  const lines = [
    'SEB Phase S6 physical UAT evidence (no secrets)',
    '',
    ...checks.map(check => `[${check.status === 'pass' ? 'PASS' : 'BLOCKER'}] ${check.field}: ${check.message}`),
  ]
  const blockers = checks.filter(check => check.status === 'blocker').length
  lines.push('', blockers === 0
    ? 'READY: physical UAT ผ่านครบสี่ระบบบน assignment artifact candidate เดียวกัน'
    : `NOT READY: ${blockers} physical UAT blocker(s).`)
  return lines.join('\n')
}

const CASE_INSTRUCTIONS = Object.freeze({
  'opens-without-entry-password': 'เปิดไฟล์ candidate และยืนยันว่าไม่ถาม Exam/Settings Password ก่อนถึง KorKru',
  'system-check': 'เข้าสู่ระบบด้วยบัญชีสังเคราะห์และทำ SEB system check ให้ผ่าน',
  'autosave-reconnect-upload-submit': 'ทำข้อสอบจำลอง ทดสอบ autosave, ตัดต่อเครือข่าย, resume, อัปโหลด และ submit',
  'quit-link-after-submit': 'หลังส่งสำเร็จ กดทางออกของ KorKru และยืนยันว่า native SEB ปิดโดยไม่ถามรหัส',
  'wrong-config-rejected': 'เปิดไฟล์ SEB คนละ revision และยืนยันว่า system check ถูกปฏิเสธ',
  'modified-config-rejected': 'ใช้สำเนาที่แก้ค่าอย่างน้อยหนึ่งจุดโดยไม่แตะไฟล์ candidate แล้วให้ system check ปฏิเสธ',
  'wrong-quit-password-rejected': 'ก่อนส่ง ลองรหัสออกที่ผิดและยืนยันว่า SEB ไม่ปิด จากนั้นใช้รหัสจริงเฉพาะเมื่อจำเป็น',
  'normal-browser-rejected': 'เปิดเส้นทางเริ่มสอบใน browser ปกติและยืนยันว่าเริ่ม attempt แบบ SEB ไม่ได้',
})

/** Return exactly one safe manual action for a sequential S6 run. */
export function nextSebPhysicalUatStep(manifest) {
  const inspection = inspectSebPhysicalUatEvidence(manifest)
  const shapeBroken = inspection.checks.some(check => check.status === 'blocker'
    && !check.field.endsWith('release gate'))
  if (shapeBroken) {
    return {
      complete: false,
      id: 'repair-evidence-schema',
      title: 'ซ่อมไฟล์หลักฐานเฟส 6 ก่อน',
      instruction: 'รัน npm run check:seb-physical-uat แล้วแก้เฉพาะ fixed metadata ห้ามใส่ CK, BEK, password, token หรือข้อมูลนักเรียน',
    }
  }
  if (!candidateLocked(manifest.candidate)) {
    return {
      complete: false,
      id: 'lock-assignment-artifact-candidate',
      title: 'ล็อก assignment artifact candidate เดียวก่อน',
      instruction: 'สร้าง fixture สังเคราะห์ระยะยาว เก็บ BEK ทุก build ก่อน immutable registration แล้วบันทึกเฉพาะ source revision, deployment id และ release commitment ที่ไม่เป็นความลับ',
    }
  }
  for (const [platformId, label] of REQUIRED_PLATFORMS) {
    const platform = manifest.platforms.find(row => row.id === platformId)
    if ([platform.sebVersion, platform.buildNumber, platform.osVersion].includes('pending')) {
      return {
        complete: false,
        id: `${platformId}-record-build`,
        title: `บันทึกรุ่นจริงของ ${label}`,
        instruction: 'บันทึกเฉพาะ OS, SEB version และ build number ที่ไม่เป็นความลับ ห้ามส่งภาพ CK/BEK หรือรหัสผ่าน',
      }
    }
    for (const testCase of platform.cases) {
      if (testCase.status !== 'passed') {
        return {
          complete: false,
          id: `${platformId}-${testCase.id}`,
          title: `${label}: ${testCase.id}`,
          instruction: CASE_INSTRUCTIONS[testCase.id],
        }
      }
    }
  }
  return {
    complete: true,
    id: 'complete',
    title: 'Physical UAT ครบสี่ระบบแล้ว',
    instruction: 'รัน regression และ aggregate npm run check:seb-platforms ก่อนออก candidate ใหม่ โดยยังไม่เริ่มเฟส S7',
  }
}

export function formatNextSebPhysicalUatStep(result) {
  return [
    result.complete ? 'SEB Phase S6 next step: COMPLETE' : 'SEB Phase S6 next step',
    '',
    result.title,
    result.instruction,
  ].join('\n')
}

export const sebPhysicalUatCaseIds = REQUIRED_CASES
