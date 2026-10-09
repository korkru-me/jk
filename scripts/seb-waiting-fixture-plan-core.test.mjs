import { createHash } from 'node:crypto'
import { XMLValidator } from 'fast-xml-parser'
import { describe, expect, it, vi } from 'vitest'
import { buildAssignmentAttempt, gradeAnswer } from '../lib/assignment-attempt'
import { assignmentSebPlistHelpers } from './seb-assignment-artifact-core.mjs'
import {
  createWaitingSebArtifactPolicy, inspectWaitingSebInitialArtifact,
} from './seb-waiting-artifact-core.mjs'
import {
  parseWaitingOperatorArguments, prepareWaitingSebOperator,
} from './seb-waiting-operator-core.mjs'
import {
  createFreshWaitingSebTemplate, createWaitingSebFixturePlan,
} from './seb-waiting-fixture-plan-core.mjs'

const RUN = 'seb-w6-20261009-synthetic-a'
const ORIGIN = 'https://korkru-seb-uat.vercel.app'
const ASSIGNMENT = '30000000-0000-4000-8000-000000000003'
const TEACHER_HASH = 'b'.repeat(64)
const environment = {
  KORKRU_DEPLOYMENT_ENV: 'staging', EXAM_QA_ENVIRONMENT: 'staging', VERCEL_ENV: 'production',
  NEXT_PUBLIC_SITE_URL: ORIGIN, SEB_UAT_ISOLATED_PROJECT: 'true',
  NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'korkru-seb-uat.vercel.app',
  EXAM_QA_PRODUCTION_SITE_URL: 'https://www.korkru.com',
  NEXT_PUBLIC_SUPABASE_URL: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
  EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://synthetic-production-project.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-staging-anon-key-long',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-staging-service-key-long',
  SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS: 'true', SEB_EXAM_WAITING_ENABLED: 'true',
}

function entropy() {
  let count = 0
  return vi.fn(size => Buffer.alloc(size, ++count))
}

function options(apply = false) {
  return parseWaitingOperatorArguments(['--assignment', ASSIGNMENT, '--revision', '1',
    '--template', '/synthetic/new-template.xml', '--output', '/synthetic/new-seed.seb',
    '--admin-password-output', '/synthetic/new-admin.txt', ...(apply ? ['--apply'] : [])], 'prepare')
}

function operator(templateBytes) {
  const writes = []
  const readContext = vi.fn(async () => ({ assignmentId: ASSIGNMENT, revision: 1,
    hashedQuitPassword: TEACHER_HASH, existingRelease: null }))
  const checkPasswordlessAssignment = vi.fn(async () => true)
  const writePrivateFile = vi.fn(async (path, bytes) => { writes.push({ path, bytes: Buffer.from(bytes) }) })
  const randomBytes = vi.fn(size => Buffer.alloc(size, size === 24 ? 7 : 9))
  return { templateBytes, writes, dependencies: { readContext, checkPasswordlessAssignment, writePrivateFile, randomBytes } }
}

describe('pure W6 synthetic fixture plan, not creation or native proof', () => {
  it('is deterministic, independent, deeply frozen, and explicitly unverified', () => {
    const plan = createWaitingSebFixturePlan({ runId: RUN })
    expect(plan).toEqual(createWaitingSebFixturePlan({ runId: RUN, origin: ORIGIN }))
    expect(plan).toMatchObject({ schemaVersion: 1, phase: 'W6', status: 'planned', testOnly: true,
      nativeProof: 'pending_w7', scopeVerified: false, networkUsed: false, mutationUsed: false })
    expect(plan.targets).toEqual({ siteOrigin: ORIGIN, supabaseOrigin: 'https://dyuxkrzeveknqgtuzpbh.supabase.co' })
    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.questions)).toBe(true)
    expect(Object.isFrozen(plan.questions[0].form.answer_parts[0])).toBe(true)
    expect(() => { plan.assignment.status = 'published' }).toThrow()
  })

  it('uses new run-scoped markers without choosing account, classroom, question or assignment IDs', () => {
    const plan = createWaitingSebFixturePlan({ runId: RUN })
    const next = createWaitingSebFixturePlan({ runId: 'seb-w6-20261009-synthetic-b' })
    const markers = [plan.classroom.name, plan.assignment.title, ...plan.questions.map(question => question.form.title)]
    expect(new Set(markers).size).toBe(5)
    expect(markers.every(marker => marker.includes(RUN) && marker.includes('synthetic'))).toBe(true)
    expect(next.assignment.title).not.toBe(plan.assignment.title)
    expect(plan).not.toHaveProperty('assignmentId')
    expect(plan).not.toHaveProperty('releaseId')
    expect(plan).not.toHaveProperty('revision')
    expect(plan.assignment).not.toHaveProperty('created_by')
    expect(plan.assignment).not.toHaveProperty('org_id')
    expect(plan.assignment).not.toHaveProperty('classroom_ids')
    expect(plan.assignment).not.toHaveProperty('question_ids')
    expect(plan.assignment).not.toHaveProperty('seb_quit_password')
    expect(plan.questions.every(question => !Object.hasOwn(question.form, 'id') && !Object.hasOwn(question.form, 'org_id'))).toBe(true)
  })

  it('supports the fixed passwordless draft pilot with work evidence and bounded retries', () => {
    const { assignment, questions, bindingsRequired, seedPreparationGuards, stopBefore } = createWaitingSebFixturePlan({ runId: RUN })
    expect(assignment).toMatchObject({ type: 'exam', mode: 'online', status: 'draft', secure_browser_mode: 'seb_required',
      android_exam_mode: 'blocked', completion_rule: 'fixed', access_code: null, max_attempts: 3, retry_scope: 'all',
      require_work_image: true, scratchpad_enabled: true, instant_check: false, show_solutions: false, show_results: 'score_only' })
    expect(questions.map(question => question.form.question_type)).toEqual(['written', 'mcq', 'file_upload'])
    expect(bindingsRequired).toContain('teacher_supplied_private_quit_password')
    expect(bindingsRequired).toContain('current_teacher_owned_revision')
    expect(seedPreparationGuards).toContain('no_existing_release')
    expect(seedPreparationGuards).toContain('latest_revision_matches_owner_and_org')
    expect(stopBefore).toEqual(expect.arrayContaining(['native_configuration_tool', 'native_final_save',
      'native_key_collection', 'storage_upload', 'release_enrollment', 'manifest_activation', 'publish', 'student_exam_start']))
  })

  it('uses actual existing numeric/MCQ schemas that the current attempt builder auto-grades correctly', () => {
    const plan = createWaitingSebFixturePlan({ runId: RUN })
    // IDs here are test-only local placeholders, never returned by the plan.
    const questions = plan.questions.map((question, index) => ({ ...question.form, id: `synthetic-question-${index}` }))
    const rows = buildAssignmentAttempt({ ...plan.assignment, question_ids: questions.map(question => question.id) }, questions)
    expect(rows.map(row => row.correct_answer)).toEqual(['4', 'MCQ:0', ''])
    for (const [index, answer] of [[0, '4'], [1, 'MCQ:0']]) {
      const row = rows[index]
      expect(gradeAnswer({ id: `synthetic-answer-${index}`, ...row, student_answer: answer, questions: questions[index] }))
        .toMatchObject({ is_correct: true, score: row.max_score })
    }
    expect(questions[2].extra_data).toEqual({ attachment_urls: [] })
    expect(questions.every(question => question.visibility === 'private' && question.image_urls.length === 0
      && question.solution_image_urls.length === 0)).toBe(true)
  })

  it.each([
    null, [], {}, { runId: '' }, { runId: 'seb-s5-existing' }, { runId: 'seb-w6-preview' },
    { runId: 'seb-w6-production' }, { runId: 'seb-w6-real-student' }, { runId: 'seb-w6-r2-copy' },
    { runId: 'seb-w6-../other' }, { runId: `seb-w6-${'a'.repeat(40)}` },
    { runId: RUN, origin: 'https://www.korkru.com' }, { runId: RUN, origin: 'https://staging.korkru.com' },
    { runId: RUN, origin: `${ORIGIN}/` }, { runId: RUN, assignmentId: ASSIGNMENT },
    { runId: RUN, configKey: 'a'.repeat(64) }, { runId: RUN, teacherPassword: 'not-accepted' },
  ])('rejects ambiguous, non-W6, expanded, or non-dedicated inputs %#', input => {
    expect(() => createWaitingSebFixturePlan(input)).toThrow('SEB_WAITING_FIXTURE_PLAN_INVALID')
  })

  it('does not invoke getters or accept inherited options', () => {
    const getter = vi.fn(() => RUN)
    expect(() => createWaitingSebFixturePlan(Object.defineProperty({}, 'runId', { get: getter, enumerable: true }))).toThrow()
    expect(getter).not.toHaveBeenCalled()
    expect(() => createWaitingSebFixturePlan(Object.create({ runId: RUN }))).toThrow()
  })
})

describe('new minimal XML input and mocked preparation compatibility only', () => {
  it('serializes only purpose and distinct entropy-derived placeholder hashes; no previous artifact or native keys', () => {
    const randomBytes = entropy()
    const bytes = createFreshWaitingSebTemplate({ randomBytes })
    const xml = bytes.toString('utf8')
    expect(XMLValidator.validate(xml)).toBe(true)
    const values = assignmentSebPlistHelpers.parse(xml)
    expect([...values.keys()]).toEqual(['sebConfigPurpose', 'hashedAdminPassword', 'hashedQuitPassword'])
    expect(values.get('sebConfigPurpose')).toEqual({ kind: 'integer', value: '0' })
    expect(values.get('hashedAdminPassword').value).toBe(createHash('sha256').update(Buffer.alloc(24, 1)).digest('hex'))
    expect(values.get('hashedQuitPassword').value).toBe(createHash('sha256').update(Buffer.alloc(24, 2)).digest('hex'))
    expect(randomBytes.mock.calls).toEqual([[24], [24]])
    expect(xml).not.toMatch(/startURL|quitURL|browserExamKey|configKey|examKeySalt|passwordEncryption|r2/)
    expect(createFreshWaitingSebTemplate({ randomBytes: entropy() })).toEqual(bytes)
  })

  it('uses fresh process-local entropy by default without returning a plaintext credential', () => {
    const first = createFreshWaitingSebTemplate()
    expect(createFreshWaitingSebTemplate()).not.toEqual(first)
    expect(first.toString()).not.toMatch(/plaintext|adminPassword|quitPassword/)
  })

  it.each([null, [], { bytes: Buffer.from('prior-artifact') }, { randomBytes: null }, { randomBytes: 'bad' }])('rejects template options outside the pure entropy input %#', input => {
    expect(() => createFreshWaitingSebTemplate(input)).toThrow('SEB_WAITING_FIXTURE_TEMPLATE_INVALID')
  })

  it.each([
    () => { throw new Error('private detail') },
    () => new Uint8Array(24), () => Buffer.alloc(23), () => Buffer.alloc(25), () => Buffer.alloc(24, 1),
  ])('rejects malformed or repeated entropy with a safe fixed code %#', randomBytes => {
    expect(() => createFreshWaitingSebTemplate({ randomBytes })).toThrow('SEB_WAITING_FIXTURE_ENTROPY_INVALID')
  })

  it('dry-run accepts the fresh XML but reads no context and generates/writes no credential or seed', async () => {
    const state = operator(createFreshWaitingSebTemplate({ randomBytes: entropy() }))
    expect(await prepareWaitingSebOperator({ options: options(), environment, templateBytes: state.templateBytes }, state.dependencies))
      .toMatchObject({ mode: 'dry-run', networkUsed: false, fileWritten: false, contextVerified: false, nativeProof: 'pending_w7' })
    for (const dependency of Object.values(state.dependencies)) expect(dependency).not.toHaveBeenCalled()
  })

  it('mocked scoped prepare produces a strict initial candidate with fresh admin/salt, empty quit URL, no entry password or cached BEK', async () => {
    const state = operator(createFreshWaitingSebTemplate({ randomBytes: entropy() }))
    const result = await prepareWaitingSebOperator({ options: options(true), environment, templateBytes: state.templateBytes }, state.dependencies)
    expect(result).toMatchObject({ status: 'prepared', revision: 1, nativeProof: 'pending_w7' })
    expect(result).not.toHaveProperty('configKey')
    expect(result).not.toHaveProperty('browserExamKey')
    expect(result).not.toHaveProperty('adminPassword')
    expect(state.dependencies.readContext).toHaveBeenCalledExactlyOnceWith(ASSIGNMENT, 1)
    expect(state.dependencies.checkPasswordlessAssignment).toHaveBeenCalledExactlyOnceWith(ASSIGNMENT)
    const candidate = state.writes.find(write => write.path.endsWith('new-seed.seb')).bytes
    const adminCredential = state.writes.find(write => write.path.endsWith('new-admin.txt')).bytes.toString().trim()
    const values = assignmentSebPlistHelpers.parse(candidate.toString('utf8'))
    const policy = createWaitingSebArtifactPolicy({ origin: ORIGIN, assignmentId: ASSIGNMENT, revision: 1 })
    expect(inspectWaitingSebInitialArtifact(candidate, policy, { expectedQuitHash: TEACHER_HASH,
      expectedAdminHash: createHash('sha256').update(adminCredential).digest('hex') }))
      .toMatchObject({ phase: 'initial', entryPassword: false, teacherHashVerified: true, nativeProof: 'pending_w7' })
    expect(values.get('hashedAdminPassword').value).not.toBe(assignmentSebPlistHelpers.parse(state.templateBytes.toString()).get('hashedAdminPassword').value)
    expect(values.get('startURL').value).toBe(`${ORIGIN}/exam/${ASSIGNMENT}/r/1/entry`)
    expect(values.get('quitURL').value).toBe('')
    expect(values.get('examSessionReconfigureConfigURL').value).toBe(`${ORIGIN}/exam/${ASSIGNMENT}/r/1/completion`)
    expect(values.get('allowDownloads').value).toBe(false)
    expect(values.get('allowUploads').value).toBe(true)
    expect(values.get('URLFilterEnable').value).toBe(true)
    expect(values.get('URLFilterEnableContentFilter').value).toBe(true)
    expect(values.get('browserExamKey').value).toBe('')
    expect(Buffer.from(values.get('examKeySalt').value, 'base64')).toEqual(Buffer.alloc(32, 9))
    expect(candidate.toString()).not.toContain(adminCredential)
  })

  it.each(['revision', 'release', 'passwordless', 'environment'])('mocked preparation fails before entropy/output for invalid %s', async failure => {
    const state = operator(createFreshWaitingSebTemplate({ randomBytes: entropy() }))
    if (failure === 'revision') state.dependencies.readContext.mockResolvedValue({ assignmentId: ASSIGNMENT, revision: 2,
      hashedQuitPassword: TEACHER_HASH, existingRelease: null })
    if (failure === 'release') state.dependencies.readContext.mockResolvedValue({ assignmentId: ASSIGNMENT, revision: 1,
      hashedQuitPassword: TEACHER_HASH, existingRelease: {} })
    if (failure === 'passwordless') state.dependencies.checkPasswordlessAssignment.mockResolvedValue(false)
    await expect(prepareWaitingSebOperator({ options: options(true),
      environment: failure === 'environment' ? { ...environment, KORKRU_DEPLOYMENT_ENV: 'production' } : environment,
      templateBytes: state.templateBytes }, state.dependencies)).rejects.toThrow()
    expect(state.dependencies.randomBytes).not.toHaveBeenCalled()
    expect(state.dependencies.writePrivateFile).not.toHaveBeenCalled()
  })
})
