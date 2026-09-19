/**
 * Combine the evidence gates that require external state. Code regression
 * remains a CI/local command and is intentionally not represented by a stale
 * boolean in a committed manifest.
 */
export function inspectExamReleaseReadiness({
  stagingReady,
  releaseCandidateReady,
  sebPlatformsReady,
  externalUatReady,
}) {
  const checks = [
    stagingReady
      ? { status: 'pass', field: 'authenticated staging', message: 'staging isolation preflight ผ่าน' }
      : { status: 'blocker', field: 'authenticated staging', message: 'ยังไม่มี staging แยกที่ผ่าน isolation preflight' },
    releaseCandidateReady
      ? { status: 'pass', field: 'release candidate', message: 'code, staging build, UAT run และ SEB config ผูกเป็น candidate เดียวกัน' }
      : { status: 'blocker', field: 'release candidate', message: 'ยังไม่ได้ล็อก revision/build หรือหลักฐานมาจากคนละ candidate' },
    sebPlatformsReady
      ? { status: 'pass', field: 'SEB platforms', message: 'ทุก platform ผ่าน production-config evidence gate' }
      : { status: 'blocker', field: 'SEB platforms', message: 'หลักฐาน BEK, staging mock exam หรือ physical UAT ยังไม่ครบทุก platform' },
    externalUatReady
      ? { status: 'pass', field: 'external UAT suites', message: 'responsive, authenticated, recovery และ cleanup evidence ครบ' }
      : { status: 'blocker', field: 'external UAT suites', message: 'หลักฐาน responsive, authenticated, recovery หรือ cleanup ยังไม่ครบ' },
  ]
  return { ready: checks.every(check => check.status !== 'blocker'), checks }
}

export function formatExamReleaseReadinessReport(checks) {
  const lines = [
    'Exam release gate (read-only, no secrets)',
    'รัน test/typecheck/build แยกต่างหาก; รายงานนี้ตรวจเฉพาะ external release evidence',
    '',
    ...checks.map(check => `[${check.status === 'pass' ? 'PASS' : 'BLOCKER'}] ${check.field}: ${check.message}`),
  ]
  const blockers = checks.filter(check => check.status === 'blocker').length
  lines.push('', blockers === 0
    ? 'READY: external release evidence is complete.'
    : `NOT READY: ${blockers} external release blocker(s); follow docs/EXAM_RELEASE_UAT.md.`)
  return lines.join('\n')
}
