import { describe, expect, it } from 'vitest'
import { duplicateDrawingScene } from '@/lib/drawing-board-duplicate'
import { CURRENT_WORK_FORMAT_VERSION } from '@/lib/math-work'
import type { ScratchpadScene } from '@/lib/scratchpad'

describe('duplicateDrawingScene', () => {
  it('clones only live semantic content with fresh linked identities', () => {
    const ids = {
      element: ['box-copy', 'text-copy', 'arrow-copy', 'image-copy'],
      file: ['file-copy'],
      group: ['group-copy'],
    }
    const source: ScratchpadScene = {
      formatVersion: CURRENT_WORK_FORMAT_VERSION,
      background: 'grid' as const,
      appState: { scrollX: 12 },
      elements: [
        {
          id: 'box', type: 'rectangle', isDeleted: false, frameId: null, groupIds: ['group'],
          boundElements: [{ id: 'text', type: 'text' }, { id: 'deleted', type: 'arrow' }],
        },
        {
          id: 'text', type: 'text', isDeleted: false, frameId: 'box', groupIds: ['group'],
          containerId: 'box', boundElements: null,
        },
        {
          id: 'arrow', type: 'arrow', isDeleted: false, frameId: null, groupIds: [],
          boundElements: null,
          startBinding: { elementId: 'box', focus: 0, gap: 1 },
          endBinding: { elementId: 'deleted', focus: 0, gap: 1 },
        },
        {
          id: 'image', type: 'image', isDeleted: false, frameId: null, groupIds: [],
          boundElements: null, fileId: 'file',
        },
        { id: 'deleted', type: 'rectangle', isDeleted: true, frameId: null, groupIds: [] },
      ],
      files: {
        file: { id: 'file', mimeType: 'image/png', dataURL: 'data:image/png;base64,AA==', created: 1 },
        orphan: { id: 'orphan', mimeType: 'image/png', dataURL: 'data:image/png;base64,AA==', created: 1 },
      },
    }

    const result = duplicateDrawingScene(source, kind => ids[kind].shift() ?? 'unexpected', 99)
    expect(result.scene.background).toBe('grid')
    expect(result.scene.appState).toEqual({ scrollX: 12 })
    expect(result.scene.elements).toHaveLength(4)
    expect(result.elementIdMap.get('deleted')).toBeUndefined()
    expect(result.fileIdMap.get('file')).toBe('file-copy')
    expect(result.scene.files).toEqual({
      'file-copy': {
        id: 'file-copy', mimeType: 'image/png', dataURL: 'data:image/png;base64,AA==', created: 99,
      },
    })

    const [box, text, arrow, image] = result.scene.elements as Array<Record<string, unknown>>
    expect(box).toMatchObject({ id: 'box-copy', boundElements: [{ id: 'text-copy', type: 'text' }] })
    expect(text).toMatchObject({ id: 'text-copy', frameId: 'box-copy', containerId: 'box-copy' })
    expect(text.groupIds).toEqual(['group-copy'])
    expect(arrow).toMatchObject({
      id: 'arrow-copy',
      startBinding: { elementId: 'box-copy', focus: 0, gap: 1 },
      endBinding: null,
    })
    expect(image).toMatchObject({ id: 'image-copy', fileId: 'file-copy' })
  })
})
