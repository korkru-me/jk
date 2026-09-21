import type { ScratchpadScene } from '@/lib/scratchpad'

export interface DuplicatedDrawingScene {
  scene: ScratchpadScene
  elementIdMap: ReadonlyMap<string, string>
  fileIdMap: ReadonlyMap<string, string>
}

type IdFactory = (kind: 'element' | 'file' | 'group') => string

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function remapBinding(
  value: unknown,
  elementIdMap: ReadonlyMap<string, string>,
): unknown {
  if (!isRecord(value) || typeof value.elementId !== 'string') return null
  const elementId = elementIdMap.get(value.elementId)
  return elementId ? { ...value, elementId } : null
}

/**
 * Creates the semantic draft for "ทำสำเนาเป็นขั้นถัดไป".
 *
 * Deleted undo tombstones are deliberately omitted, while every live identity
 * that can link two scene records is remapped. Image claims are not copied as
 * valid provenance: the server caller must verify the source and replace each
 * copied claim because the signed claim is bound to its file id.
 */
export function duplicateDrawingScene(
  source: ScratchpadScene,
  createId: IdFactory = () => crypto.randomUUID(),
  now = Date.now(),
): DuplicatedDrawingScene {
  const sourceElements = source.elements.filter(isRecord).filter(element => element.isDeleted !== true)
  const elementIdMap = new Map<string, string>()
  const fileIdMap = new Map<string, string>()
  const groupIdMap = new Map<string, string>()

  for (const element of sourceElements) {
    if (typeof element.id === 'string') elementIdMap.set(element.id, createId('element'))
    if (element.type === 'image' && typeof element.fileId === 'string' && !fileIdMap.has(element.fileId)) {
      fileIdMap.set(element.fileId, createId('file'))
    }
    if (Array.isArray(element.groupIds)) {
      for (const groupId of element.groupIds) {
        if (typeof groupId === 'string' && !groupIdMap.has(groupId)) {
          groupIdMap.set(groupId, createId('group'))
        }
      }
    }
  }

  const elements = sourceElements.flatMap(element => {
    const id = typeof element.id === 'string' ? elementIdMap.get(element.id) : null
    if (!id) return []
    const clone = structuredClone(element)
    clone.id = id
    clone.isDeleted = false
    clone.updated = now
    if (typeof clone.fileId === 'string') clone.fileId = fileIdMap.get(clone.fileId) ?? null
    if (typeof clone.frameId === 'string') clone.frameId = elementIdMap.get(clone.frameId) ?? null
    if (typeof clone.containerId === 'string') clone.containerId = elementIdMap.get(clone.containerId) ?? null
    if (Array.isArray(clone.groupIds)) {
      clone.groupIds = clone.groupIds.flatMap(groupId => {
        const mapped = typeof groupId === 'string' ? groupIdMap.get(groupId) : null
        return mapped ? [mapped] : []
      })
    }
    if (Array.isArray(clone.boundElements)) {
      clone.boundElements = clone.boundElements.flatMap(binding => {
        if (!isRecord(binding) || typeof binding.id !== 'string') return []
        const boundId = elementIdMap.get(binding.id)
        return boundId ? [{ ...binding, id: boundId }] : []
      })
    }
    if ('startBinding' in clone) clone.startBinding = remapBinding(clone.startBinding, elementIdMap)
    if ('endBinding' in clone) clone.endBinding = remapBinding(clone.endBinding, elementIdMap)
    return [clone]
  })

  const files: Record<string, unknown> = {}
  for (const [oldFileId, newFileId] of fileIdMap) {
    const value = source.files[oldFileId]
    if (!isRecord(value)) continue
    files[newFileId] = {
      ...structuredClone(value),
      id: newFileId,
      created: now,
    }
  }

  return {
    scene: {
      formatVersion: source.formatVersion,
      elements,
      appState: structuredClone(source.appState),
      files,
      background: source.background,
    },
    elementIdMap,
    fileIdMap,
  }
}
