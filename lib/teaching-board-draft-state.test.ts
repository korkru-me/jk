import { describe, expect, it } from 'vitest'
import { CURRENT_WORK_FORMAT_VERSION } from '@/lib/math-work'
import type { ScratchpadScene } from '@/lib/scratchpad'
import {
  adoptSavedTeachingBoard,
  cleanTeacherDraftState,
  createTeachingBoardRecovery,
  editedTeacherDraftState,
  initialTeacherDraftState,
  restoreTeachingBoardRecovery,
  sameTeachingBoardTarget,
  teachingBoardTargetKey,
} from '@/lib/teaching-board-draft-state'

function scene(): ScratchpadScene {
  return {
    formatVersion: CURRENT_WORK_FORMAT_VERSION,
    elements: [{ id: 'line-1', type: 'freedraw', isDeleted: false }],
    appState: {},
    files: {},
    background: 'lined',
  }
}

describe('teacher board draft state', () => {
  it('keeps question, slot, and board identity in the target key', () => {
    const base = { questionId: 'question-a', slot: 2, boardId: 'board-a' }
    expect(teachingBoardTargetKey(base)).not.toBe(teachingBoardTargetKey({ ...base, slot: 3 }))
    expect(teachingBoardTargetKey(base)).not.toBe(teachingBoardTargetKey({ ...base, boardId: 'board-b' }))
    expect(sameTeachingBoardTarget(base, { ...base })).toBe(true)
    expect(sameTeachingBoardTarget(base, { ...base, boardId: null })).toBe(false)
  })

  it('distinguishes clean, edited, and read-only targets', () => {
    expect(initialTeacherDraftState({ hasBoard: false, editable: true, dirty: false })).toBe('new_draft')
    expect(initialTeacherDraftState({ hasBoard: true, editable: true, dirty: false })).toBe('saved_slot')
    expect(initialTeacherDraftState({ hasBoard: true, editable: false, dirty: false })).toBe('read_only_slot')
    expect(initialTeacherDraftState({ hasBoard: false, editable: true, dirty: true })).toBe('unsaved_new')
    expect(editedTeacherDraftState(true)).toBe('unsaved_changes')
    expect(cleanTeacherDraftState({ hasBoard: true, editable: false })).toBe('read_only_slot')
  })

  it('restores one detached snapshot once and marks it dirty', () => {
    const sourceScene = scene()
    const target = { questionId: 'question-a', slot: 4, boardId: 'board-a' }
    const available = createTeachingBoardRecovery({
      target,
      scene: sourceScene,
      state: 'saved_slot',
      dirty: false,
    }, 100)
    ;(sourceScene as unknown as { elements: unknown[] }).elements.push({
      id: 'later',
      type: 'text',
      isDeleted: false,
    })

    const restored = restoreTeachingBoardRecovery(available, 200)
    expect(restored.recovery).toEqual({ state: 'restored', target, restoredAt: 200 })
    expect(restored.draft?.state).toBe('unsaved_changes')
    expect(restored.draft?.dirty).toBe(true)
    expect(restored.draft?.scene.elements).toHaveLength(1)
    if (available.state !== 'available_once') throw new Error('Expected available recovery')
    expect(restored.draft?.scene).not.toBe(available.draft.scene)

    expect(restoreTeachingBoardRecovery(restored.recovery, 300).draft).toBeNull()
  })

  it('adopts the server save identity before refetch without replacing another teacher', () => {
    const boards = adoptSavedTeachingBoard({
      boards: [{
        id: 'shared-board',
        slot: 2,
        createdBy: 'teacher-b',
        creatorName: 'ครูบี',
        editable: false,
        formatVersion: 1,
        previewUrl: 'https://example.test/shared.webp',
        createdAt: '2026-09-20T00:00:00.000Z',
        updatedAt: '2026-09-20T00:00:00.000Z',
      }],
      boardId: 'saved-board',
      previousBoardId: null,
      slot: 2,
      currentUserId: 'teacher-a',
      savedAt: '2026-09-22T00:00:00.000Z',
    })

    expect(boards).toHaveLength(2)
    expect(boards.find(board => board.id === 'shared-board')?.previewUrl).toContain('shared.webp')
    expect(boards.find(board => board.id === 'saved-board')).toMatchObject({
      slot: 2,
      createdBy: 'teacher-a',
      editable: true,
      previewUrl: null,
      updatedAt: '2026-09-22T00:00:00.000Z',
    })
  })
})
