import { POST_FILE_PREFIX } from '@/lib/attachment-display'

export const MAX_POST_PDF_BYTES = 10 * 1024 * 1024

/** Preview only this project's announcement files, or one local QA document. */
export function postPdfSource(value: string, storageBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, allowLocalFixture = process.env.NODE_ENV !== 'production' || (typeof window !== 'undefined' && window.location.origin === 'https://staging.korkru.com')): string | null {
  if (allowLocalFixture && value === '/exam-screen-lab/grading-workspace/assets/file-0.pdf') return value
  try {
    const url = new URL(value)
    const storage = new URL(storageBaseUrl ?? '')
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== storage.origin || url.username || url.password) return null
    if (!url.pathname.startsWith(POST_FILE_PREFIX) || url.pathname.length === POST_FILE_PREFIX.length || /%2e|%2f|%5c/i.test(url.pathname)) return null
    url.searchParams.delete('download')
    url.hash = ''
    return url.href
  } catch { return null }
}

/** A download response becomes a typed PDF Blob only after bounded validation. */
export async function readPostPdf(response: Response): Promise<Blob> {
  const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  const length = response.headers.get('content-length')
  if (!response.ok || !['application/pdf', 'application/octet-stream'].includes(mime ?? '') || (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_POST_PDF_BYTES)) || !response.body) {
    await response.body?.cancel()
    throw new Error('invalid PDF response')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_POST_PDF_BYTES) {
        await reader.cancel()
        throw new Error('PDF exceeds preview limit')
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('invalid PDF signature')
  return new Blob([bytes], { type: 'application/pdf' })
}
