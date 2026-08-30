import { describe, expect, it } from 'vitest'
import {
  PROCTOR_REPORT_REQUEST_BODY_LIMIT,
  parseProctorReportExportRequest,
} from './exam-proctor-report-request'

const STUDENT_ID = 'd8f57df1-7fbf-4ac3-86ec-d384045838c3'

function validBody() {
  return {
    studentId: STUDENT_ID,
    submissionId: null,
    kind: 'reviewable',
    review: 'all',
  }
}

function streamRequest(
  chunks: Uint8Array[],
  headers: Record<string, string> = { 'Content-Type': 'application/json' },
  onCancel?: () => void,
): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
    cancel() {
      onCancel?.()
    },
  })
  const init = {
    method: 'POST',
    headers,
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' }
  return new Request('https://korkru.test/proctor-report', init)
}

describe('parseProctorReportExportRequest', () => {
  it('accepts strict JSON delivered across multiple stream chunks', async () => {
    const encoder = new TextEncoder()
    const raw = JSON.stringify(validBody())
    const bytes = encoder.encode(raw)
    const splitAt = Math.floor(bytes.length / 2)
    const request = streamRequest(
      [bytes.slice(0, splitAt), bytes.slice(splitAt)],
      { 'Content-Type': 'application/json; charset=utf-8' },
    )

    await expect(parseProctorReportExportRequest(request)).resolves.toEqual(validBody())
  })

  it('rejects an oversized declared length before pulling the body', async () => {
    let bodyAccessed = false
    const request = {
      headers: new Headers({
        'Content-Type': 'application/json',
        'Content-Length': String(PROCTOR_REPORT_REQUEST_BODY_LIMIT + 1),
      }),
      get body() {
        bodyAccessed = true
        return null
      },
    } as Request

    const parsed = await parseProctorReportExportRequest(request)
    expect(parsed).toBeNull()
    expect(bodyAccessed).toBe(false)
  })

  it('caps actual streamed UTF-8 bytes and cancels an oversized body', async () => {
    let cancelled = false
    const oversized = new TextEncoder().encode(
      'ก'.repeat(Math.ceil(PROCTOR_REPORT_REQUEST_BODY_LIMIT / 3) + 1),
    )
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(oversized)
      },
      cancel() {
        cancelled = true
      },
    })
    const request = {
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body,
    } as Request

    await expect(parseProctorReportExportRequest(request)).resolves.toBeNull()
    expect(cancelled).toBe(true)
  })

  it('rejects the wrong media type, malformed length, and invalid UTF-8', async () => {
    const encoded = new TextEncoder().encode(JSON.stringify(validBody()))
    await expect(parseProctorReportExportRequest(streamRequest(
      [encoded],
      { 'Content-Type': 'text/plain' },
    ))).resolves.toBeNull()
    await expect(parseProctorReportExportRequest(streamRequest(
      [encoded],
      { 'Content-Type': 'application/json', 'Content-Length': '4KiB' },
    ))).resolves.toBeNull()
    await expect(parseProctorReportExportRequest(streamRequest(
      [new Uint8Array([0xc3, 0x28])],
    ))).resolves.toBeNull()
  })
})
