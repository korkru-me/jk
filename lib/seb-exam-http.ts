/** Bound the stream itself: Content-Length may be omitted or dishonest. */
export async function readBoundedExamBody(request: Request, limit: number): Promise<Uint8Array | null> {
  const declared = request.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) return null
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel(); return null }
      chunks.push(value)
    }
  } catch { return null } finally { reader.releaseLock() }
  if (size === 0 || (declared !== null && Number(declared) !== size)) return null
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

export const EXAM_PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
} as const
