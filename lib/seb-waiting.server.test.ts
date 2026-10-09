import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  context: vi.fn(), client: vi.fn(), admin: vi.fn(), roster: vi.fn(), release: vi.fn(), profile: vi.fn(), session: vi.fn(),
  startIntent: vi.fn(), challenge: vi.fn(), csrf: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }))
vi.mock('@/lib/auth/assignment-access', () => ({ studentHasAssignment: mocks.roster }))
vi.mock('@/lib/seb-assignment-release.server', () => ({ readCurrentAssignmentSebRelease: mocks.release }))
vi.mock('@/lib/seb-waiting-release-policy', () => ({ WAITING_SEB_RELEASE_PROFILE_ID: 'waiting-room-completion-experimental-v1', readWaitingSebProfile: mocks.profile, waitingSebFeatureEnabled: () => true }))
vi.mock('@/lib/seb-exam-context.server', () => ({ readSebExamContext: mocks.context, createSebExamStartIntent: mocks.startIntent, getSebExamCsrfToken: mocks.csrf }))
vi.mock('@/lib/seb-session', () => ({ createSebChallenge: mocks.challenge, getSebSession: mocks.session }))
import { authorizeWaitingExam, authorizeWaitingObject, readWaitingExamData } from './seb-waiting.server'

const assignmentId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const context = { kind: 'seb_exam_context', schemaVersion: 1, assignmentId, revision: 3, releaseId: `asr-${assignmentId.replaceAll('-', '')}-r3-${'a'.repeat(16)}`, contextId: 'b'.repeat(32), userId, issuedAt: 1, expiresAt: 9999999999999 }
let attempts: unknown[]
let reads: { table: string; fields: string }[]
let mutations: string[]
let completionRule: string
let passwordless: boolean
let objectSubmission: Record<string, unknown>
beforeEach(() => {
  vi.resetAllMocks()
  attempts = []; reads = []; mutations = []
  completionRule = 'fixed'; passwordless = true
  objectSubmission = { id: userId, status: 'in_progress', started_at: new Date().toISOString(), exam_access_mode: 'seb', seb_config_revision: 3,
    assignments: { duration_minutes: 30, end_at: null } }
  mocks.context.mockResolvedValue({ status: 'valid', claims: context })
  mocks.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: userId } } }) } })
  mocks.release.mockResolvedValue({ assignmentId, revision: 3, releaseId: context.releaseId })
  mocks.profile.mockReturnValue({ origin: 'https://korkru-seb-uat.vercel.app', profileId: 'waiting-room-completion-experimental-v1' })
  mocks.roster.mockResolvedValue(true); mocks.session.mockResolvedValue(null)
  mocks.startIntent.mockReturnValue('synthetic-intent'); mocks.csrf.mockReturnValue('synthetic-csrf'); mocks.challenge.mockReturnValue('synthetic-challenge')
  mocks.admin.mockReturnValue({ from(table: string) {
    let selected = ''
    const filters = new Map<string, unknown>()
    const query = {
      select(fields: string) { selected = fields; reads.push({ table, fields }); return query },
      eq(key: string, value: unknown) { filters.set(key, value); return query }, is() { return query }, order() { return query }, limit() { return query },
      insert() { mutations.push(table); return query }, update() { mutations.push(table); return query },
      maybeSingle() { return Promise.resolve(result()) },
      then(resolve: (value: unknown) => void) { return Promise.resolve(result()).then(resolve) },
    }
    function result() {
      const data = table === 'users' ? { id: userId, role: 'student', status: 'active', survey_role: 'student', full_name: 'ทดสอบ' }
        : table === 'assignments' ? selected === 'id' && !passwordless ? null : { id: assignmentId, title: 'ทดสอบ', status: 'published', type: 'exam', mode: 'online', secure_browser_mode: 'seb_required', duration_minutes: 30, start_at: null, end_at: null, max_attempts: 1, completion_rule: completionRule, passing_type: null, passing_value: null, display_max_score: null }
          : table === 'submissions' ? filters.has('id') ? objectSubmission : attempts : null
      return { data, error: null }
    }
    return query
  } })
})

describe('authenticated question-free waiting read', () => {
  it('does not create attempt, load pool/answers or serialize scores/hidden fields before start', async () => {
    const data = await readWaitingExamData({ assignmentId, revision: '3' })
    expect(data.ok).toBe(true)
    if (!data.ok) return
    expect(data.view.phase).toBe('ready'); expect(data.view.canStart).toBe(false)
    expect(mutations).toEqual([])
    expect(reads.some(read => ['questions', 'submission_answers', 'student_work_artifacts'].includes(read.table))).toBe(false)
    expect(reads.find(read => read.table === 'assignments')?.fields).not.toMatch(/question_ids|access_code|password|key/)
    expect(data).not.toHaveProperty('answers'); expect(data).not.toHaveProperty('questions'); expect(data).not.toHaveProperty('release')
    expect(mocks.startIntent).toHaveBeenCalledWith(context, { submissionId: null, attemptNumber: 0 })
  })
  it('requires the exact authenticated bound user', async () => {
    mocks.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: assignmentId } } }) } })
    expect(await authorizeWaitingExam({ assignmentId, revision: '3' })).toEqual({ ok: false, reason: 'account' })
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it.each(['streak', 'unknown'])('fails closed for unsupported %s pilot before start intent, challenge or questions', async rule => {
    completionRule = rule
    expect(await readWaitingExamData({ assignmentId, revision: '3' })).toMatchObject({ ok: false, reason: 'unsupported' })
    expect(mocks.startIntent).not.toHaveBeenCalled(); expect(mocks.challenge).not.toHaveBeenCalled()
    expect(reads.some(read => ['submissions', 'questions', 'submission_answers'].includes(read.table))).toBe(false)
    expect(mutations).toEqual([])
  })
  it('rejects a legacy entry code without selecting its value', async () => {
    passwordless = false
    expect(await readWaitingExamData({ assignmentId, revision: '3' })).toMatchObject({ ok: false, reason: 'unsupported' })
    expect(reads.every(read => !read.fields.includes('access_code'))).toBe(true)
    expect(mocks.startIntent).not.toHaveBeenCalled()
  })
  it('invalid marker never falls back to ordinary app', async () => {
    mocks.context.mockResolvedValue({ status: 'invalid' })
    expect(await readWaitingExamData({ assignmentId, revision: '3' })).toEqual({ ok: false, reason: 'context' })
    expect(mocks.release).not.toHaveBeenCalled(); expect(mocks.client).not.toHaveBeenCalled()
  })
  it('current release rotation invalidates a stale scope', async () => {
    mocks.release.mockResolvedValue({ assignmentId, revision: 4, releaseId: 'different' })
    expect(await readWaitingExamData({ assignmentId, revision: '3' })).toEqual({ ok: false, reason: 'release' })
    expect(mocks.client).not.toHaveBeenCalled()
  })
  it('roster removal rejects the waiting page', async () => {
    mocks.roster.mockResolvedValue(false)
    expect(await readWaitingExamData({ assignmentId, revision: '3' })).toEqual({ ok: false, reason: 'roster' })
  })
  it('returns active resume state without allocating another start intent', async () => {
    attempts = [{ id: userId, status: 'in_progress', started_at: new Date().toISOString(), attempt_number: 1, exam_access_mode: 'seb', seb_config_revision: 3 }]
    mocks.session.mockResolvedValue({ platform: 'windows' })
    const data = await readWaitingExamData({ assignmentId, revision: '3' })
    expect(data.ok).toBe(true)
    if (!data.ok) return
    expect(data.view.canResume).toBe(true); expect(data.startIntent).toBeNull()
    expect(mutations).toEqual([]); expect(mocks.startIntent).not.toHaveBeenCalled()
  })
  it('expired object rejects resource/write authority; only explicit recovery may resolve it', async () => {
    mocks.session.mockResolvedValue({ platform: 'windows' })
    objectSubmission.started_at = new Date(Date.now() - 60 * 60_000).toISOString()
    expect(await authorizeWaitingObject(context as never, 'submission', userId)).toBeNull()
    expect(await authorizeWaitingObject(context as never, 'submission', userId, { allowExpired: true })).not.toBeNull()
    expect(mutations).toEqual([])
    expect(reads.some(read => ['questions', 'submission_answers'].includes(read.table))).toBe(false)
  })
  it('expired-recovery option never bypasses unsupported pilot policy', async () => {
    completionRule = 'streak'; mocks.session.mockResolvedValue({ platform: 'windows' })
    expect(await authorizeWaitingObject(context as never, 'submission', userId, { allowExpired: true })).toBeNull()
    expect(mutations).toEqual([])
  })
})
