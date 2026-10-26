import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_POST_PDF_BYTES, postPdfSource, readPostPdf } from './post-pdf-preview'

const BASE = 'https://classroom-test.supabase.co'
const FILE = `${BASE}/storage/v1/object/public/classroom-post-files/teacher/file.pdf`

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('announcement PDF source', () => {
  it('keeps the approved source while removing download and viewer fragments', () => {
    expect(postPdfSource(`${FILE}?download=old.pdf&version=2#page=3`, BASE, false)).toBe(`${FILE}?version=2`)
  })

  it.each([
    'https://other.example/storage/v1/object/public/classroom-post-files/file.pdf',
    `${BASE}/storage/v1/object/public/question-images/file.pdf`,
    'https://teacher:password@classroom-test.supabase.co/storage/v1/object/public/classroom-post-files/file.pdf',
    `${BASE}/storage/v1/object/public/classroom-post-files/teacher%2Ffile.pdf`,
    `${BASE}/storage/v1/object/public/classroom-post-files/`,
    'javascript:alert(1)',
    'data:application/pdf;base64,JVBERi0=',
  ])('rejects an untrusted source: %s', value => {
    expect(postPdfSource(value, BASE, false)).toBeNull()
  })

  it('limits the local exception to one fixture and disables it in production', () => {
    const fixture = '/exam-screen-lab/grading-workspace/assets/file-0.pdf'
    expect(postPdfSource(fixture, BASE, true)).toBe(fixture)
    expect(postPdfSource(fixture, BASE, false)).toBeNull()
    expect(postPdfSource(`${fixture}?redirect=elsewhere`, BASE, true)).toBeNull()
  })

  it('allows the hosted fixture only on the canonical Staging origin', () => {
    const fixture = '/exam-screen-lab/grading-workspace/assets/file-0.pdf'
    vi.stubEnv('NODE_ENV', 'production')
    expect(postPdfSource(fixture, BASE)).toBeNull()
    vi.stubGlobal('window', { location: { origin: 'https://www.korkru.com' } })
    expect(postPdfSource(fixture, BASE)).toBeNull()
    vi.stubGlobal('window', { location: { origin: 'https://staging.korkru.com.example.invalid' } })
    expect(postPdfSource(fixture, BASE)).toBeNull()
    vi.stubGlobal('window', { location: { origin: 'https://staging.korkru.com' } })
    expect(postPdfSource(fixture, BASE)).toBe(fixture)
    expect(postPdfSource('/exam-screen-lab/grading-workspace/assets/file-1.pdf', BASE)).toBeNull()
  })
})

describe('announcement PDF bytes', () => {
  it('handles a PDF signature split across response chunks', async () => {
    const response = new Response(new ReadableStream({ start(controller) {
      for (const text of ['%PD', 'F-1.4\n', 'sample']) controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    } }), { headers: { 'Content-Type': 'application/octet-stream' } })
    const pdf = await readPostPdf(response)
    expect(pdf.type).toBe('application/pdf')
    expect(await pdf.text()).toBe('%PDF-1.4\nsample')
  })

  const invalidResponses: { body: string; headers: Record<string, string> }[] = [
    { body: '<html>not a PDF</html>', headers: { 'Content-Type': 'application/pdf' } },
    { body: '%PDF-1.4\n', headers: { 'Content-Type': 'text/html' } },
    { body: '%PDF-1.4\n', headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(MAX_POST_PDF_BYTES + 1) } },
    { body: '%PDF-1.4\n', headers: { 'Content-Type': 'application/pdf', 'Content-Length': 'unknown' } },
  ]
  it.each(invalidResponses)('rejects invalid MIME, signature or declared size: $headers', async ({ body, headers }) => {
    await expect(readPostPdf(new Response(body, { headers }))).rejects.toThrow()
  })

  it('cancels an oversized stream even when its declared size is small', async () => {
    let cancelled = false
    const response = new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(MAX_POST_PDF_BYTES + 1)) },
      cancel() { cancelled = true },
    }), { headers: { 'Content-Type': 'application/pdf', 'Content-Length': '10' } })
    await expect(readPostPdf(response)).rejects.toThrow('preview limit')
    expect(cancelled).toBe(true)
  })

  it('rejects an unsuccessful response', async () => {
    await expect(readPostPdf(new Response('%PDF-1.4\n', { status: 404, headers: { 'Content-Type': 'application/pdf' } }))).rejects.toThrow()
  })
})
