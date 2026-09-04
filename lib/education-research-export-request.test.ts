import { describe, expect, it } from 'vitest'
import {
  EDUCATION_RESEARCH_EXPORT_REQUEST_BODY_LIMIT,
  parseEducationResearchExportRequest,
} from './education-research-export-request'

function streamRequest(
  chunks: Uint8Array[],
  headers: Record<string, string> = { 'Content-Type': 'application/json' },
  onCancel?: () => void,
): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(chunk))
      controller.close()
    },
    cancel() {
      onCancel?.()
    },
  })
  return new Request('https://korkru.test/research/data-export', {
    method: 'POST',
    headers,
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
}

describe('parseEducationResearchExportRequest', () => {
  it('accepts either supported mode from strict JSON', async () => {
    const encoder = new TextEncoder()
    await expect(parseEducationResearchExportRequest(streamRequest([
      encoder.encode('{"mode":"anonymous"}'),
    ]))).resolves.toEqual({ mode: 'anonymous' })
    await expect(parseEducationResearchExportRequest(streamRequest([
      encoder.encode('{"mode":"identified"}'),
    ], { 'Content-Type': 'application/json; charset=utf-8' }))).resolves.toEqual({ mode: 'identified' })
  })

  it('rejects unknown fields, modes, media types, and malformed JSON', async () => {
    const encoder = new TextEncoder()
    await expect(parseEducationResearchExportRequest(streamRequest([
      encoder.encode('{"mode":"anonymous","studentId":"leak"}'),
    ]))).resolves.toBeNull()
    await expect(parseEducationResearchExportRequest(streamRequest([
      encoder.encode('{"mode":"csv"}'),
    ]))).resolves.toBeNull()
    await expect(parseEducationResearchExportRequest(streamRequest([
      encoder.encode('{'),
    ]))).resolves.toBeNull()
    await expect(parseEducationResearchExportRequest(streamRequest([
      encoder.encode('{"mode":"anonymous"}'),
    ], { 'Content-Type': 'text/plain' }))).resolves.toBeNull()
  })

  it('rejects oversized declared and streamed bodies', async () => {
    let bodyAccessed = false
    const declared = {
      headers: new Headers({
        'Content-Type': 'application/json',
        'Content-Length': String(EDUCATION_RESEARCH_EXPORT_REQUEST_BODY_LIMIT + 1),
      }),
      get body() {
        bodyAccessed = true
        return null
      },
    } as Request
    await expect(parseEducationResearchExportRequest(declared)).resolves.toBeNull()
    expect(bodyAccessed).toBe(false)

    let cancelled = false
    const oversized = new TextEncoder().encode('ก'.repeat(400))
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(oversized)
      },
      cancel() {
        cancelled = true
      },
    })
    const streamed = {
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body,
    } as Request
    await expect(parseEducationResearchExportRequest(streamed)).resolves.toBeNull()
    expect(cancelled).toBe(true)
  })
})
