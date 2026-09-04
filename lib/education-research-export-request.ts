import type { EducationResearchExportMode } from './education-research-export'

export const EDUCATION_RESEARCH_EXPORT_REQUEST_BODY_LIMIT = 1_024

export async function parseEducationResearchExportRequest(
  request: Request,
): Promise<{ mode: EducationResearchExportMode } | null> {
  const contentType = request.headers.get('content-type')
    ?.split(';', 1)[0]
    .trim()
    .toLowerCase()
  if (contentType !== 'application/json') return null

  const contentLength = request.headers.get('content-length')
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) return null
    const declaredBytes = Number(contentLength)
    if (!Number.isSafeInteger(declaredBytes)
      || declaredBytes > EDUCATION_RESEARCH_EXPORT_REQUEST_BODY_LIMIT) return null
  }

  const reader = request.body?.getReader()
  if (!reader) return null

  const decoder = new TextDecoder('utf-8', { fatal: true })
  let rawBody = ''
  let receivedBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      receivedBytes += value.byteLength
      if (receivedBytes > EDUCATION_RESEARCH_EXPORT_REQUEST_BODY_LIMIT) {
        try {
          await reader.cancel()
        } catch {
          // The request is rejected even if an already-failed stream cannot cancel.
        }
        return null
      }
      rawBody += decoder.decode(value, { stream: true })
    }
    rawBody += decoder.decode()
  } catch {
    try {
      await reader.cancel()
    } catch {
      // Preserve the validation failure.
    }
    return null
  }

  let value: unknown
  try {
    value = JSON.parse(rawBody)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 1) return null
  if (record.mode !== 'anonymous' && record.mode !== 'identified') return null
  return { mode: record.mode }
}
