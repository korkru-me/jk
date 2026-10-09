import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto'
import {
  ASSIGNMENT_SEB_UAT_ORIGIN,
  ASSIGNMENT_SEB_STAGING_SUPABASE_ORIGIN,
} from './seb-assignment-artifact-core.mjs'

const RUN_ID = /^seb-w6-[a-z0-9](?:[a-z0-9-]{0,36}[a-z0-9])?$/
const FORBIDDEN_RUN_TERMS = /(?:production|customer|real|live|r2)/
const HASH_BYTES = 24

export class SebWaitingFixturePlanError extends Error {
  constructor(code) {
    super(code)
    this.name = 'SebWaitingFixturePlanError'
    this.code = code
  }
}

function fail(code) { throw new SebWaitingFixturePlanError(code) }

function record(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return (prototype === Object.prototype || prototype === null)
    && Reflect.ownKeys(value).every(key => typeof key === 'string' && allowed.includes(key)
      && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

function question(marker, questionType, questionText, overrides = {}) {
  // These are existing QuestionFormData fields, not a new question schema.
  // Owner/org/IDs are deliberately absent: the authenticated creator must
  // resolve them through the ordinary application action and attest results.
  return {
    title: marker,
    subject: 'คณิตศาสตร์',
    question_text: questionText,
    question_type: questionType,
    difficulty: 'easy',
    visibility: 'private',
    category_id: '',
    grade_level: '',
    is_random: false,
    variables: [],
    logic_rules: [],
    answer_parts: [],
    answer_formula: '',
    answer_unit: '',
    answer_tolerance: 0,
    mcq_options: [],
    extra_data: {},
    solution_text: '',
    solution_image_urls: [],
    tags: ['SEB-W6', 'synthetic-only'],
    image_urls: [],
    ...overrides,
  }
}

/** Deterministic creation instructions only, never a reservation or authority.
 * No account/DB IDs, credentials, release, or native evidence are synthesized.
 * Parent/operator must authorize every actual Staging mutation separately.
 */
export function createWaitingSebFixturePlan(input) {
  if (!record(input, ['runId', 'origin'])) fail('SEB_WAITING_FIXTURE_PLAN_INVALID')
  const { runId, origin = ASSIGNMENT_SEB_UAT_ORIGIN } = input
  if (typeof runId !== 'string' || !RUN_ID.test(runId) || FORBIDDEN_RUN_TERMS.test(runId)
    || runId === 'seb-w6-preview' || origin !== ASSIGNMENT_SEB_UAT_ORIGIN) {
    fail('SEB_WAITING_FIXTURE_PLAN_INVALID')
  }
  const marker = kind => `SEB W6 synthetic ${runId} ${kind}`
  const questions = [
    { key: 'question-numeric', form: question(marker('numeric'), 'written',
      '<p>ข้อมูลสังเคราะห์สำหรับทดสอบเท่านั้น: 2 + 2 เท่ากับเท่าไร? แนบวิธีทำด้วยกระดาษทดหรือรูปถ่าย</p>', {
        answer_formula: '4',
        answer_parts: [{ id: 'w6-numeric-part', sub_text: '', formula: '4', unit: '', tolerance: 0 }],
      }) },
    { key: 'question-mcq', form: question(marker('mcq'), 'mcq',
      '<p>ข้อมูลสังเคราะห์สำหรับทดสอบเท่านั้น: เลือกคำตอบของ 1 + 1</p>', {
        mcq_options: [{ text: '2', is_correct: true }, { text: '3', is_correct: false }],
      }) },
    { key: 'question-upload', form: question(marker('file-upload'), 'file_upload',
      '<p>ข้อมูลสังเคราะห์สำหรับทดสอบเท่านั้น: แนบไฟล์ PDF สังเคราะห์ที่ไม่มีข้อมูลบุคคล</p>', {
        extra_data: { attachment_urls: [] },
      }) },
  ]
  return freeze({
    schemaVersion: 1,
    phase: 'W6',
    status: 'planned',
    runId,
    testOnly: true,
    nativeProof: 'pending_w7',
    scopeVerified: false,
    networkUsed: false,
    mutationUsed: false,
    targets: { siteOrigin: origin, supabaseOrigin: ASSIGNMENT_SEB_STAGING_SUPABASE_ORIGIN },
    classroom: { type: 'subject', name: marker('classroom'), description: 'Synthetic-only SEB waiting-room TEST fixture' },
    questions,
    assignment: {
      title: marker('exam'),
      description: 'Synthetic-only SEB waiting-room TEST fixture; W7 native activation not run',
      type: 'exam',
      mode: 'online',
      status: 'draft',
      secure_browser_mode: 'seb_required',
      android_exam_mode: 'blocked',
      completion_rule: 'fixed',
      access_code: null,
      duration_minutes: 30,
      start_at: null,
      end_at: null,
      max_attempts: 3,
      score_strategy: 'best',
      retry_scope: 'all',
      passing_type: null,
      passing_value: null,
      random_question_count: null,
      shuffle_questions: false,
      shuffle_options: false,
      questions_per_page: 1,
      instant_check: false,
      instant_check_answer_key: false,
      show_results: 'score_only',
      show_solutions: false,
      require_work_image: true,
      calculator_enabled: false,
      scratchpad_enabled: true,
      proctoring_enabled: true,
      fullscreen_required: false,
      block_clipboard: true,
      exam_watermark_enabled: true,
    },
    bindingsRequired: ['synthetic_owner_and_org', 'synthetic_roster', 'committed_classroom_id',
      'committed_question_ids', 'teacher_supplied_private_quit_password', 'current_teacher_owned_revision'],
    seedPreparationGuards: ['isolated_staging_environment', 'exact_draft_fixed_passwordless_exam',
      'latest_revision_matches_owner_and_org', 'no_active_attempt', 'no_existing_release', 'private_new_output_paths'],
    stopBefore: ['native_configuration_tool', 'native_final_save', 'native_key_collection',
      'storage_upload', 'release_enrollment', 'manifest_activation', 'publish', 'student_exam_start'],
  })
}

/** A new source-only XML input, independent of every prior config/artifact.
 * Hashes here are fresh placeholders, not the teacher's revision or a usable
 * administrator credential. Existing prepare must replace both from its
 * independently verified teacher context and freshly generated admin value.
 * Remaining required initial profile fields are written by the materializer;
 * omitted platform defaults and actual native loading still require W7.
 * Caller must use the private wx writer; this pure helper never performs I/O.
 */
export function createFreshWaitingSebTemplate(input = {}) {
  if (!record(input, ['randomBytes'])) fail('SEB_WAITING_FIXTURE_TEMPLATE_INVALID')
  const randomBytes = input.randomBytes === undefined ? nodeRandomBytes : input.randomBytes
  if (typeof randomBytes !== 'function') fail('SEB_WAITING_FIXTURE_TEMPLATE_INVALID')
  const hashes = []
  for (let index = 0; index < 2; index += 1) {
    let entropy
    try { entropy = randomBytes(HASH_BYTES) } catch { fail('SEB_WAITING_FIXTURE_ENTROPY_INVALID') }
    if (!Buffer.isBuffer(entropy) || entropy.length !== HASH_BYTES) fail('SEB_WAITING_FIXTURE_ENTROPY_INVALID')
    hashes.push(createHash('sha256').update(entropy).digest('hex'))
  }
  if (hashes[0] === hashes[1]) fail('SEB_WAITING_FIXTURE_ENTROPY_INVALID')
  return Buffer.from(`<?xml version="1.0" encoding="utf-8"?>\n<plist version="1.0"><dict>\n`
    + '<key>sebConfigPurpose</key><integer>0</integer>\n'
    + `<key>hashedAdminPassword</key><string>${hashes[0]}</string>\n`
    + `<key>hashedQuitPassword</key><string>${hashes[1]}</string>\n`
    + '</dict></plist>\n', 'utf8')
}
