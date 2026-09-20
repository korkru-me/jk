import { parseEnvFile } from './check-seb-readiness-core.mjs'
import { inspectExamStagingReadiness } from './check-exam-staging-readiness-core.mjs'
import { inspectExamUatEvidence } from './check-exam-uat-evidence-core.mjs'
import { inspectSebPlatformEvidence } from './check-seb-platform-evidence-core.mjs'
import { inspectExamReleaseCandidate } from './check-exam-release-candidate-core.mjs'

const RESPONSIVE_STEPS = [
  ['iphone-responsive', 'ทดสอบหน้าข้อสอบบน iPhone จริง'],
  ['ipad-responsive', 'ทดสอบหน้าข้อสอบบน iPad จริง'],
  ['mac-responsive', 'ทดสอบหน้าข้อสอบบน Mac/Safari จริง'],
  ['windows-responsive', 'ทดสอบหน้าข้อสอบบน Windows จริง'],
]
const SEB_PLATFORM_ORDER = [
  ['macos', 'macOS'],
  ['ipados', 'iPadOS'],
  ['ios', 'iPhone / iOS'],
  ['windows', 'Windows'],
]

/** Accept a local env file, injected environment variables, or both. */
export function inspectNextExamUatStagingEnvironment(contents = '', environment = {}) {
  const parsed = parseEnvFile(contents, environment)
  return {
    ready: parsed.warnings.length === 0
      && inspectExamStagingReadiness({ ...parsed.values, ...environment }).ready,
  }
}

function hasShapeBlocker(inspection) {
  return inspection.checks.some(check => check.status === 'blocker'
    && !check.field.endsWith(' release gate')
    && check.field !== 'qa-data-cleanup ordering')
}

function suitePassed(manifest, id) {
  return manifest?.suites?.find(row => row?.id === id)?.status === 'passed'
}

function sebPlatformReady(row) {
  return row?.nativeCore === 'passed'
    && row?.productionBek === 'registered'
    && row?.stagingMockExam === 'passed'
    && row?.physicalUat === 'passed'
}

function step(id, title, instruction) {
  return { complete: false, id, title, instruction }
}

/** Return exactly one safe next action so a long UAT run stays sequential. */
export function nextExamUatStep({ stagingReady, candidateManifest, uatManifest, sebManifest }) {
  const uatInspection = inspectExamUatEvidence(uatManifest)
  if (hasShapeBlocker(uatInspection)) {
    return step(
      'repair-uat-evidence',
      'ซ่อมไฟล์สถานะ UAT ก่อน',
      'รัน npm run check:exam-uat แล้วแก้เฉพาะรูปแบบที่ตัวตรวจระบุ ห้ามเติมข้อมูลลับหรือข้อมูลนักเรียน',
    )
  }

  const sebInspection = inspectSebPlatformEvidence(sebManifest)
  if (hasShapeBlocker(sebInspection)) {
    return step(
      'repair-seb-evidence',
      'ซ่อมไฟล์สถานะ SEB ก่อน',
      'รัน npm run check:seb-platforms แล้วแก้เฉพาะรูปแบบที่ตัวตรวจระบุ ห้ามใส่ CK, BEK หรือรหัสผ่าน',
    )
  }

  const candidateInspection = inspectExamReleaseCandidate(candidateManifest, {
    uatRunId: uatManifest?.runId,
    sebConfigId: sebManifest?.configId,
  })
  const candidateShapeBroken = candidateInspection.checks.some(check => check.status === 'blocker'
    && !check.field.endsWith(' release gate'))
  if (candidateShapeBroken) {
    return step(
      'repair-release-candidate',
      'ซ่อมไฟล์ release candidate ก่อน',
      'รัน npm run check:exam-candidate แล้วแก้เฉพาะรูปแบบ/การเชื่อม id ห้ามใส่ URL, credential หรือ key',
    )
  }

  if (!stagingReady) {
    return step(
      'prepare-staging',
      'สร้าง staging แยกจาก production',
      'ตั้ง Vercel Preview และ Supabase project สำหรับ QA แล้วให้ npm run check:exam-staging ผ่านก่อนสร้างบัญชีจำลอง',
    )
  }


  if (!candidateInspection.ready) {
    return step(
      'lock-release-candidate',
      'ล็อก code และ staging build ที่จะใช้ทดสอบ',
      'บันทึก Git revision, staging build id และเวลา ISO ใน config/exam-release-candidate.json แล้วห้ามเปลี่ยน code/config ระหว่าง UAT',
    )
  }

  for (const [id, title] of RESPONSIVE_STEPS) {
    if (!suitePassed(uatManifest, id)) {
      return step(id, title, 'ทำตามหัวข้อหน้าจอจริงใน docs/EXAM_RELEASE_UAT.md แล้วบันทึกเฉพาะวันและรุ่นที่ไม่เป็นความลับ')
    }
  }

  if (!suitePassed(uatManifest, 'authenticated-exam')) {
    return step(
      'authenticated-exam',
      'ทดสอบข้อสอบจริงด้วยบัญชีจำลองบน staging',
      'ใช้ครูและนักเรียนจำลองคนละบัญชี ตรวจเริ่มสอบ บันทึก ส่ง ตรวจผล และสิทธิ์ข้ามบัญชี',
    )
  }

  if (!suitePassed(uatManifest, 'recovery-proctor')) {
    return step(
      'recovery-proctor',
      'ซ้อมเน็ตหลุดและหน้าคุมสอบบน staging',
      'ทำตาม docs/EXAM_RECOVERY_QA.md โดยใช้ข้อมูลจำลองและไม่บังคับปิดเครื่อง',
    )
  }

  for (const [id, label] of SEB_PLATFORM_ORDER) {
    const row = sebManifest?.platforms?.find(candidate => candidate?.id === id)
    if (!sebPlatformReady(row)) {
      return step(
        `seb-${id}`,
        `ปิด release gate ของ SEB บน ${label}`,
        'ใช้ production config เดียวกับที่จะเปิดขาย ทดสอบบน staging และอัปเดตเพียงสถานะ/รุ่น ห้ามบันทึก CK, BEK หรือรหัส',
      )
    }
  }

  if (!suitePassed(uatManifest, 'qa-data-cleanup')) {
    return step(
      'qa-data-cleanup',
      'ล้างข้อมูล QA เป็นขั้นตอนสุดท้าย',
      'ลบบัญชี attempt คำตอบและไฟล์จำลอง ตรวจว่าไม่ค้าง แล้วบันทึกเวลา cleanup หลังผล UAT อื่นทั้งหมด',
    )
  }

  if (!uatInspection.ready) {
    return step(
      'repair-uat-ordering',
      'แก้ลำดับเวลาหลักฐาน cleanup',
      'ทดสอบ cleanup ใหม่หลัง suite อื่นทั้งหมด แล้วบันทึก testedAt ใหม่ตามเวลาจริง',
    )
  }

  return {
    complete: true,
    id: 'complete',
    title: 'หลักฐาน UAT ภายนอกครบแล้ว',
    instruction: 'รัน npm run check:exam-release และ regression/build จาก release candidate เดียวกันก่อนอนุมัติ production',
  }
}

export function formatNextExamUatStep(result) {
  return [
    result.complete ? 'Exam UAT next step: COMPLETE' : 'Exam UAT next step',
    '',
    result.title,
    result.instruction,
  ].join('\n')
}
