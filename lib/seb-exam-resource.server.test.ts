import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), takingData: vi.fn(), writable: vi.fn(), secret: vi.fn(),
  inspect: vi.fn(), download: vi.fn(), upload: vi.fn(), fetch: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/seb-waiting.server', () => ({ authorizeWaitingObject: mocks.authorize }))
vi.mock('@/lib/exam-taking', () => ({ getExamTakingData: mocks.takingData }))
vi.mock('@/lib/exam-write-access', () => ({ getWritableStudentAnswer: mocks.writable }))
vi.mock('@/lib/seb', () => ({ readSebSessionSecret: mocks.secret }))
vi.mock('@/lib/exam-attachment-storage.server', () => ({ inspectStoredExamAttachment: mocks.inspect }))

import { createSebExamContextClaims } from '@/lib/seb-exam-context-core'
import { loadWaitingExamResource, signWaitingUploadTarget, executeWaitingExamUpload } from '@/lib/seb-exam-resource.server'
import { verifyWaitingExamUploadReceipt } from '@/lib/seb-exam-upload-receipt'
import { emptyScratchpadScene } from '@/lib/scratchpad'

const USER = '10000000-0000-4000-8000-000000000001'
const ASSIGNMENT = '30000000-0000-4000-8000-000000000003'
const SUBMISSION = '40000000-0000-4000-8000-000000000004'
const ANSWER = '50000000-0000-4000-8000-000000000005'
const UPLOAD = '60000000-0000-4000-8000-000000000006'
const OTHER_ANSWER = '70000000-0000-4000-8000-000000000007'
const ORIGIN = 'https://synthetic-staging.supabase.co'
const SECRET = 'synthetic-receipt-secret-fixture-not-real'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const PDF = Buffer.from('%PDF-1.7\nsynthetic fixture')
const FILE_PATH = `${USER}/${SUBMISSION}/${ANSWER}/${UPLOAD}.png`
const PREVIEW_PATH = `students/${USER}/${SUBMISSION}/${ANSWER}/${UPLOAD}/preview.png`
const SCENE_PATH = `students/${USER}/${SUBMISSION}/${ANSWER}/${UPLOAD}/scene.json`
const publicUrl = (bucket: string, path: string) => `${ORIGIN}/storage/v1/object/public/${bucket}/${path}`
const privateUrl = (path: string, token = 'synthetic-token') => `${ORIGIN}/storage/v1/object/sign/math-work-artifacts/${path}?token=${token}`
const context = () => createSebExamContextClaims({
  assignmentId: ASSIGNMENT, revision: 3,
  releaseId: `asr-${ASSIGNMENT.replaceAll('-', '')}-r3-${'a'.repeat(16)}`,
}, { userId: USER, contextId: 'd'.repeat(32) })

function admin() {
  return { storage: { from: vi.fn(() => ({ download: mocks.download, upload: mocks.upload })) } }
}
function access() {
  return { ok: true, admin: admin(), user: { id: USER }, submissionId: SUBMISSION, answerId: ANSWER }
}
function writable(overrides: Record<string, unknown> = {}) {
  return {
    answer: { id: ANSWER, carried_over: false },
    submission: { id: SUBMISSION, student_id: USER, assignment_id: ASSIGNMENT, status: 'in_progress',
      seb_config_revision: 3, exam_access_mode: 'seb' },
    assignment: { id: ASSIGNMENT, type: 'exam', mode: 'online', secure_browser_mode: 'seb_required',
      scratchpad_enabled: true, require_work_image: true },
    question: { question_type: 'written' }, ...overrides,
  }
}
function takingData() {
  return {
    submission: { id: SUBMISSION, student_id: USER, assignment_id: ASSIGNMENT },
    assignment: { secure_browser_verified: true, exam_access_mode: 'seb' },
    answers: [{ id: ANSWER, student_answer: null, work_images: [publicUrl('work-images', FILE_PATH)],
      questions: {
        question_type: 'written', question_text: `<p>โจทย์ <img src="${publicUrl('question-images', 'teacher/inline.png')}"></p>`,
        image_urls: [publicUrl('question-images', 'teacher/question.png')],
        mcq_options: [{ text: 'choice', image_url: publicUrl('question-images', 'teacher/choice.png') }],
        matching_options: [{ right_text: 'match', right_image: publicUrl('question-images', 'teacher/match.png') }],
        answer_parts: [{ sub_text: `<img src="${publicUrl('question-images', 'teacher/part.png')}">` }],
        extra_data: { parts: [{ image_urls: [publicUrl('question-images', 'teacher/composite.png')] }],
          attachment_urls: [publicUrl('question-images', 'teacher/reference.pdf')] },
      },
    }],
    artifacts: [{ id: UPLOAD, submissionAnswerId: ANSWER, previewUrl: privateUrl(PREVIEW_PATH), sceneUrl: privateUrl(SCENE_PATH) }],
  }
}
function prepared() {
  return { success: true, bucket: 'work-images', path: FILE_PATH, mimeType: 'image/png', size: PNG.length,
    token: 'synthetic-existing-storage-upload-token', uploadId: UPLOAD }
}

describe('canonical waiting-room resource proxy', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', ORIGIN)
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.fetch.mockReset()
    mocks.authorize.mockReset().mockResolvedValue(access())
    mocks.takingData.mockReset().mockResolvedValue(takingData())
    mocks.writable.mockReset().mockResolvedValue(writable())
    mocks.secret.mockReset().mockReturnValue(SECRET)
    mocks.inspect.mockReset().mockResolvedValue({ size: PNG.length, mimeType: 'image/png' })
    mocks.download.mockReset().mockResolvedValue({ data: new Blob([PNG], { type: 'image/png' }), error: null })
    mocks.upload.mockReset().mockResolvedValue({ data: { path: FILE_PATH }, error: null })
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it.each(['question', 'inline', 'choice', 'match', 'part', 'composite'])('downloads only exact safe DTO %s asset without fetching arbitrary URLs', async name => {
    const result = await loadWaitingExamResource(context(), SUBMISSION, publicUrl('question-images', `teacher/${name}.png`))
    expect(result).toMatchObject({ ok: true, mimeType: 'image/png' })
    if (!result.ok) throw new Error('unexpected fixture failure')
    expect(Buffer.from(result.bytes).equals(PNG)).toBe(true)
    expect(Object.isFrozen(result)).toBe(true)
    expect(mocks.download).toHaveBeenCalledWith(`teacher/${name}.png`)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('permits snapshot reference PDF, owned current work image and submitted file references', async () => {
    mocks.download.mockResolvedValue({ data: new Blob([PDF], { type: 'application/pdf' }), error: null })
    expect(await loadWaitingExamResource(context(), SUBMISSION, publicUrl('question-images', 'teacher/reference.pdf')))
      .toMatchObject({ ok: true, mimeType: 'application/pdf' })
    mocks.download.mockResolvedValue({ data: new Blob([PNG]), error: null })
    expect(await loadWaitingExamResource(context(), SUBMISSION, publicUrl('work-images', FILE_PATH))).toMatchObject({ ok: true })
    const data = takingData()
    data.answers[0].questions.question_type = 'file_upload'
    data.answers[0].student_answer = JSON.stringify([{ url: publicUrl('submission-files', FILE_PATH), name: 'fixture.png', type: 'image/png' }]) as never
    mocks.takingData.mockResolvedValue(data)
    expect(await loadWaitingExamResource(context(), SUBMISSION, publicUrl('submission-files', FILE_PATH))).toMatchObject({ ok: true })
  })

  it('matches current private artifact path, not its rotating signed token, and validates scene JSON', async () => {
    expect(await loadWaitingExamResource(context(), SUBMISSION, privateUrl(PREVIEW_PATH, 'older-token-not-authority'))).toMatchObject({ ok: true })
    expect(mocks.download).toHaveBeenCalledWith(PREVIEW_PATH)
    mocks.download.mockResolvedValue({ data: new Blob([JSON.stringify(emptyScratchpadScene())], { type: 'application/json' }), error: null })
    expect(await loadWaitingExamResource(context(), SUBMISSION, privateUrl(SCENE_PATH))).toMatchObject({ ok: true, mimeType: 'application/json' })
    mocks.download.mockResolvedValue({ data: new Blob(['{"script":"not a student scene"}']), error: null })
    expect(await loadWaitingExamResource(context(), SUBMISSION, privateUrl(SCENE_PATH))).toEqual({ ok: false, code: 'SEB_EXAM_RESOURCE_INVALID' })
  })

  it.each([
    'https://evil.test/storage/v1/object/public/question-images/teacher/question.png',
    `${ORIGIN}/rest/v1/questions`, `${ORIGIN}/storage/v1/object/public/solution-images/secret.png`,
    `${ORIGIN}/storage/v1/object/public/question-images/teacher/../question.png`,
    `${ORIGIN}/storage/v1/object/public/question-images/teacher/%2e%2e/question.png`,
    `${ORIGIN}/storage/v1/object/public/question-images/teacher%2fquestion.png`,
    `${ORIGIN}/storage/v1/object/public/question-images/teacher/question.png?download=1`,
    `${ORIGIN}/storage/v1/object/public/question-images/teacher/question.png#fragment`,
    privateUrl(PREVIEW_PATH) + '&token=duplicate', privateUrl(PREVIEW_PATH) + '&download=1',
    'data:image/png;base64,fixture', 'blob:https://korkru-seb-uat.vercel.app/fixture',
  ])('rejects invalid origin/scheme/query/path before private storage: %s', async src => {
    expect(await loadWaitingExamResource(context(), SUBMISSION, src)).toEqual({ ok: false, code: 'SEB_EXAM_RESOURCE_INVALID' })
    expect(mocks.authorize).not.toHaveBeenCalled()
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it('denies arbitrary same-origin objects, hidden solutions, unknown DTO fields and cross-answer/private paths', async () => {
    const data = takingData()
    Object.assign(data.answers[0].questions, {
      solution_image_urls: [publicUrl('question-images', 'teacher/solution.png')],
      secret_future_field: { image_url: publicUrl('question-images', 'teacher/hidden.png') },
    })
    data.artifacts.push({ id: OTHER_ANSWER, submissionAnswerId: OTHER_ANSWER,
      previewUrl: privateUrl(PREVIEW_PATH.replace(ANSWER, OTHER_ANSWER)), sceneUrl: privateUrl(SCENE_PATH.replace(ANSWER, OTHER_ANSWER)) })
    mocks.takingData.mockResolvedValue(data)
    for (const src of [publicUrl('question-images', 'teacher/not-in-exam.png'), publicUrl('question-images', 'teacher/solution.png'),
      publicUrl('question-images', 'teacher/hidden.png'), privateUrl(PREVIEW_PATH.replace(ANSWER, OTHER_ANSWER))]) {
      expect(await loadWaitingExamResource(context(), SUBMISSION, src)).toEqual({ ok: false, code: 'SEB_EXAM_RESOURCE_DENIED' })
    }
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it('rechecks current native/owner/scope and does not fall back from expired or absent context', async () => {
    const src = publicUrl('question-images', 'teacher/question.png')
    const expired = context()
    expired.issuedAt -= 2000
    expired.expiresAt = expired.issuedAt + 1
    expect(await loadWaitingExamResource(expired, SUBMISSION, src)).toEqual({ ok: false, code: 'SEB_EXAM_RESOURCE_DENIED' })
    mocks.authorize.mockResolvedValue(null)
    expect(await loadWaitingExamResource(context(), SUBMISSION, src)).toEqual({ ok: false, code: 'SEB_EXAM_RESOURCE_DENIED' })
    mocks.authorize.mockResolvedValue(access())
    const wrong = takingData()
    wrong.submission.student_id = ASSIGNMENT
    mocks.takingData.mockResolvedValue(wrong)
    expect(await loadWaitingExamResource(context(), SUBMISSION, src)).toEqual({ ok: false, code: 'SEB_EXAM_RESOURCE_DENIED' })
    mocks.takingData.mockResolvedValue({ ...takingData(), assignment: { secure_browser_verified: false, exam_access_mode: 'seb' } })
    expect(await loadWaitingExamResource(context(), SUBMISSION, src)).toEqual({ ok: false, code: 'SEB_EXAM_RESOURCE_DENIED' })
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it('bounds bytes before reading, never returns executable SVG/HTML, and redacts SDK failures', async () => {
    const src = publicUrl('question-images', 'teacher/question.png')
    const arrayBuffer = vi.fn()
    mocks.download.mockResolvedValue({ data: { size: 10 * 1024 * 1024 + 1, arrayBuffer }, error: null })
    expect(await loadWaitingExamResource(context(), SUBMISSION, src)).toEqual({ ok: false, code: 'SEB_EXAM_RESOURCE_TOO_LARGE' })
    expect(arrayBuffer).not.toHaveBeenCalled()
    for (const raw of ['<svg onload="alert(1)">', '<html>secret</html>', 'arbitrary-binary']) {
      mocks.download.mockResolvedValue({ data: new Blob([raw]), error: null })
      expect(await loadWaitingExamResource(context(), SUBMISSION, src)).toEqual({ ok: false, code: 'SEB_EXAM_RESOURCE_INVALID' })
    }
    mocks.download.mockResolvedValue({ data: null, error: { message: 'sensitive-storage-detail' } })
    expect(await loadWaitingExamResource(context(), SUBMISSION, src)).toEqual({ ok: false, code: 'SEB_EXAM_RESOURCE_UNAVAILABLE' })
    mocks.download.mockRejectedValue(new Error('sensitive-storage-detail'))
    expect(await loadWaitingExamResource(context(), SUBMISSION, src)).toEqual({ ok: false, code: 'SEB_EXAM_RESOURCE_FAILED' })
  })
})

describe('attempt-bound canonical binary uploads', () => {
  beforeEach(() => {
    mocks.authorize.mockReset().mockResolvedValue(access())
    mocks.writable.mockReset().mockResolvedValue(writable())
    mocks.secret.mockReset().mockReturnValue(SECRET)
    mocks.inspect.mockReset().mockResolvedValue({ size: PNG.length, mimeType: 'image/png' })
    mocks.download.mockReset().mockResolvedValue({ data: new Blob([PNG], { type: 'image/png' }), error: null })
    mocks.upload.mockReset().mockResolvedValue({ data: { path: FILE_PATH }, error: null })
  })

  it('signs only the trusted prepared target after live object/write checks, with no storage token or native keys', async () => {
    const claims = context()
    const receipt = await signWaitingUploadTarget(claims, ANSWER, prepared())
    expect(receipt).not.toBeNull()
    expect(mocks.authorize).toHaveBeenCalledWith(claims, 'answer', ANSWER)
    const decoded = verifyWaitingExamUploadReceipt(receipt!, claims, SECRET)!
    expect(decoded).toMatchObject({ path: FILE_PATH, mimeType: 'image/png', exactSize: PNG.length })
    expect(decoded).not.toHaveProperty('token')
    expect(decoded).not.toHaveProperty('configKey')
    expect(decoded).not.toHaveProperty('browserExamKeys')
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('derives only the prepared math preview MIME and preview limit; never permits scene/client arbitrary uploads', async () => {
    const claims = context()
    const token = await signWaitingUploadTarget(claims, ANSWER, { success: true, preview: { path: PREVIEW_PATH, token: 'not-copied' } })
    expect(verifyWaitingExamUploadReceipt(token!, claims, SECRET)).toMatchObject({ bucket: 'math-work-artifacts',
      path: PREVIEW_PATH, mimeType: 'image/png', maxBytes: 5 * 1024 * 1024, exactSize: null })
    expect(await signWaitingUploadTarget(claims, ANSWER, { success: true, preview: { path: SCENE_PATH } })).toBeNull()
    expect(await signWaitingUploadTarget(claims, ANSWER, { success: true, preview: { path: PREVIEW_PATH.replace('students/', 'teachers/') } })).toBeNull()
  })

  it('rejects forged targets, missing secrets, denied/expired/wrong native writes and revoked attachment affordances', async () => {
    const claims = context()
    for (const changed of [
      { ...prepared(), bucket: 'question-images' }, { ...prepared(), path: FILE_PATH.replace(ANSWER, OTHER_ANSWER) },
      { ...prepared(), mimeType: 'image/svg+xml' }, { ...prepared(), size: 0 }, { ...prepared(), success: false },
    ]) expect(await signWaitingUploadTarget(claims, ANSWER, changed)).toBeNull()
    mocks.secret.mockReturnValue(null)
    expect(await signWaitingUploadTarget(claims, ANSWER, prepared())).toBeNull()
    mocks.secret.mockReturnValue(SECRET)
    mocks.authorize.mockResolvedValue(null)
    expect(await signWaitingUploadTarget(claims, ANSWER, prepared())).toBeNull()
    mocks.authorize.mockResolvedValue(access())
    mocks.writable.mockResolvedValue({ error: 'หมดเวลาทำข้อสอบแล้ว' })
    expect(await signWaitingUploadTarget(claims, ANSWER, prepared())).toBeNull()
    mocks.writable.mockResolvedValue(writable({ submission: { ...writable().submission, seb_config_revision: 4 } }))
    expect(await signWaitingUploadTarget(claims, ANSWER, prepared())).toBeNull()
    mocks.writable.mockResolvedValue(writable({ assignment: { ...writable().assignment, scratchpad_enabled: false, require_work_image: false } }))
    expect(await signWaitingUploadTarget(claims, ANSWER, prepared())).toBeNull()
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('writes upsert:false, verifies actual stored bytes and invokes the existing inspector before success', async () => {
    const claims = context()
    const token = await signWaitingUploadTarget(claims, ANSWER, prepared())
    expect(await executeWaitingExamUpload(claims, token!, PNG, 'image/png')).toEqual({ ok: true, reused: false })
    expect(mocks.upload).toHaveBeenCalledWith(FILE_PATH, expect.any(Buffer), { contentType: 'image/png', cacheControl: '0', upsert: false })
    expect(mocks.inspect).toHaveBeenCalledWith(expect.anything(), { kind: 'work_image', path: FILE_PATH,
      expectedMimeType: 'image/png', expectedSize: PNG.length })
    expect(mocks.authorize).toHaveBeenCalledTimes(2)
  })

  it('supports prepared submission PDFs and math previews, never uploading math scene bytes', async () => {
    const claims = context()
    mocks.writable.mockResolvedValue(writable({ question: { question_type: 'file_upload' } }))
    const pdfPath = FILE_PATH.replace(/\.png$/, '.pdf')
    const pdfToken = await signWaitingUploadTarget(claims, ANSWER, {
      success: true, bucket: 'submission-files', path: pdfPath, mimeType: 'application/pdf', size: PDF.length,
    })
    mocks.download.mockResolvedValue({ data: new Blob([PDF], { type: 'application/pdf' }), error: null })
    mocks.inspect.mockResolvedValue({ size: PDF.length, mimeType: 'application/pdf' })
    expect(await executeWaitingExamUpload(claims, pdfToken!, PDF, 'application/pdf')).toEqual({ ok: true, reused: false })
    expect(mocks.inspect).toHaveBeenLastCalledWith(expect.anything(), {
      kind: 'submission_file', path: pdfPath, expectedMimeType: 'application/pdf', expectedSize: PDF.length,
    })

    mocks.writable.mockResolvedValue(writable())
    const previewToken = await signWaitingUploadTarget(claims, ANSWER, { success: true, preview: { path: PREVIEW_PATH } })
    mocks.download.mockResolvedValue({ data: new Blob([PNG], { type: 'image/png' }), error: null })
    mocks.inspect.mockClear()
    expect(await executeWaitingExamUpload(claims, previewToken!, PNG, 'image/png')).toEqual({ ok: true, reused: false })
    expect(mocks.inspect).not.toHaveBeenCalled()
    expect(mocks.upload).toHaveBeenLastCalledWith(PREVIEW_PATH, expect.any(Buffer), {
      contentType: 'image/png', cacheControl: '0', upsert: false,
    })
    expect(await executeWaitingExamUpload(claims, previewToken!, Buffer.from('{}'), 'application/json'))
      .toEqual({ ok: false, code: 'SEB_EXAM_UPLOAD_INVALID' })
  })

  it('rejects MIME/size/signature mismatch before write and context/account replay before object lookup', async () => {
    const claims = context()
    const token = await signWaitingUploadTarget(claims, ANSWER, prepared())
    for (const [bytes, mime] of [[PNG, 'image/jpeg'], [PNG.subarray(0, 8), 'image/png'], [Buffer.alloc(PNG.length), 'image/png']] as const) {
      expect(await executeWaitingExamUpload(claims, token!, bytes, mime)).toEqual({ ok: false, code: 'SEB_EXAM_UPLOAD_INVALID' })
    }
    mocks.authorize.mockClear()
    expect(await executeWaitingExamUpload({ ...claims, userId: ASSIGNMENT }, token!, PNG, 'image/png'))
      .toEqual({ ok: false, code: 'SEB_EXAM_UPLOAD_DENIED' })
    expect(mocks.authorize).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('rechecks committed status, current native context and writable timing rather than trusting a valid receipt', async () => {
    const claims = context()
    const token = await signWaitingUploadTarget(claims, ANSWER, prepared())
    mocks.authorize.mockResolvedValue(null)
    expect(await executeWaitingExamUpload(claims, token!, PNG, 'image/png')).toEqual({ ok: false, code: 'SEB_EXAM_UPLOAD_DENIED' })
    mocks.authorize.mockResolvedValue(access())
    mocks.writable.mockResolvedValue({ error: 'ส่งงานแล้ว' })
    expect(await executeWaitingExamUpload(claims, token!, PNG, 'image/png')).toEqual({ ok: false, code: 'SEB_EXAM_UPLOAD_DENIED' })
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('handles a lost-response retry only by verifying identical existing bytes without overwrite/delete', async () => {
    const claims = context()
    const token = await signWaitingUploadTarget(claims, ANSWER, prepared())
    mocks.upload.mockResolvedValue({ error: { message: 'already-exists', statusCode: 409 } })
    expect(await executeWaitingExamUpload(claims, token!, PNG, 'image/png')).toEqual({ ok: true, reused: true })
    const other = Buffer.from(PNG)
    other[other.length - 1] ^= 1
    mocks.download.mockResolvedValue({ data: new Blob([other]), error: null })
    expect(await executeWaitingExamUpload(claims, token!, PNG, 'image/png')).toEqual({ ok: false, code: 'SEB_EXAM_UPLOAD_FAILED' })
    expect(mocks.upload.mock.calls.every(call => call[2].upsert === false)).toBe(true)
  })

  it('preserves existing stored validation failures and redacts storage exceptions', async () => {
    const claims = context()
    const token = await signWaitingUploadTarget(claims, ANSWER, prepared())
    mocks.inspect.mockResolvedValue({ error: 'sensitive-invalid-storage-metadata' })
    expect(await executeWaitingExamUpload(claims, token!, PNG, 'image/png')).toEqual({ ok: false, code: 'SEB_EXAM_UPLOAD_FAILED' })
    mocks.upload.mockRejectedValue(new Error('sensitive-storage-error'))
    expect(await executeWaitingExamUpload(claims, token!, PNG, 'image/png')).toEqual({ ok: false, code: 'SEB_EXAM_UPLOAD_FAILED' })
  })
})
