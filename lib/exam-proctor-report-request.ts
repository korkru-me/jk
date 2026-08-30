import {
  parseProctorReportExportFilters,
  type ProctorReportExportFilters,
} from './exam-proctor-report'

export const PROCTOR_REPORT_REQUEST_BODY_LIMIT = 4_096

/**
 * Read the sensitive export request without ever buffering more than the
 * advertised byte limit. Content-Length is only an early rejection hint; the
 * stream counter remains authoritative when the header is absent or false.
 */
export async function parseProctorReportExportRequest(
  request: Request,
): Promise<ProctorReportExportFilters | null> {
  const contentType = request.headers.get('content-type')
    ?.split(';', 1)[0]
    .trim()
    .toLowerCase()
  if (contentType !== 'application/json') return null

  const contentLength = request.headers.get('content-length')
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) return null
    const declaredBytes = Number(contentLength)
    if (
      !Number.isSafeInteger(declaredBytes)
      || declaredBytes > PROCTOR_REPORT_REQUEST_BODY_LIMIT
    ) return null
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
      if (receivedBytes > PROCTOR_REPORT_REQUEST_BODY_LIMIT) {
        try {
          await reader.cancel()
        } catch {
          // The stream can already be errored; the request is still rejected.
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
      // Preserve the validation failure even if cancellation also fails.
    }
    return null
  }

  let value: unknown
  try {
    value = JSON.parse(rawBody)
  } catch {
    return null
  }
  return parseProctorReportExportFilters(value)
}
