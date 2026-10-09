import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), createAdminClient: vi.fn(), context: vi.fn(), authorize: vi.fn(),
  nativeAccess: vi.fn(), attachment: vi.fn(), revalidate: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/auth/assignment-access', () => ({ canManageAssignment: vi.fn(), studentHasAssignment: vi.fn() }))
vi.mock('@/lib/assignment-question-access.server', () => ({ loadAssignmentQuestionsByProvenance: vi.fn() }))
vi.mock('@/lib/seb-exam-context.server', () => ({ readSebExamContext: mocks.context, validateSebExamStartIntent: vi.fn() }))
vi.mock('@/lib/seb-waiting.server', () => ({ authorizeWaitingObject: mocks.authorize }))
vi.mock('@/lib/seb-session', () => ({ getSebSession: vi.fn(), createSebChallenge: vi.fn(), validateSebChallenge: vi.fn() }))
vi.mock('@/lib/exam-access-session', () => ({ getExamAccessSession: mocks.nativeAccess }))
vi.mock('@/lib/seb-assignment-release.server', () => ({ readCurrentAssignmentSebRelease: vi.fn(), createAssignmentSebSignedDownloadUrl: vi.fn() }))
vi.mock('@/lib/seb-start.server', () => ({ startSebSubmissionAtomic: vi.fn() }))
vi.mock('@/lib/exam-attachment-access.server', () => ({ validateStoredExamAttachmentUrl: mocks.attachment }))

import { finalizeExpiredSebSubmission, submitSubmission } from '@/lib/actions/submissions'
import { createSebExamContextClaims } from '@/lib/seb-exam-context-core'

const NOW = Date.parse('2026-10-09T15:00:00.000Z')
const STUDENT = '20000000-0000-4000-8000-000000000002'
const ASSIGNMENT = '30000000-0000-4000-8000-000000000003'
const SUBMISSION = '40000000-0000-4000-8000-000000000004'
const ANSWER = '50000000-0000-4000-8000-000000000005'
const FILE_ANSWER = '50000000-0000-4000-8000-000000000006'
const FILE_URL = `https://synthetic-staging.supabase.co/storage/v1/object/public/submission-files/${STUDENT}/${SUBMISSION}/${FILE_ANSWER}/fixture.pdf`
const PHOTO_URL = `https://synthetic-staging.supabase.co/storage/v1/object/public/work-images/${STUDENT}/${SUBMISSION}/${ANSWER}/fixture.png`
const claims = createSebExamContextClaims({ assignmentId: ASSIGNMENT, revision: 3,
  releaseId: `asr-${ASSIGNMENT.replaceAll('-', '')}-r3-${'a'.repeat(16)}` },
{ userId: STUDENT, contextId: 'd'.repeat(32), now: NOW - 1000 })

type Row = Record<string, unknown>
type Write = { table: string; value: Row; filters: Map<string, unknown> }
type Read = { table: string; columns: string; filters: Map<string, unknown> }
type DatabaseOptions = {
  answers?: Row[] | null
  startedAt?: string
  durationMinutes?: number | null
  endAt?: string | null
  extension?: string | null
  extensionError?: boolean
  metadataError?: boolean
  requireWork?: boolean
  answerWriteError?: string
  headerWriteError?: boolean
  status?: string
  artifacts?: Row[]
}

function mcqAnswer(overrides: Row = {}) {
  return { id: ANSWER, student_answer: 'MCQ:0', correct_answer: 'MCQ:0', max_score: 2,
    score: 0, carried_over: false, work_images: [], questions: { question_type: 'mcq' }, ...overrides }
}
function fileAnswer(overrides: Row = {}) {
  return { id: FILE_ANSWER, student_answer: JSON.stringify([{ url: FILE_URL, name: 'fixture.pdf', type: 'application/pdf' }]),
    correct_answer: '', max_score: 4, score: 0, carried_over: false, work_images: [],
    questions: { question_type: 'file_upload' }, ...overrides }
}

/** Synthetic service responses only. No Storage SDK, native files or live DB. */
function database(options: DatabaseOptions = {}) {
  const writes: Write[] = []
  const reads: Read[] = []
  const submission = {
    id: SUBMISSION, student_id: STUDENT, assignment_id: ASSIGNMENT,
    status: options.status ?? 'in_progress', submitted_at: null as string | null,
    exam_access_mode: 'seb', seb_config_revision: 3,
    started_at: options.startedAt ?? new Date(NOW - 31 * 60_000).toISOString(),
    assignments: { duration_minutes: options.durationMinutes === undefined ? 30 : options.durationMinutes,
      end_at: options.endAt ?? null, require_work_image: options.requireWork ?? false,
      secure_browser_mode: 'seb_required', android_exam_mode: 'monitored' },
  }
  const from = vi.fn((table: string) => {
    let columns = '', value: Row | null = null
    const filters = new Map<string, unknown>()
    let recordedRead = false
    const result = () => {
      if (value) {
        writes.push({ table, value, filters: new Map(filters) })
        if (table === 'submission_answers' && filters.get('id') === options.answerWriteError) {
          return { data: null, error: { message: 'synthetic-grade-write-failed' } }
        }
        if (table === 'submissions' && value.status === 'submitted') {
          if (options.headerWriteError) return { data: null, error: { message: 'synthetic-header-write-failed' } }
          submission.status = 'submitted'
          submission.submitted_at = value.submitted_at as string
        }
        return { data: null, error: null }
      }
      if (!recordedRead) { reads.push({ table, columns, filters: new Map(filters) }); recordedRead = true }
      if (table === 'submissions') return {
        data: options.metadataError && columns.startsWith('started_at') ? null : submission,
        error: options.metadataError && columns.startsWith('started_at') ? { message: 'synthetic-metadata-read-failed' } : null,
      }
      if (table === 'assignment_extensions') return {
        data: options.extension ? { extended_end_at: options.extension } : null,
        error: options.extensionError ? { message: 'synthetic-extension-read-failed' } : null,
      }
      if (table === 'submission_answers') return { data: options.answers === undefined ? [mcqAnswer()] : options.answers, error: null }
      if (table === 'student_work_artifacts') return { data: options.artifacts ?? [], error: null }
      return { data: null, error: null }
    }
    const query = {
      select: vi.fn((selected: string) => { columns = selected; return query }),
      eq: vi.fn((key: string, expected: unknown) => { filters.set(key, expected); return query }),
      in: vi.fn(() => query),
      update: vi.fn((updated: Row) => { value = updated; return query }),
      maybeSingle: vi.fn(async () => result()),
      then: (resolve: (response: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    }
    return query
  })
  const admin = { from }
  mocks.createAdminClient.mockReturnValue(admin)
  mocks.authorize.mockResolvedValue({ ok: true, context: claims, user: { id: STUDENT }, admin, submissionId: SUBMISSION })
  return { admin, submission, writes, reads, from }
}

function headerWrites(writes: Write[]) { return writes.filter(write => write.table === 'submissions' && write.value.status === 'submitted') }
function gradeWrites(writes: Write[]) { return writes.filter(write => write.table === 'submission_answers') }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: STUDENT } } }) } })
  mocks.context.mockResolvedValue({ status: 'valid', claims })
  mocks.nativeAccess.mockResolvedValue({ mode: 'seb', assignmentConfigRevision: 3 })
  mocks.attachment.mockResolvedValue({ path: 'synthetic-verified-path', mimeType: 'application/pdf', size: 100 })
})
afterEach(() => { vi.useRealTimers() })

describe('SEB submission finalization failures (mocked database; not native proof)', () => {
  it('does not commit a header or report success when any normal grading write fails', async () => {
    const { writes, submission } = database({ answers: [mcqAnswer(), mcqAnswer({ id: FILE_ANSWER })], answerWriteError: FILE_ANSWER })
    const result = await submitSubmission(SUBMISSION)
    expect(result).toHaveProperty('error')
    expect(result.success).not.toBe(true)
    expect(gradeWrites(writes)).toHaveLength(2)
    expect(headerWrites(writes)).toEqual([])
    expect(submission.status).toBe('in_progress')
    expect(submission.submitted_at).toBeNull()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it('does not report success or a committed receipt when the normal header write fails', async () => {
    const { writes, submission } = database({ headerWriteError: true })
    const result = await submitSubmission(SUBMISSION)
    expect(result).toHaveProperty('error')
    expect(result.success).not.toBe(true)
    expect(headerWrites(writes)).toHaveLength(1)
    expect(submission.status).toBe('in_progress')
    expect(submission.submitted_at).toBeNull()
    expect(writes.some(write => write.table.startsWith('exam_proctor_'))).toBe(false)
  })

  it('persists scoped normal grading before the submitted header on success', async () => {
    const { writes, submission } = database()
    expect(await submitSubmission(SUBMISSION)).toMatchObject({ success: true, totalScore: 2 })
    expect(gradeWrites(writes)[0]).toMatchObject({ value: { is_correct: true, score: 2 } })
    const header = headerWrites(writes)[0]
    expect(header.value).toMatchObject({ total_score: 2, submitted_at: new Date(NOW).toISOString() })
    expect([...header.filters]).toEqual([['id', SUBMISSION], ['student_id', STUDENT], ['status', 'in_progress']])
    expect(writes.indexOf(gradeWrites(writes)[0])).toBeLessThan(writes.indexOf(header))
    expect(submission.status).toBe('submitted')
  })

  it('does not grade/finalize without the ordinary native-access gate', async () => {
    const { writes } = database()
    mocks.nativeAccess.mockResolvedValue(null)
    expect(await submitSubmission(SUBMISSION)).toHaveProperty('error')
    expect(writes).toEqual([])
  })

  it('does not invent a completed receipt from missing answer data or an already-completed header', async () => {
    for (const options of [{ answers: null }, { status: 'submitted' }]) {
      const { writes } = database(options)
      expect(await submitSubmission(SUBMISSION)).toHaveProperty('error')
      expect(writes).toEqual([])
    }
  })
})

describe('restricted forced-expiry recovery (mocked boundaries; no native assurance)', () => {
  it.each(['absent', 'invalid'])('requires a valid bound context before object/admin work: %s', status => {
    const { writes, from } = database()
    mocks.context.mockResolvedValue({ status })
    return finalizeExpiredSebSubmission(SUBMISSION).then(result => {
      expect(result).toHaveProperty('error')
      expect(mocks.authorize).not.toHaveBeenCalled()
      expect(from).not.toHaveBeenCalled()
      expect(writes).toEqual([])
    })
  })

  it('uses only the explicit allowExpired object resolver and still rejects denied scope', async () => {
    const { writes, from } = database()
    mocks.authorize.mockResolvedValue(null)
    expect(await finalizeExpiredSebSubmission(SUBMISSION)).toHaveProperty('error')
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(claims, 'submission', SUBMISSION, { allowExpired: true })
    expect(from).not.toHaveBeenCalled()
    expect(writes).toEqual([])
  })

  it('rechecks actual duration expiry and retains native enforcement before committing', async () => {
    const { admin, writes, reads, submission } = database()
    expect(await finalizeExpiredSebSubmission(SUBMISSION)).toMatchObject({ success: true, totalScore: 2 })
    expect(mocks.authorize).toHaveBeenCalledWith(claims, 'submission', SUBMISSION, { allowExpired: true })
    expect(mocks.nativeAccess).toHaveBeenCalledWith(STUDENT, ASSIGNMENT, true, 3, 'seb')
    expect(reads[0].columns).toBe('started_at, assignments(duration_minutes, end_at)')
    expect([...reads[0].filters]).toEqual([['id', SUBMISSION], ['student_id', STUDENT], ['assignment_id', ASSIGNMENT]])
    expect(headerWrites(writes)).toHaveLength(1)
    expect(submission.status).toBe('submitted')
    expect(admin.from).toHaveBeenCalledWith('assignment_extensions')
  })

  it('cannot force-finalize a still-live attempt or one whose global deadline is extended into the future', async () => {
    for (const options of [
      { startedAt: new Date(NOW - 60_000).toISOString(), endAt: new Date(NOW + 60_000).toISOString() },
      { durationMinutes: null, endAt: new Date(NOW - 60_000).toISOString(), extension: new Date(NOW + 60_000).toISOString() },
    ]) {
      const { writes } = database(options)
      expect(await finalizeExpiredSebSubmission(SUBMISSION)).toHaveProperty('error')
      expect(writes).toEqual([])
    }
    expect(mocks.nativeAccess).not.toHaveBeenCalled()
  })

  it('accepts an actually elapsed per-student deadline overriding a later global end', async () => {
    const { writes } = database({ durationMinutes: null, endAt: new Date(NOW + 60_000).toISOString(),
      extension: new Date(NOW - 60_000).toISOString() })
    expect(await finalizeExpiredSebSubmission(SUBMISSION)).toMatchObject({ success: true })
    expect(headerWrites(writes)).toHaveLength(1)
  })

  it.each([{ extensionError: true }, { metadataError: true }])('fails closed on deadline read failure %#', async options => {
    const { writes } = database(options)
    expect(await finalizeExpiredSebSubmission(SUBMISSION)).toHaveProperty('error')
    expect(writes).toEqual([])
    expect(mocks.nativeAccess).not.toHaveBeenCalled()
  })

  it('cannot bypass the native-access recheck even with valid context and an expired object', async () => {
    const { writes } = database()
    mocks.nativeAccess.mockResolvedValue(null)
    expect(await finalizeExpiredSebSubmission(SUBMISSION)).toHaveProperty('error')
    expect(writes).toEqual([])
  })

  it.each(['grade', 'header'])('does not succeed or commit if forced recovery %s persistence fails', async failure => {
    const { writes, submission } = database(failure === 'grade' ? { answerWriteError: ANSWER } : { headerWriteError: true })
    const result = await finalizeExpiredSebSubmission(SUBMISSION)
    expect(result).toHaveProperty('error')
    expect(result.success).not.toBe(true)
    expect(submission.status).toBe('in_progress')
    expect(submission.submitted_at).toBeNull()
    if (failure === 'grade') expect(headerWrites(writes)).toEqual([])
  })

  it('cannot be trapped by missing photo/file storage; all fresh file rows remain pending with zero credit and references retained', async () => {
    const withPhoto = mcqAnswer({ work_images: [PHOTO_URL] })
    const file = fileAnswer()
    const { writes } = database({ answers: [withPhoto, file], requireWork: true })
    mocks.attachment.mockResolvedValue({ error: 'synthetic-missing-object' })
    expect(await finalizeExpiredSebSubmission(SUBMISSION)).toMatchObject({ success: true, totalScore: 2 })
    expect(mocks.attachment).not.toHaveBeenCalled()
    expect(gradeWrites(writes).find(write => write.filters.get('id') === FILE_ANSWER)?.value).toEqual({ is_correct: null, score: 0 })
    expect(gradeWrites(writes).every(write => !Object.hasOwn(write.value, 'student_answer') && !Object.hasOwn(write.value, 'work_images'))).toBe(true)
    expect(file.student_answer).toContain(FILE_URL)
    expect(withPhoto.work_images).toEqual([PHOTO_URL])
  })

  it.each(['[]', 'invalid-json', ''])('forced recovery never auto-awards credit to a file row with payload %j', async student_answer => {
    const { writes } = database({ answers: [fileAnswer({ student_answer })] })
    expect(await finalizeExpiredSebSubmission(SUBMISSION)).toMatchObject({ success: true, totalScore: 0 })
    expect(gradeWrites(writes)[0].value).toEqual({ is_correct: null, score: 0 })
    expect(mocks.attachment).not.toHaveBeenCalled()
  })
})

describe('ordinary attachment-submit regression', () => {
  it('still verifies a valid submitted file before granting ordinary file credit', async () => {
    const { writes } = database({ answers: [fileAnswer()] })
    expect(await submitSubmission(SUBMISSION)).toMatchObject({ success: true, totalScore: 4 })
    expect(mocks.attachment).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      kind: 'submission_file', url: FILE_URL, studentId: STUDENT, submissionId: SUBMISSION,
      submissionAnswerId: FILE_ANSWER, expectedMimeType: 'application/pdf', allowLegacy: true,
    })
    expect(gradeWrites(writes)[0].value).toEqual({ is_correct: true, score: 4 })
    expect(headerWrites(writes)).toHaveLength(1)
  })

  it.each([fileAnswer(), mcqAnswer({ work_images: [PHOTO_URL] })])('blocks ordinary submit on missing referenced storage %#', async answer => {
    const { writes, submission } = database({ answers: [answer] })
    mocks.attachment.mockResolvedValue({ error: 'synthetic-missing-object' })
    expect(await submitSubmission(SUBMISSION)).toHaveProperty('error')
    expect(mocks.attachment).toHaveBeenCalledOnce()
    expect(writes).toEqual([])
    expect(submission.status).toBe('in_progress')
  })

  it('still blocks malformed ordinary file metadata before grading or header mutation', async () => {
    const { writes } = database({ answers: [fileAnswer({ student_answer: 'not-json' })] })
    expect(await submitSubmission(SUBMISSION)).toHaveProperty('error')
    expect(mocks.attachment).not.toHaveBeenCalled()
    expect(writes).toEqual([])
  })
})
