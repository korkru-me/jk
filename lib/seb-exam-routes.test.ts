import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  state: vi.fn(), csrf: vi.fn(), enabled: vi.fn(), release: vi.fn(), profile: vi.fn(), access: vi.fn(), object: vi.fn(), waiting: vi.fn(),
  completion: vi.fn(), artifact: vi.fn(), start: vi.fn(), draw: vi.fn(), save: vi.fn(), exam: vi.fn(), finalize: vi.fn(),
  cookie: { delete: vi.fn(), set: vi.fn() },
}))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => m.cookie }))
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`) }, notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/seb-exam-context.server', () => ({ readSebExamContext: m.state, validateSebExamContextCsrf: m.csrf, getSebExamCsrfToken: () => 'csrf' }))
vi.mock('@/lib/seb-assignment-release.server', () => ({ readCurrentAssignmentSebRelease: m.release }))
vi.mock('@/lib/seb-waiting-release-policy', () => ({ readWaitingSebProfile: m.profile, waitingSebFeatureEnabled: m.enabled }))
vi.mock('@/lib/seb-waiting-release.server', () => ({ loadWaitingSebArtifact: m.artifact }))
vi.mock('@/lib/seb-waiting.server', () => ({ authorizeWaitingExam: m.access, authorizeWaitingObject: m.object, readWaitingExamData: m.waiting }))
vi.mock('@/lib/seb-exam-completion.server', () => ({ readWaitingCompletion: m.completion }))
vi.mock('@/lib/actions/submissions', () => ({ startSubmission: m.start, drawNextStreakQuestion: m.draw, saveAnswer: m.save, finalizeExpiredSebSubmission: m.finalize }))
vi.mock('@/lib/actions/exam-attachments', () => ({}))
vi.mock('@/lib/actions/math-work', () => ({}))
vi.mock('@/lib/actions/exam-proctor', () => ({ recordProctorSignal: vi.fn() }))
vi.mock('@/lib/seb-exam-auth.server', () => ({ passwordLoginForWaiting: vi.fn(), prepareWaitingGoogleLogin: vi.fn(), sendWaitingMagicLink: vi.fn(), completeWaitingStudentProfile: vi.fn() }))
vi.mock('@/lib/seb-exam-resource.server', () => ({ signWaitingUploadTarget: vi.fn() }))
vi.mock('@/lib/exam-taking', () => ({ getExamTakingData: m.exam }))
vi.mock('@/components/exam/seb-exam-runner', () => ({ WaitingExamRunner: () => null }))
import { POST } from '@/app/exam/[assignmentId]/r/[revision]/api/route'
import { GET as completionGET } from '@/app/exam/[assignmentId]/r/[revision]/completion/route'
import TakePage from '@/app/exam/[assignmentId]/r/[revision]/take/page'

const assignmentId = '11111111-1111-4111-8111-111111111111'
const submissionId = '22222222-2222-4222-8222-222222222222'
const context = { assignmentId, revision: 3, userId: submissionId, releaseId: `asr-${assignmentId.replaceAll('-', '')}-r3-${'a'.repeat(16)}`, contextId: 'b'.repeat(32) }
const origin = 'https://korkru-seb-uat.vercel.app'
const base = `/exam/${assignmentId}/r/3`
const params = () => ({ params: Promise.resolve({ assignmentId, revision: '3' }) })
function request(operation: string, args: unknown[] = [], headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}${base}/api`, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-korkru-seb-csrf': 'csrf', ...headers }, body: JSON.stringify({ operation, args }) })
}
beforeEach(() => {
  vi.resetAllMocks()
  m.state.mockResolvedValue({ status: 'valid', claims: context }); m.csrf.mockReturnValue(true); m.enabled.mockReturnValue(true)
  m.release.mockResolvedValue({ releaseId: context.releaseId, revision: 3 }); m.profile.mockReturnValue({ origin })
  m.access.mockResolvedValue({ ok: true, context, account: { survey_role: 'student' }, profile: { origin } })
  m.object.mockResolvedValue({ submissionId }); m.completion.mockResolvedValue(null)
  m.start.mockResolvedValue({ submissionId }); m.draw.mockResolvedValue({ success: true })
  m.exam.mockResolvedValue({ assignment: { completion_rule: 'fixed' }, answers: [{ id: submissionId }] })
  m.waiting.mockResolvedValue({ ok: true, context, view: { phase: 'active', canResume: true, needsFinalization: false } })
})

describe('canonical operation integration negatives', () => {
  it.each(['getQuestions', 'getSolutions', 'deleteClassroom', 'updateSubmissionAnswerScore'])('denies %s before existing actions', async operation => {
    expect((await POST(request(operation, [submissionId]), params())).status).toBe(400)
    expect(m.start).not.toHaveBeenCalled(); expect(m.save).not.toHaveBeenCalled()
  })
  it.each<Record<string, string>>([{ origin: 'https://korkru.com' }, { 'next-action': 'guessed-build-id' }])('denies transport/origin spoofing', async headers => {
    expect((await POST(request('start', ['intent'], headers), params())).status).toBe(403)
    expect(m.start).not.toHaveBeenCalled()
  })
  it('denies missing native object ownership before saving any answer', async () => {
    m.object.mockResolvedValue(null)
    expect((await POST(request('saveAnswer', [submissionId, '2']), params())).status).toBe(403)
    expect(m.save).not.toHaveBeenCalled()
  })
  it('passes the signed intent unchanged, not a guessed predecessor or user', async () => {
    const response = await POST(request('start', ['immutable-intent']), params())
    expect(m.start).toHaveBeenCalledWith(assignmentId, undefined, undefined, 'immutable-intent')
    expect(await response.json()).toEqual({ result: { success: true, href: `${base}/take` } })
  })
  it.each(['start', 'resume'])('unsupported assignment rejects %s before any old action or question read', async operation => {
    m.access.mockResolvedValue({ ok: false, reason: 'unsupported' })
    const response = await POST(request(operation, operation === 'start' ? ['intent'] : []), params())
    expect(response.status).toBe(403)
    expect(m.start).not.toHaveBeenCalled(); expect(m.draw).not.toHaveBeenCalled(); expect(m.exam).not.toHaveBeenCalled()
  })
  it('reconciles a fixed started receipt in explicit resume POST', async () => {
    const response = await POST(request('resume'), params())
    expect(m.start).toHaveBeenCalledWith(assignmentId); expect(m.draw).not.toHaveBeenCalled()
    expect(await response.json()).toEqual({ result: { success: true, href: `${base}/take` } })
  })
  it('acknowledges a lost submit response only from the exact committed receipt', async () => {
    m.completion.mockResolvedValue({ receipt: { id: submissionId }, context })
    m.object.mockResolvedValue(null)
    const response = await POST(request('submitSubmission', [submissionId]), params())
    expect(await response.json()).toEqual({ result: { success: true } })
    expect(m.object).not.toHaveBeenCalled()
  })
  it('countdown submit after expiry finalizes only an exact native-authorized expired object', async () => {
    m.object.mockResolvedValueOnce(null).mockResolvedValueOnce({ submissionId })
    m.finalize.mockResolvedValue({ success: true, totalScore: 0 })
    const response = await POST(request('submitSubmission', [submissionId]), params())
    expect(m.object).toHaveBeenLastCalledWith(context, 'submission', submissionId, { allowExpired: true })
    expect(m.finalize).toHaveBeenCalledWith(submissionId)
    expect(await response.json()).toEqual({ result: { success: true, totalScore: 0 } })
  })
  it('does not claim success when expiry recovery cannot commit', async () => {
    m.object.mockResolvedValueOnce(null).mockResolvedValueOnce({ submissionId })
    m.finalize.mockResolvedValue({ error: 'บันทึกไม่สำเร็จ' })
    const response = await POST(request('submitSubmission', [submissionId]), params())
    expect(await response.json()).toEqual({ result: { error: 'บันทึกไม่สำเร็จ' } })
  })
  it('never reads questions or starts anything on direct pre-start GET', async () => {
    m.waiting.mockResolvedValue({ ok: true, view: { phase: 'ready', canResume: false } })
    await expect(TakePage(params())).rejects.toThrow(`redirect:${base}/waiting`)
    expect(m.exam).not.toHaveBeenCalled(); expect(m.start).not.toHaveBeenCalled(); expect(m.draw).not.toHaveBeenCalled()
  })
  it('rejects expired duration or effective deadline before materializing questions', async () => {
    m.waiting.mockResolvedValue({ ok: true, view: { phase: 'active', canResume: true, needsFinalization: true } })
    await expect(TakePage(params())).rejects.toThrow(`redirect:${base}/waiting`)
    expect(m.exam).not.toHaveBeenCalled()
  })
  it('does not serialize questions when the global deadline crosses during an awaited DTO read', async () => {
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: { id: submissionId, status: 'in_progress', exam_access_mode: 'seb', seb_config_revision: 3 }, error: null }) }
    m.access.mockResolvedValue({ ok: true, context, user: { id: submissionId }, admin: { from: () => query } })
    m.waiting.mockResolvedValue({ ok: true, view: { phase: 'active', canResume: true, needsFinalization: false, closesAt: new Date(now + 50).toISOString() } })
    m.exam.mockImplementation(async () => {
      clock.mockReturnValue(now + 100)
      return { assignment: { duration_minutes: null, completion_rule: 'fixed' }, submission: { id: submissionId, started_at: new Date(now).toISOString() }, answers: [{ id: submissionId }], artifacts: [] }
    })
    try { await expect(TakePage(params())).rejects.toThrow(`redirect:${base}/waiting`) } finally { clock.mockRestore() }
    expect(m.start).not.toHaveBeenCalled(); expect(m.draw).not.toHaveBeenCalled()
  })
})

describe('completion MIME/receipt boundary', () => {
  it.each(['', '?guess=1'])('pre-submit %s returns no SEB MIME, disposition or bytes', async search => {
    const response = await completionGET(new NextRequest(`${origin}${base}/completion${search}`), params())
    expect(response.status).toBe(403); expect(response.headers.get('content-type')).toContain('text/plain')
    expect(response.headers.has('content-disposition')).toBe(false); expect(m.artifact).not.toHaveBeenCalled(); expect(m.cookie.delete).not.toHaveBeenCalled()
  })
  it('a private artifact failure remains ordinary HTTP and retains verification', async () => {
    m.completion.mockResolvedValue({ context, receipt: { id: submissionId }, profile: { origin } })
    m.artifact.mockResolvedValue({ ok: false, code: 'SEB_WAITING_PROFILE_INVALID' })
    const response = await completionGET(new NextRequest(`${origin}${base}/completion`), params())
    expect(response.status).toBe(503); expect(response.headers.has('content-disposition')).toBe(false)
    expect(m.cookie.delete).not.toHaveBeenCalled()
  })
  it('only exact committed completion plus frozen bytes enables reconfiguration response', async () => {
    m.completion.mockResolvedValue({ context, receipt: { id: submissionId }, profile: { origin } })
    m.artifact.mockResolvedValue({ ok: true, bytes: new Uint8Array([1, 2, 3]), sizeBytes: 3 })
    const response = await completionGET(new NextRequest(`${origin}${base}/completion`), params())
    expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe('application/seb')
    expect(response.headers.get('cache-control')).toContain('no-store'); expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(m.cookie.delete).toHaveBeenCalledWith(`korkru-seb-${assignmentId}`)
  })
})
