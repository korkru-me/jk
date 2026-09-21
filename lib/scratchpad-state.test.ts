import { describe, expect, it } from 'vitest'
import { CURRENT_WORK_FORMAT_VERSION, type StudentWorkArtifactView } from './math-work'
import type { ScratchpadScene } from './scratchpad'
import {
  initialScratchpadRevision,
  markScratchpadAttached,
  reviseScratchpad,
  scratchpadAttachmentState,
  scratchpadHasMeaningfulDraft,
  scratchpadSemanticFingerprint,
} from './scratchpad-state'

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

function artifact(overrides: Partial<StudentWorkArtifactView> = {}): StudentWorkArtifactView {
  return {
    id: 'artifact-1',
    submissionAnswerId: 'answer-1',
    partKey: 'answer',
    sourceType: 'scratchpad',
    formatVersion: CURRENT_WORK_FORMAT_VERSION,
    previewUrl: null,
    sceneUrl: null,
    updatedAt: '2026-09-21T00:00:00.000Z',
    ...overrides,
  }
}

describe('student scratchpad revision state', () => {
  it('ignores view state, deleted tombstones, and Excalidraw revision timestamps', () => {
    const visible = {
      id: 'line-1', type: 'line', isDeleted: false, x: 10, y: 20,
      version: 1, versionNonce: 10, updated: 100,
    }
    const baseline = scene({ elements: [visible], appState: { scrollX: 0, zoom: { value: 1 } } })
    const navigated = scene({
      elements: [
        { ...visible, version: 9, versionNonce: 99, updated: 999 },
        { id: 'old-line', type: 'line', isDeleted: true, x: 500, y: 500 },
      ],
      appState: { scrollX: 300, zoom: { value: 2 }, activeTool: { type: 'text' } },
    })
    expect(scratchpadSemanticFingerprint(navigated))
      .toBe(scratchpadSemanticFingerprint(baseline))
  })

  it('changes for visible content, referenced file payloads, and background', () => {
    const baseline = scene({ elements: [{ id: 'line-1', type: 'line', isDeleted: false, x: 10 }] })
    expect(scratchpadSemanticFingerprint(scene({
      elements: [{ id: 'line-1', type: 'line', isDeleted: false, x: 11 }],
    }))).not.toBe(scratchpadSemanticFingerprint(baseline))
    expect(scratchpadSemanticFingerprint(scene({ background: 'grid' })))
      .not.toBe(scratchpadSemanticFingerprint(scene()))

    const withImage = scene({
      elements: [{ id: 'image-1', type: 'image', isDeleted: false, fileId: 'file-1' }],
      files: { 'file-1': { id: 'file-1', dataURL: 'data:image/png;base64,AAAA' } },
    })
    expect(scratchpadSemanticFingerprint(withImage)).not.toBe(scratchpadSemanticFingerprint({
      ...withImage,
      files: { 'file-1': { id: 'file-1', dataURL: 'data:image/png;base64,BBBB' } },
    }))
  })

  it('increments only for semantic edits', () => {
    const initial = initialScratchpadRevision(scene())
    expect(reviseScratchpad(initial, scene({ appState: { scrollX: 20 } }))).toBe(initial)
    const edited = reviseScratchpad(initial, scene({ background: 'dots' }))
    expect(edited.editRevision).toBe(1)
    expect(edited.savedRevision).toBe(0)
  })

  it('tracks current, stale, unverified, and missing attachments', () => {
    const attachedArtifact = artifact()
    const initial = initialScratchpadRevision(scene())
    expect(scratchpadAttachmentState({ artifact: null, metadata: initial })).toBe('not_attached')
    expect(scratchpadAttachmentState({ artifact: attachedArtifact, metadata: initial }))
      .toBe('attached_unverified')

    const attached = markScratchpadAttached(initial, attachedArtifact)
    expect(scratchpadAttachmentState({ artifact: attachedArtifact, metadata: attached }))
      .toBe('attached_current')

    const edited = reviseScratchpad(attached, scene({ background: 'blank' }))
    expect(scratchpadAttachmentState({ artifact: attachedArtifact, metadata: edited }))
      .toBe('attached_stale')
    expect(scratchpadAttachmentState({
      artifact: artifact({ updatedAt: '2026-09-21T01:00:00.000Z' }),
      metadata: edited,
    })).toBe('attached_unverified')
  })

  it('recognizes only visible work or a changed paper as a meaningful draft', () => {
    expect(scratchpadHasMeaningfulDraft(scene())).toBe(false)
    expect(scratchpadHasMeaningfulDraft(scene({
      elements: [{ id: 'deleted', type: 'line', isDeleted: true }],
    }))).toBe(false)
    expect(scratchpadHasMeaningfulDraft(scene({ background: 'grid' }))).toBe(true)
    expect(scratchpadHasMeaningfulDraft(scene({
      elements: [{ id: 'line-1', type: 'line', isDeleted: false }],
    }))).toBe(true)
  })
})
