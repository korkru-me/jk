import { inspectExamStagingReadiness } from './check-exam-staging-readiness-core.mjs'

const OFFICIAL_STAGING_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const WRITE_CONFIRMATION = 'CONFIRM_SYNTHETIC_SEB_STAGING_WRITE'
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const FORBIDDEN_RUN_ID_TERMS = /(prod(?:uction)?|live|real|customer)/
const MODES = new Set(['inspect', 'execute'])
const EVIDENCE_STATES = new Set(['pending', 'passed', 'failed'])
const ISSUED_PLANS = new WeakSet()

const FIXTURE = Object.freeze({
  policy: 'synthetic-only',
  credentials: 'runtime-only',
  entities: Object.freeze([
    Object.freeze({
      kind: 'teacher',
      aliases: Object.freeze(['teacher-primary', 'teacher-unrelated']),
      count: 2,
    }),
    Object.freeze({
      kind: 'student',
      aliases: Object.freeze(['student-primary', 'student-secondary']),
      count: 2,
    }),
    Object.freeze({ kind: 'classroom', alias: 'classroom-primary', count: 1, classroomType: 'subject' }),
    Object.freeze({
      kind: 'question',
      aliases: Object.freeze(['question-written', 'question-upload']),
      count: 2,
      questionTypes: Object.freeze(['essay', 'file_upload']),
    }),
    Object.freeze({
      kind: 'assignment',
      alias: 'assignment-primary',
      count: 1,
      assignmentType: 'exam',
      secureBrowserMode: 'seb_required',
      initialStatus: 'draft',
      entryPassword: 'forbidden',
      quitPassword: 'teacher-owned-runtime-secret',
      questionAliases: Object.freeze(['question-written', 'question-upload']),
    }),
  ]),
})

const STEPS = Object.freeze([
  step('verify-staging-isolation', 'preflight', 'harness', false, [],
    'ยืนยัน Staging badge, origin และ Supabase isolation โดยไม่เรียก network'),
  step('provision-synthetic-teacher', 'fixture', 'fixture-admin', true, ['verify-staging-isolation'],
    'สร้างบัญชีครูเจ้าของสังเคราะห์โดยไม่คืน credential ในผลลัพธ์'),
  step('provision-unrelated-teacher', 'fixture', 'fixture-admin', true, ['provision-synthetic-teacher'],
    'สร้างบัญชีครูสังเคราะห์ที่ไม่เกี่ยวข้องเพื่อทดสอบ horizontal isolation'),
  step('provision-synthetic-student', 'fixture', 'fixture-admin', true, ['provision-unrelated-teacher'],
    'สร้างบัญชีนักเรียนหลักสังเคราะห์โดยไม่คืน credential ในผลลัพธ์'),
  step('provision-secondary-student', 'fixture', 'fixture-admin', true, ['provision-synthetic-student'],
    'สร้างบัญชีนักเรียนคนที่สองเพื่อทดสอบ horizontal isolation'),
  step('authenticate-teacher', 'teacher-setup', 'teacher', false, ['provision-secondary-student'],
    'ยืนยันว่า session เป็นครูสังเคราะห์ exact account'),
  step('create-subject-classroom', 'teacher-setup', 'teacher', true, ['authenticate-teacher'],
    'สร้างห้องเรียนรายวิชาสังเคราะห์หนึ่งห้อง'),
  step('create-synthetic-written-question', 'teacher-setup', 'teacher', true, ['create-subject-classroom'],
    'สร้างโจทย์อัตนัยสังเคราะห์หนึ่งข้อในคลังของครูเจ้าของ'),
  step('create-synthetic-upload-question', 'teacher-setup', 'teacher', true, ['create-synthetic-written-question'],
    'สร้างโจทย์ส่งไฟล์สังเคราะห์หนึ่งข้อเพื่อใช้ทดสอบ upload จริง'),
  step('authenticate-student-for-enrolment', 'student-enrolment', 'student', false, ['create-synthetic-upload-question'],
    'สลับเป็นนักเรียนหลัก exact account ก่อนเข้าห้องด้วยรหัสใน UI'),
  step('join-synthetic-student-to-classroom', 'student-enrolment', 'student', true, ['authenticate-student-for-enrolment'],
    'นักเรียนหลักเข้าร่วม exact classroom ด้วยเส้นทาง self-join จริง'),
  step('authenticate-secondary-student-for-enrolment', 'student-enrolment', 'student-secondary', false, ['join-synthetic-student-to-classroom'],
    'สลับเป็นนักเรียนคนที่สอง exact account ก่อนเข้าห้องด้วยตนเอง'),
  step('join-secondary-student-to-classroom', 'student-enrolment', 'student-secondary', true, ['authenticate-secondary-student-for-enrolment'],
    'นักเรียนคนที่สองเข้าร่วม exact classroom โดยยังไม่มีสิทธิ์ใน attempt ของนักเรียนหลัก'),
  step('authenticate-teacher-for-assignment', 'teacher-setup', 'teacher', false, ['join-secondary-student-to-classroom'],
    'สลับกลับเป็นครูเจ้าของ exact account เพื่อสร้างข้อสอบ'),
  step('create-seb-assignment-draft-with-quit-password', 'teacher-setup', 'teacher', true, ['authenticate-teacher-for-assignment'],
    'สร้างข้อสอบ SEB แบบ draft พร้อมรหัสออกแบบ write-only ไม่มีรหัสก่อนเข้า และ response ไม่มี plaintext/hash'),
  step('register-assignment-seb-release', 'teacher-setup', 'native-operator', true, ['create-seb-assignment-draft-with-quit-password'],
    'ผูก private artifact, digest, CK และ exact BEK กับ revision โดยไม่บันทึกค่าเหล่านี้ใน evidence'),
  step('publish-seb-assignment', 'teacher-setup', 'teacher', true, ['register-assignment-seb-release'],
    'เผยแพร่ได้เฉพาะเมื่อ exact assignment revision มี release ที่พร้อม'),
  step('authenticate-student', 'student-journey', 'student', false, ['publish-seb-assignment'],
    'ยืนยันว่า session เป็นนักเรียนสังเคราะห์ exact account'),
  step('reject-invalid-seb-challenge', 'negative-session', 'student', false, ['authenticate-student'],
    'ปฏิเสธ challenge ที่ลายเซ็นหรือ purpose ไม่ถูกต้องโดยไม่สร้าง check-in หรือ attempt'),
  step('reject-expired-seb-challenge', 'negative-session', 'staging-qa-control', false, ['reject-invalid-seb-challenge'],
    'ใช้ QA seam ที่จำกัดเฉพาะ synthetic Staging เพื่อยืนยันว่า challenge หมดอายุถูกปฏิเสธโดยไม่รอจริงหรือเปิด signing oracle'),
  step('verify-seb-system-check', 'student-journey', 'student', true, ['reject-expired-seb-challenge'],
    'ผ่าน SEB system check โดยยังไม่สร้าง attempt หรือเริ่มจับเวลา'),
  step('reject-replayed-seb-challenge', 'negative-session', 'student', false, ['verify-seb-system-check'],
    'ปฏิเสธ challenge ที่ถูก replay ข้ามผู้ใช้ ข้อสอบ หรือ revision โดยไม่สร้าง check-in หรือ attempt เพิ่ม'),
  step('reject-invalid-seb-session', 'negative-session', 'student', false, ['reject-replayed-seb-challenge'],
    'ปฏิเสธ secure session ที่ถูกแก้ไขหรือผูกคน/ข้อสอบผิด'),
  step('reject-expired-seb-session', 'negative-session', 'staging-qa-control', false, ['reject-invalid-seb-session'],
    'ใช้ QA seam ที่จำกัดเฉพาะ synthetic Staging เพื่อยืนยันว่า secure session หมดอายุถูกปฏิเสธโดยไม่สร้าง attempt'),
  step('start-revision-bound-attempt', 'student-journey', 'student', true, ['reject-expired-seb-session'],
    'สร้าง attempt ที่ผูก exact SEB config revision และ access mode'),
  step('reject-replayed-seb-session', 'negative-session', 'student', false, ['start-revision-bound-attempt'],
    'ปฏิเสธ session ที่ replay ข้ามผู้ใช้ ข้อสอบ หรือ revision จาก attempt ที่ผูกไว้'),
  step('autosave-synthetic-answer', 'student-journey', 'student', true, ['reject-replayed-seb-session'],
    'บันทึกคำตอบสังเคราะห์และอ่านกลับได้จาก exact attempt'),
  step('retry-autosave-after-transient-failure', 'failure-retry', 'student', true, ['autosave-synthetic-answer'],
    'จำลอง autosave ล้มเหลวชั่วคราวแล้ว retry โดยไม่สร้างคำตอบซ้ำหรือข้าม attempt'),
  step('resume-same-attempt', 'student-journey', 'student', false, ['retry-autosave-after-transient-failure'],
    'login/resume แล้วได้ attempt, revision และคำตอบชุดเดิมโดยไม่สุ่มใหม่'),
  step('upload-synthetic-attachment', 'student-journey', 'student', true, ['resume-same-attempt'],
    'อัปโหลดไฟล์สังเคราะห์ผ่าน signed target ที่ผูก exact answer'),
  step('retry-upload-after-transient-failure', 'failure-retry', 'student', true, ['upload-synthetic-attachment'],
    'จำลอง upload ล้มเหลวชั่วคราวแล้ว retry โดยไม่บันทึก object/reference ซ้ำ'),
  step('record-proctor-heartbeat', 'student-journey', 'student', true, ['retry-upload-after-transient-failure'],
    'บันทึก heartbeat ของ exact attempt โดยไม่เก็บ secret หรือ browser key ใน evidence'),
  step('student-denied-teacher-result', 'authorization', 'student', false, ['record-proctor-heartbeat'],
    'นักเรียนถูกปฏิเสธเมื่อเรียกเส้นทางผลสอบของครู'),
  step('submit-attempt', 'student-journey', 'student', true, ['student-denied-teacher-result'],
    'ส่ง exact attempt สำเร็จและปิดการแก้คำตอบ/ไฟล์ภายหลัง'),
  step('authenticate-teacher-for-result', 'teacher-result', 'teacher', false, ['submit-attempt'],
    'สลับกลับเป็น session ครูสังเคราะห์ exact account'),
  step('teacher-read-submitted-result', 'teacher-result', 'teacher', false, ['authenticate-teacher-for-result'],
    'ครูอ่านผลของ exact assignment และเห็นคำตอบ/ไฟล์สังเคราะห์ที่ส่งแล้ว'),
  step('authenticate-secondary-student', 'authorization', 'student-secondary', false, ['teacher-read-submitted-result'],
    'ยืนยันว่า session เป็นนักเรียนคนที่สอง exact account'),
  step('secondary-student-denied-primary-attempt', 'authorization', 'student-secondary', false, ['authenticate-secondary-student'],
    'นักเรียนคนที่สองอ่านหรือแก้ attempt ของนักเรียนหลักไม่ได้'),
  step('authenticate-unrelated-teacher', 'authorization', 'teacher-unrelated', false, ['secondary-student-denied-primary-attempt'],
    'ยืนยันว่า session เป็นครูที่ไม่เกี่ยวข้อง exact account'),
  step('unrelated-teacher-denied-assignment-result', 'authorization', 'teacher-unrelated', false, ['authenticate-unrelated-teacher'],
    'ครูที่ไม่เกี่ยวข้องอ่านหรือแก้ assignment/result ของครูเจ้าของไม่ได้'),
  step('verify-cross-account-boundaries', 'authorization', 'harness', false, ['unrelated-teacher-denied-assignment-result'],
    'ยืนยัน role และ horizontal isolation ครบทั้งครูและนักเรียน'),
  Object.freeze({
    id: 'cleanup-synthetic-fixture',
    phase: 'cleanup',
    actor: 'fixture-admin',
    mutates: true,
    dependsOn: Object.freeze([]),
    runOnFailure: true,
    expected: 'ลบเฉพาะ namespace ของ run นี้หลังตรวจซ้ำว่า target ยังเป็น isolated Staging',
  }),
])

const STEP_IDS = Object.freeze(STEPS.map(value => value.id))
const JOURNEY_STEPS = Object.freeze(STEPS.filter(value => value.phase !== 'cleanup'))
const CLEANUP_STEP = STEPS.find(value => value.phase === 'cleanup')

function step(id, phase, actor, mutates, dependsOn, expected) {
  return Object.freeze({
    id,
    phase,
    actor,
    mutates,
    dependsOn: Object.freeze(dependsOn),
    runOnFailure: false,
    expected,
  })
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isSafeRunId(value) {
  return SAFE_RUN_ID.test(value) && !FORBIDDEN_RUN_ID_TERMS.test(value)
}

function cloneSteps() {
  return Object.freeze(STEPS.map(value => Object.freeze({
    ...value,
    dependsOn: Object.freeze([...value.dependsOn]),
  })))
}

function fixtureDescriptor(runId) {
  return Object.freeze({
    ...FIXTURE,
    namespace: isSafeRunId(runId) ? `qa:${runId}` : null,
    entities: Object.freeze(FIXTURE.entities.map(value => Object.freeze({
      ...value,
      ...(Array.isArray(value.aliases) ? { aliases: Object.freeze([...value.aliases]) } : {}),
      ...(Array.isArray(value.questionTypes) ? { questionTypes: Object.freeze([...value.questionTypes]) } : {}),
      ...(Array.isArray(value.questionAliases) ? { questionAliases: Object.freeze([...value.questionAliases]) } : {}),
    }))),
  })
}

/**
 * Build a pure, value-redacting Phase S5 plan. No account, database, Storage,
 * Auth, SEB, or network operation is performed here. The default mode is
 * deliberately read-only; mutation requires two independent explicit gates.
 */
export function buildSebStagingMockHarnessPlan({
  environment = {},
  mode = 'inspect',
  runId = 'seb-s5-preview',
  writeConfirmation = '',
} = {}) {
  const staging = inspectExamStagingReadiness(environment)
  const checks = [...staging.checks]
  const normalizedMode = clean(mode)
  const normalizedRunId = clean(runId)

  checks.push(clean(environment.NEXT_PUBLIC_SITE_URL) === OFFICIAL_STAGING_ORIGIN
    ? { status: 'pass', field: 'official Staging target', message: 'เป้าหมายเป็น staging.korkru.com exact origin' }
    : { status: 'blocker', field: 'official Staging target', message: 'mock harness อนุญาตเฉพาะ official Staging origin' })

  checks.push(clean(environment.NEXT_PUBLIC_SUPABASE_URL) === OFFICIAL_STAGING_SUPABASE_ORIGIN
    ? { status: 'pass', field: 'official Staging database', message: 'เป้าหมายเป็น allowlisted Staging project' }
    : { status: 'blocker', field: 'official Staging database', message: 'mock harness อนุญาตเฉพาะ allowlisted Staging project' })

  checks.push(
    clean(environment.EXAM_QA_DATA_POLICY) === 'synthetic-only'
      && clean(environment.EXAM_QA_COPY_PRODUCTION_DATA) === 'false'
      ? { status: 'pass', field: 'synthetic data policy', message: 'ใช้ข้อมูลสังเคราะห์และห้ามคัดลอก Production' }
      : { status: 'blocker', field: 'synthetic data policy', message: 'ต้องยืนยัน synthetic-only และห้ามคัดลอก Production' },
  )

  checks.push(isSafeRunId(normalizedRunId)
    ? { status: 'pass', field: 'fixture namespace', message: 'run id อยู่ใน namespace QA ที่จำกัดขอบเขต' }
    : { status: 'blocker', field: 'fixture namespace', message: 'run id ต้องเป็น seb-s5-* แบบตัวพิมพ์เล็กและห้ามสื่อถึงข้อมูลจริง/Production' })

  if (!MODES.has(normalizedMode)) {
    checks.push({
      status: 'blocker',
      field: 'harness mode',
      message: 'mode ต้องเป็น inspect หรือ execute เท่านั้น',
    })
  } else if (normalizedMode === 'inspect') {
    checks.push({
      status: 'pass',
      field: 'harness mode',
      message: 'read-only plan; ไม่อนุญาต mutation',
    })
  } else {
    const writeEnabled = clean(environment.EXAM_QA_ALLOW_SYNTHETIC_WRITES) === 'true'
    const confirmationMatches = writeConfirmation === WRITE_CONFIRMATION
    const uniqueRun = normalizedRunId !== 'seb-s5-preview'
    checks.push(writeEnabled && confirmationMatches && uniqueRun
      ? { status: 'pass', field: 'synthetic write authorization', message: 'ได้รับ opt-in สองชั้นสำหรับ fixture run ที่ระบุ' }
      : { status: 'blocker', field: 'synthetic write authorization', message: 'execute ต้องเปิด synthetic writes, ยืนยัน exact phrase และใช้ run id เฉพาะ' })

    checks.push(clean(environment.EXAM_QA_SEB_TIME_CONTROL) === 'true'
      ? { status: 'pass', field: 'Staging expiry control', message: 'เปิด QA seam สำหรับ expired challenge/session บน synthetic Staging เท่านั้น' }
      : { status: 'blocker', field: 'Staging expiry control', message: 'execute ต้องเปิด QA seam ที่ fail closed ก่อนทดสอบ token หมดอายุ' })
  }

  const ready = checks.every(check => check.status !== 'blocker')
  const executionAuthorized = ready && normalizedMode === 'execute'

  const plan = Object.freeze({
    schemaVersion: 1,
    mode: MODES.has(normalizedMode) ? normalizedMode : 'blocked',
    ready,
    readOnly: !executionAuthorized,
    executionAuthorized,
    checks: Object.freeze(checks.map(check => Object.freeze({ ...check }))),
    fixture: fixtureDescriptor(normalizedRunId),
    steps: cloneSteps(),
    cleanupStepId: CLEANUP_STEP.id,
  })
  ISSUED_PLANS.add(plan)
  return plan
}

function hasCanonicalPlanShape(plan) {
  return ISSUED_PLANS.has(plan)
    && Object.isFrozen(plan)
    && plan?.schemaVersion === 1
    && Array.isArray(plan.steps)
    && plan.steps.length === STEPS.length
    && plan.steps.every((value, index) => (
      value?.id === STEPS[index].id
      && value?.phase === STEPS[index].phase
      && value?.actor === STEPS[index].actor
      && value?.mutates === STEPS[index].mutates
      && value?.runOnFailure === STEPS[index].runOnFailure
      && JSON.stringify(value?.dependsOn) === JSON.stringify(STEPS[index].dependsOn)
    ))
}

/**
 * Evaluate redacted step evidence without trusting ordering supplied by a
 * caller. Evidence values are status words only; unknown keys and values block
 * the run without being echoed into the returned checks or report.
 */
export function inspectSebStagingMockHarnessEvidence(plan, evidence = {}) {
  const checks = []
  const planShapeReady = hasCanonicalPlanShape(plan)
  checks.push(planShapeReady
    ? { status: 'pass', field: 'harness plan', message: 'plan ตรงกับ Phase S5 schema' }
    : { status: 'blocker', field: 'harness plan', message: 'plan ไม่ตรงกับ Phase S5 schema; ห้ามดำเนินการ' })

  const evidenceRecord = evidence !== null
    && typeof evidence === 'object'
    && !Array.isArray(evidence)
    ? evidence
    : null
  const entries = evidenceRecord ? Object.entries(evidenceRecord) : []
  const knownIds = new Set(STEP_IDS)
  const evidenceShapeReady = evidenceRecord !== null
    && entries.every(([id, state]) => knownIds.has(id) && EVIDENCE_STATES.has(state))
  checks.push(evidenceShapeReady
    ? { status: 'pass', field: 'step evidence', message: 'evidence ใช้เฉพาะ step id และสถานะที่อนุญาต' }
    : { status: 'blocker', field: 'step evidence', message: 'evidence มี key หรือสถานะที่ไม่รู้จัก; ห้ามดำเนินการ' })

  const states = Object.fromEntries(STEP_IDS.map(id => [id, 'pending']))
  if (evidenceShapeReady) {
    for (const [id, state] of entries) states[id] = state
  }

  let orderingReady = true
  for (const current of JOURNEY_STEPS) {
    if (states[current.id] !== 'passed') continue
    if (!current.dependsOn.every(id => states[id] === 'passed')) orderingReady = false
  }
  checks.push(orderingReady
    ? { status: 'pass', field: 'step ordering', message: 'ขั้นที่ผ่านแล้วมี dependency ครบ' }
    : { status: 'blocker', field: 'step ordering', message: 'พบขั้นที่ถูกทำเครื่องหมายผ่านก่อน dependency; ห้ามดำเนินการ' })

  const failedStepIds = STEP_IDS.filter(id => states[id] === 'failed')
  checks.push(failedStepIds.length === 0
    ? { status: 'pass', field: 'failed steps', message: 'ยังไม่มีขั้นที่ล้มเหลว' }
    : { status: 'blocker', field: 'failed steps', message: 'มีขั้นล้มเหลว; หยุด journey และอนุญาตเฉพาะ cleanup ที่จำกัดขอบเขต' })

  const journeyFailed = JOURNEY_STEPS.some(value => states[value.id] === 'failed')
  const cleanupFailed = states[CLEANUP_STEP.id] === 'failed'
  const allJourneyPassed = JOURNEY_STEPS.every(value => states[value.id] === 'passed')
  const allStepsPassed = allJourneyPassed && states[CLEANUP_STEP.id] === 'passed'
  const createdSyntheticData = JOURNEY_STEPS.some(value => value.mutates && states[value.id] === 'passed')
  const cleanupPassed = states[CLEANUP_STEP.id] === 'passed'
  const cleanupOrderingReady = !cleanupPassed
    || allJourneyPassed
    || (journeyFailed && createdSyntheticData)
  checks.push(cleanupOrderingReady
    ? { status: 'pass', field: 'cleanup ordering', message: 'cleanup อยู่หลัง journey ที่สำเร็จหรือหลัง failure ที่สร้างข้อมูลแล้ว' }
    : { status: 'blocker', field: 'cleanup ordering', message: 'cleanup ถูกทำเครื่องหมายผ่านก่อนจบ journey; ห้ามทำ mutation ต่อ' })

  const structuralReady = planShapeReady
    && evidenceShapeReady
    && orderingReady
    && cleanupOrderingReady

  const plannedNextStepIds = []
  if (structuralReady && !cleanupFailed) {
    if (journeyFailed) {
      if (createdSyntheticData && states[CLEANUP_STEP.id] === 'pending') {
        plannedNextStepIds.push(CLEANUP_STEP.id)
      }
    } else if (allJourneyPassed) {
      if (states[CLEANUP_STEP.id] === 'pending') plannedNextStepIds.push(CLEANUP_STEP.id)
    } else {
      const next = JOURNEY_STEPS.find(value => (
        states[value.id] === 'pending'
        && value.dependsOn.every(id => states[id] === 'passed')
      ))
      if (next) plannedNextStepIds.push(next.id)
    }
  }

  const executionAuthorized = plan?.executionAuthorized === true
    && plan?.ready === true
    && structuralReady
  const nextStepIds = executionAuthorized ? plannedNextStepIds : []
  const runComplete = executionAuthorized
    && allStepsPassed
    && !journeyFailed
    && !cleanupFailed

  return {
    ready: executionAuthorized && !journeyFailed && !cleanupFailed,
    status: runComplete
      ? 'complete'
      : !structuralReady || cleanupFailed
        ? 'blocked'
        : journeyFailed
          ? cleanupPassed
            ? 'blocked'
            : 'cleanup-required'
          : executionAuthorized
            ? 'ready'
            : 'inspect-only',
    checks,
    completedStepIds: STEP_IDS.filter(id => states[id] === 'passed'),
    failedStepIds,
    pendingStepCount: STEP_IDS.filter(id => states[id] === 'pending').length,
    plannedNextStepIds,
    nextStepIds,
  }
}

export function formatSebStagingMockHarnessReport(plan, state = null) {
  const labels = { pass: 'PASS', blocker: 'BLOCKER', warning: 'WARNING' }
  const lines = [
    'SEB Staging synthetic mock harness',
    'แผนนี้ไม่เรียก network และไม่แสดง credential, password, CK, BEK, token, URL หรือ project ref',
    `Mode: ${plan?.executionAuthorized === true ? 'EXECUTE AUTHORIZED' : 'READ-ONLY'}`,
    '',
  ]
  for (const check of plan?.checks ?? []) {
    lines.push(`[${labels[check.status] ?? 'BLOCKER'}] ${check.field}: ${check.message}`)
  }
  lines.push('', `Journey: ${JOURNEY_STEPS.length} step(s) + scoped cleanup.`)
  if (state) {
    lines.push(`State: ${state.status}`)
    lines.push(`Completed: ${state.completedStepIds.length}; failed: ${state.failedStepIds.length}; pending: ${state.pendingStepCount}.`)
    lines.push(state.nextStepIds.length > 0
      ? `Next executable step: ${state.nextStepIds.join(', ')}`
      : 'Next executable step: none.')
  }
  lines.push(plan?.executionAuthorized === true
    ? 'AUTHORIZED for a future adapter to mutate synthetic Staging data only.'
    : 'READ-ONLY: do not create accounts, rows, objects, sessions, attempts, or uploads.')
  return lines.join('\n')
}
