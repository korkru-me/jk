import { describe, expect, it } from 'vitest'
import {
  classifyScratchpadRevision,
  classifyStoredScratchpadScene,
} from '@/lib/scratchpad-storage'
import { CURRENT_WORK_FORMAT_VERSION } from '@/lib/math-work'
import type { ScratchpadScene } from '@/lib/scratchpad'
import {
  initialScratchpadRevision,
  markScratchpadAttached,
  reviseScratchpad,
  scratchpadAttachmentState,
  scratchpadSemanticFingerprint,
} from '@/lib/scratchpad-state'

function scene(overrides: Partial<ScratchpadScene> = {}): ScratchpadScene {
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

  it('keeps old scene-only records readable with unverified revision metadata', () => {
    const storedScene = scene()
    expect(classifyScratchpadRevision(undefined, storedScene)).toEqual(
      initialScratchpadRevision(storedScene),
    )
  })

  it('drops attachment verification when metadata does not match the stored scene', () => {
    const storedScene = scene()
    const metadata = markScratchpadAttached(
      initialScratchpadRevision(storedScene),
      {
        id: 'artifact-1',
        submissionAnswerId: 'answer-1',
        partKey: 'answer',
        sourceType: 'scratchpad',
        formatVersion: CURRENT_WORK_FORMAT_VERSION,
        previewUrl: null,
        sceneUrl: null,
        updatedAt: '2026-09-21T00:00:00.000Z',
      },
    )
    const changed = scene({ background: 'grid' })
    expect(classifyScratchpadRevision(metadata, changed)).toMatchObject({
      currentFingerprint: scratchpadSemanticFingerprint(changed),
      attachment: null,
    })
  })

  it('preserves a verified stale attachment when the stored metadata matches the edited scene', () => {
    const attachedScene = scene()
    const attachedArtifact = {
      id: 'artifact-1',
      submissionAnswerId: 'answer-1',
      partKey: 'answer',
      sourceType: 'scratchpad' as const,
      formatVersion: CURRENT_WORK_FORMAT_VERSION,
      previewUrl: null,
      sceneUrl: null,
      updatedAt: '2026-09-21T00:00:00.000Z',
    }
    const attached = markScratchpadAttached(
      initialScratchpadRevision(attachedScene),
      attachedArtifact,
    )
    const editedScene = scene({ background: 'grid' })
    const persisted = classifyScratchpadRevision(
      reviseScratchpad(attached, editedScene),
      editedScene,
    )
    expect(scratchpadAttachmentState({ artifact: attachedArtifact, metadata: persisted }))
      .toBe('attached_stale')
  })

  it('keeps only a fully validated one-step recovery', () => {
    const storedScene = scene()
    const recoveryScene = scene({ background: 'dots' })
    const metadata = {
      ...initialScratchpadRevision(storedScene),
      recovery: {
        state: 'available_once',
        scene: recoveryScene,
        fingerprint: scratchpadSemanticFingerprint(recoveryScene),
        createdAt: 100,
      },
    }
    expect(classifyScratchpadRevision(metadata, storedScene).recovery)
      .toMatchObject({ state: 'available_once', createdAt: 100 })
    expect(classifyScratchpadRevision({
      ...metadata,
      recovery: { ...metadata.recovery, fingerprint: scratchpadSemanticFingerprint(storedScene) },
    }, storedScene).recovery).toEqual({ state: 'none' })
  })
})
