import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { sebExamApiSchema } from './seb-exam-api'

const actions = vi.hoisted(() => ({
  saveAnswer: vi.fn(), saveWorkImage: vi.fn(), checkAnswer: vi.fn(), rerollCheckedRandomAnswer: vi.fn(),
  drawNextStreakQuestion: vi.fn(), submitSubmission: vi.fn(), recordProctorSignal: vi.fn(),
  prepareStudentWorkArtifactUpload: vi.fn(), saveStudentWorkArtifact: vi.fn(), getStudentWorkArtifacts: vi.fn(),
  deleteStudentWorkArtifact: vi.fn(), prepareExamAttachmentUpload: vi.fn(), completeExamAttachmentUpload: vi.fn(), deleteExamAttachment: vi.fn(),
}))
vi.mock('@/lib/actions/submissions', () => actions)
vi.mock('@/lib/actions/exam-proctor', () => actions)
vi.mock('@/lib/actions/math-work', () => actions)
vi.mock('@/lib/actions/exam-attachments', () => actions)

const ID = '30000000-0000-4000-8000-000000000001'
const OTHER = '30000000-0000-4000-8000-000000000002'
const BASE = `/exam/${ID}/r/2`
const CSRF = 'synthetic-exam-csrf-token'
const STORAGE = 'https://storage.example.test'
const URL = `${STORAGE}/storage/v1/object/public/question-images/${ID}/figure.png`
const work = { submissionAnswerId: ID, partKey: 'answer', sourceType: 'scratchpad', includeScene: true, formatVersion: 1, previewFormat: 'png' }
const attachment = { submissionAnswerId: ID, kind: 'submission_file', uploadId: OTHER, name: 'file.pdf', mimeType: 'application/pdf', size: 100 }
const cases: { operation: keyof typeof actions; args: unknown[] }[] = [
  { operation: 'saveAnswer', args: [ID, 'answer'] },
  { operation: 'saveWorkImage', args: [ID, 0, URL] },
  { operation: 'checkAnswer', args: [ID] }, { operation: 'rerollCheckedRandomAnswer', args: [ID] },
  { operation: 'drawNextStreakQuestion', args: [ID] }, { operation: 'submitSubmission', args: [ID] },
  { operation: 'recordProctorSignal', args: [{ submissionId: ID, clientInstanceId: OTHER, tabVisible: true, fullscreen: true, events: [] }] },
  { operation: 'prepareStudentWorkArtifactUpload', args: [{ ...work, scene: {} }] },
  { operation: 'saveStudentWorkArtifact', args: [{ ...work, uploadId: OTHER, uploadReceipt: 'receipt' }] },
  { operation: 'getStudentWorkArtifacts', args: [ID] }, { operation: 'deleteStudentWorkArtifact', args: [ID] },
  { operation: 'prepareExamAttachmentUpload', args: [attachment] },
  { operation: 'completeExamAttachmentUpload', args: [attachment] },
  { operation: 'deleteExamAttachment', args: [{ submissionAnswerId: ID, kind: 'submission_file', url: URL }] },
]
let client: typeof import('./seb-exam-client')
let fetchMock: ReturnType<typeof vi.fn>
function at(pathname: string) { vi.stubGlobal('window', { location: { pathname } }) }
function configure() { at(`${BASE}/take`); client.configureWaitingExamTransport({ basePath: BASE, csrf: CSRF }) }
function respond(payload: unknown, ok = true) { fetchMock.mockResolvedValue({ ok, json: async () => payload }) }

beforeEach(async () => {
  vi.clearAllMocks(); vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', STORAGE)
  client = await import('./seb-exam-client')
  fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
  at(`/assignments/${ID}/take`)
  for (const action of Object.values(actions)) action.mockResolvedValue({ success: true })
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('typed student-only exam transport', () => {
  it.each(cases)('preserves ordinary $operation without fetch or argument rewriting', async ({ operation, args }) => {
    const call = client[operation] as (...args: unknown[]) => Promise<unknown>
    expect(await call(...args)).toEqual({ success: true })
    expect(actions[operation]).toHaveBeenCalledExactlyOnceWith(...args)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each(cases)('sends canonical $operation using the closed JSON API and no Server Action', async ({ operation, args }) => {
    configure(); respond({ result: { success: true } })
    const call = client[operation] as (...args: unknown[]) => Promise<unknown>
    expect(await call(...args)).toEqual({ success: true })
    expect(actions[operation]).not.toHaveBeenCalled()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE}/api`)
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { 'content-type': 'application/json', 'x-korkru-seb-csrf': CSRF } })
    expect(init.headers).not.toHaveProperty('next-action')
    const envelope = JSON.parse(init.body)
    expect(envelope).toEqual({ operation, args })
    expect(sebExamApiSchema.safeParse(envelope).success).toBe(true)
  })
  it('trims only trailing undefined optional tuple args and preserves explicit interior positions', async () => {
    configure(); respond({ result: { success: true } })
    await client.saveAnswer(ID, 'answer', undefined)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).args).toEqual([ID, 'answer'])
    expect(sebExamApiSchema.safeParse(JSON.parse(fetchMock.mock.calls[0][1].body)).success).toBe(true)
    await client.drawNextStreakQuestion(ID, undefined)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).args).toEqual([ID])
    await client.saveAnswer(ID, undefined as unknown as string, { answer: 'rad' })
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).args).toEqual([ID, null, { answer: 'rad' }])
  })
  it('keeps browser optional args unchanged on the ordinary path', async () => {
    await client.saveAnswer(ID, 'answer', undefined)
    expect(actions.saveAnswer).toHaveBeenCalledExactlyOnceWith(ID, 'answer', undefined)
  })
  it.each(['/exam', `${BASE}/take`, '/EXAM/invalid', '/%65xam/invalid', '/exam%2finvalid', '/exam\\invalid'])('fails closed without config on %s', async pathname => {
    at(pathname)
    await expect(client.saveAnswer(ID, 'answer')).rejects.toThrow()
    expect(() => client.waitingExamResourceUrl(URL)).toThrow()
    expect(fetchMock).not.toHaveBeenCalled(); expect(actions.saveAnswer).not.toHaveBeenCalled()
  })
  it('rejects a stale/different configured base rather than falling back to ordinary actions', async () => {
    configure(); at(`/exam/${OTHER}/r/2/take`)
    await expect(client.saveAnswer(ID, 'answer')).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled(); expect(actions.saveAnswer).not.toHaveBeenCalled()
  })
  it.each(['https://evil.test/exam/x', `${BASE}/`, `${BASE}?query`, BASE.replace('/r/2', '/r/02')])('rejects unsafe noncanonical config %s', basePath => {
    expect(() => client.configureWaitingExamTransport({ basePath, csrf: CSRF })).toThrow()
  })
  it.each(['', 'bad\r\nheader', 'a'.repeat(4097)])('rejects malformed CSRF input %#', csrf => {
    expect(() => client.configureWaitingExamTransport({ basePath: BASE, csrf })).toThrow()
  })
  it('returns received server refusal as an action result, not a retryable lost response', async () => {
    configure(); respond({ error: 'เซสชันหมดอายุ' }, false)
    expect(await client.saveAnswer(ID, 'answer')).toEqual({ error: 'เซสชันหมดอายุ' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
  it.each([{ result: [] }, { result: null }, { result: {} }, { error: '' }, { result: { success: true }, extra: 'forbidden' }, { secret: 'not surfaced' }])('fails safely on malformed envelope %#', async payload => {
    configure(); respond(payload)
    expect(await client.saveAnswer(ID, 'answer')).toHaveProperty('error')
  })
  it('retains thrown network failures for the existing idempotent retry policy', async () => {
    configure(); fetchMock.mockRejectedValue(new Error('dropped response'))
    await expect(client.saveAnswer(ID, 'answer')).rejects.toThrow('dropped response')
  })
  it('does not contaminate ordinary browser or SSR rendering after a configured exam', () => {
    configure(); at('/dashboard')
    expect(client.isWaitingExamTransport()).toBe(false)
    expect(client.waitingExamResourceUrl(URL)).toBe(URL)
    vi.stubGlobal('window', undefined)
    client.configureWaitingExamTransport({ basePath: BASE, csrf: 'another-request' })
    expect(client.isWaitingExamTransport()).toBe(false)
    expect(client.waitingExamResourceUrl(URL)).toBe(URL)
  })
})

describe('canonical student resource boundaries', () => {
  it('rewrites render URLs only, leaves local previews and already-proxied resources intact', () => {
    configure()
    expect(client.waitingExamResourceUrl(URL)).toBe(`${BASE}/resource?src=${encodeURIComponent(URL)}`)
    expect(client.waitingExamResourceUrl(`/storage/public/file.pdf?token=a&x=b`)).toBe(`${BASE}/resource?src=${encodeURIComponent('/storage/public/file.pdf?token=a&x=b')}`)
    for (const url of ['', 'blob:local-preview', 'data:image/png;base64,a']) expect(client.waitingExamResourceUrl(url)).toBe(url)
    const proxied = client.waitingExamResourceUrl(URL)
    expect(client.waitingExamResourceUrl(proxied)).toBe(proxied)
    expect(URL).toContain(STORAGE)
  })
  it('keeps ordinary receipt href but uses exact query-free canonical submitted href when active', () => {
    expect(client.waitingExamSubmittedHref(`/submissions/${ID}`)).toBe(`/submissions/${ID}`)
    configure()
    expect(client.waitingExamSubmittedHref(`/submissions/${ID}`)).toBe(`${BASE}/submitted`)
  })
  it('rewrites sanitized inline assets and links without reviving scripts, handlers or disallowed image sources', () => {
    configure()
    const html = client.waitingExamRichTextHtml(`<p><img src="${URL}" onerror="alert(1)"><img src="https://evil.test/a.png"><a href="javascript:alert(1)">bad</a><script>leak()</script><a href="${URL}">asset</a></p>`)
    expect(html).toContain(`src="${BASE}/resource?src=${encodeURIComponent(URL)}"`)
    expect(html).toContain(`href="${BASE}/resource?src=${encodeURIComponent(URL)}"`)
    expect(html).not.toMatch(/onerror|javascript:|<script|leak\(\)|evil\.test/)
    expect((html.match(/<img/g) ?? [])).toHaveLength(1)
  })
  it('ordinary rich text retains the existing sanitizer and original approved URLs', () => {
    expect(client.waitingExamRichTextHtml(`<img src="${URL}" onerror="alert(1)">`)).toBe(`<img src="${URL}">`)
  })
  it('preserves ordinary RichText markup/classes exactly and rewrites inline canonical images once', async () => {
    const { WaitingExamRichText } = await import('../components/exam/seb-exam-rich-text')
    const { RichText } = await import('../components/ui/rich-text')
    for (const text of ['plain text', '', `<p>text<img src="${URL}" onerror="alert(1)"></p>`]) {
      for (const blocks of [false, true]) {
        const props = { text, blocks, className: 'existing-layout' }
        expect(renderToStaticMarkup(createElement(WaitingExamRichText, props))).toBe(renderToStaticMarkup(createElement(RichText, props)))
      }
    }
    configure()
    const markup = renderToStaticMarkup(createElement(WaitingExamRichText, { text: `<img src="${URL}" onerror="alert(1)">` }))
    expect(markup).toContain(`src="${BASE}/resource?src=${encodeURIComponent(URL)}"`)
    expect(markup).not.toContain('onerror')
    expect(markup).not.toContain('%252F')
  })
  it.each(['attachment', 'math'])('uploads %s bytes to the canonical handler with receipt/CSRF and no Storage URL', async kind => {
    configure(); respond({ success: true })
    const target = kind === 'attachment' ? { examUploadReceipt: 'upload-receipt', token: 'never-send-token', path: 'private-object' }
      : { preview: { examUploadReceipt: 'upload-receipt', token: 'never-send-token', path: 'private-object' } }
    const blob = new Blob(['bytes'], { type: 'image/png' })
    expect(await client.uploadWaitingExamFile(target, blob, 'image/png')).toEqual({ error: null })
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${BASE}/resource/upload`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { 'content-type': 'image/png', 'x-korkru-seb-csrf': CSRF, 'x-korkru-seb-upload-receipt': 'upload-receipt' }, body: blob,
    })
  })
  it('preserves the signed receipt through the shared attachment retry/upload orchestration', async () => {
    configure(); respond({ success: true })
    const { uploadSubmissionCandidate } = await import('./exam-submission-upload')
    const blob = new Blob(['bytes'], { type: 'application/pdf' })
    const prepared = { success: true as const, reused: false as const, uploadId: OTHER,
      path: 'private-path', bucket: 'submission-files', token: 'ordinary-token', examUploadReceipt: 'receipt' }
    const file = { url: URL, type: 'application/pdf', name: 'file.pdf' }
    expect(await uploadSubmissionCandidate({ submissionAnswerId: ID,
      candidate: { file: blob, uploadId: OTHER, name: file.name, mimeType: file.type, size: blob.size }, retry: true }, {
      prepare: async () => prepared,
      upload: client.uploadWaitingExamFile,
      complete: async () => ({ success: true as const, file }),
    })).toEqual(file)
    expect(fetchMock.mock.calls[0][1].headers['x-korkru-seb-upload-receipt']).toBe('receipt')
    expect(prepared.path).toBe('private-path')
  })
  it.each([{}, { examUploadReceipt: '' }, { examUploadReceipt: 'bad\nheader' }, { preview: { token: 'direct-storage' } }])('rejects missing/malformed upload receipt %#', async target => {
    configure()
    expect((await client.uploadWaitingExamFile(target, new Blob(['x'], { type: 'image/png' }), 'image/png')).error).toBeInstanceOf(Error)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('rejects MIME mismatch and unsupported type before transmitting bytes', async () => {
    configure()
    expect((await client.uploadWaitingExamFile({ examUploadReceipt: 'receipt' }, new Blob(['x'], { type: 'image/jpeg' }), 'image/png')).error).toBeInstanceOf(Error)
    expect((await client.uploadWaitingExamFile({ examUploadReceipt: 'receipt' }, new Blob(['x']), 'image/svg+xml')).error).toBeInstanceOf(Error)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('does not silently use the binary helper for an ordinary upload', async () => {
    await expect(client.uploadWaitingExamFile({ examUploadReceipt: 'receipt' }, new Blob(['x']), 'image/png')).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('surfaces received binary refusal and never pretends the upload succeeded', async () => {
    configure(); respond({ error: 'อัปโหลดไม่ได้' }, false)
    expect((await client.uploadWaitingExamFile({ examUploadReceipt: 'receipt' }, new Blob(['x'], { type: 'image/png' }), 'image/png')).error?.message).toBe('อัปโหลดไม่ได้')
  })
  it('keeps canonical runner client-only and nested student rich text inside the same render boundary', () => {
    const runner = readFileSync(new globalThis.URL('../components/exam/seb-exam-runner.tsx', import.meta.url), 'utf8')
    expect(runner).toContain('ssr: false')
    expect(runner.indexOf('configureWaitingExamTransport({ basePath, csrf })')).toBeLessThan(runner.indexOf('return <ClientExam'))
    for (const name of ['exam-client', 'matching-drag-input', 'matching-line-input', 'ordering-drag-list']) {
      const source = readFileSync(new globalThis.URL(`../components/exam/${name}.tsx`, import.meta.url), 'utf8')
      expect(source).toContain('WaitingExamRichText as RichText')
    }
  })
})
