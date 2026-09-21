import { describe, expect, it } from 'vitest'
import { classifyStoredScratchpadScene } from '@/lib/scratchpad-storage'
import { CURRENT_WORK_FORMAT_VERSION } from '@/lib/math-work'

function scene(overrides: Record<string, unknown> = {}) {
  return {
    formatVersion: CURRENT_WORK_FORMAT_VERSION,
    elements: [],
    appState: {},
    files: {},
    background: 'lined',
    ...overrides,
  }
}

describe('stored scratchpad classification', () => {
  it('returns a ready scene only for supported student content', () => {
    expect(classifyStoredScratchpadScene(scene())).toMatchObject({ status: 'ready' })
  })

  it('distinguishes malformed raw data from unsupported content', () => {
    expect(classifyStoredScratchpadScene({ broken: true }))
      .toEqual({ status: 'invalid', issue: 'invalid-envelope' })
    expect(classifyStoredScratchpadScene(null))
      .toEqual({ status: 'invalid', issue: 'not-an-object' })
    expect(classifyStoredScratchpadScene(scene({
      elements: [{ id: 'embed-1', type: 'embeddable' }],
    }))).toEqual({ status: 'unsupported', issue: 'unsupported-element' })
  })

  it('does not mutate unsupported raw data while classifying it', () => {
    const raw = scene({
      elements: [{ id: 'image-1', type: 'image', fileId: 'file-1' }],
      files: { 'file-1': { id: 'file-1', dataURL: 'data:image/png;base64,AAAA', mimeType: 'image/png' } },
    })
    const before = JSON.stringify(raw)
    expect(classifyStoredScratchpadScene(raw).status).toBe('unsupported')
    expect(JSON.stringify(raw)).toBe(before)
  })
})
