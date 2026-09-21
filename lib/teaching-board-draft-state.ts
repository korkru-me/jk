import { snapshotDrawingScene } from '@/lib/drawing-board-policy'
import type { TeachingBoardView } from '@/lib/math-work'
import type { ScratchpadScene } from '@/lib/scratchpad'

export type TeacherQuestionDraftState =
  | 'new_draft'
  | 'unsaved_new'
  | 'loading_slot'
  | 'saved_slot'
  | 'unsaved_changes'
  | 'saving'
  | 'save_failed'
  | 'load_failed'
  | 'read_only_slot'
  | 'unsupported_read_only'

export interface TeachingBoardTarget {
  questionId: string
  slot: number
  boardId: string | null
}

export interface TeachingBoardDraftRecord {
  target: TeachingBoardTarget
  scene: ScratchpadScene
  state: TeacherQuestionDraftState
  dirty: boolean
}

export type TeachingBoardRecovery =
  | { state: 'none' }
  | {
      state: 'available_once'
      draft: TeachingBoardDraftRecord
      createdAt: number
    }
  | {
      state: 'restored'
      target: TeachingBoardTarget
      restoredAt: number
    }

export const TEACHER_DRAFT_STATE_LABEL: Record<TeacherQuestionDraftState, string> = {
  new_draft: 'กระดานใหม่',
  unsaved_new: 'กระดานใหม่ที่ยังไม่บันทึก',
  loading_slot: 'กำลังเปิดกระดาน...',
  saved_slot: 'บันทึกแล้ว',
  unsaved_changes: 'มีการแก้ไขที่ยังไม่บันทึก',
  saving: 'กำลังบันทึก...',
  save_failed: 'บันทึกไม่สำเร็จ · งานเขียนยังอยู่',
  load_failed: 'เปิดกระดานไม่สำเร็จ · กระดานเดิมยังอยู่',
  read_only_slot: 'ดูอย่างเดียว',
  unsupported_read_only: 'รูปแบบนี้ยังไม่รองรับ · ดูอย่างเดียว',
}

export function teachingBoardTargetKey(target: TeachingBoardTarget): string {
  return `${target.questionId}:${target.slot}:${target.boardId ?? 'new'}`
}

export function sameTeachingBoardTarget(
  left: TeachingBoardTarget,
  right: TeachingBoardTarget,
): boolean {
  return left.questionId === right.questionId
    && left.slot === right.slot
    && left.boardId === right.boardId
}

export function initialTeacherDraftState(input: {
  hasBoard: boolean
  editable: boolean
  dirty: boolean
}): TeacherQuestionDraftState {
  if (!input.editable && input.hasBoard) return 'read_only_slot'
  if (input.dirty) return input.hasBoard ? 'unsaved_changes' : 'unsaved_new'
  return input.hasBoard ? 'saved_slot' : 'new_draft'
}

export function editedTeacherDraftState(hasBoard: boolean): TeacherQuestionDraftState {
  return hasBoard ? 'unsaved_changes' : 'unsaved_new'
}

export function cleanTeacherDraftState(input: {
  hasBoard: boolean
  editable: boolean
}): TeacherQuestionDraftState {
  if (!input.editable && input.hasBoard) return 'read_only_slot'
  return input.hasBoard ? 'saved_slot' : 'new_draft'
}

export function createTeachingBoardRecovery(
  draft: TeachingBoardDraftRecord,
  createdAt = Date.now(),
): TeachingBoardRecovery {
  return {
    state: 'available_once',
    draft: {
      ...draft,
      target: { ...draft.target },
      scene: snapshotDrawingScene(draft.scene),
    },
    createdAt,
  }
}

export function restoreTeachingBoardRecovery(
  recovery: TeachingBoardRecovery,
  restoredAt = Date.now(),
): {
  recovery: TeachingBoardRecovery
  draft: TeachingBoardDraftRecord | null
} {
  if (recovery.state !== 'available_once') return { recovery, draft: null }
  const target = { ...recovery.draft.target }
  return {
    recovery: { state: 'restored', target, restoredAt },
    draft: {
      target,
      scene: snapshotDrawingScene(recovery.draft.scene),
      state: editedTeacherDraftState(target.boardId !== null),
      dirty: true,
    },
  }
}

/**
 * Keeps the server-returned board identity usable even when the follow-up list
 * refetch fails. The preview deliberately becomes null instead of showing the
 * image from a board that was just overwritten.
 */
export function adoptSavedTeachingBoard(input: {
  boards: TeachingBoardView[]
  boardId: string
  previousBoardId: string | null
  slot: number
  currentUserId: string
  savedAt?: string
}): TeachingBoardView[] {
  const previous = input.boards.find(board => board.id === input.previousBoardId)
    ?? input.boards.find(board => (
      board.createdBy === input.currentUserId && board.slot === input.slot
    ))
  const savedAt = input.savedAt ?? new Date().toISOString()
  const saved: TeachingBoardView = {
    id: input.boardId,
    slot: input.slot,
    createdBy: input.currentUserId,
    creatorName: previous?.creatorName ?? 'คุณ',
    editable: true,
    formatVersion: previous?.formatVersion ?? 1,
    previewUrl: null,
    createdAt: previous?.createdAt ?? savedAt,
    updatedAt: savedAt,
  }
  return [
    ...input.boards.filter(board => (
      board.id !== input.previousBoardId
      && !(board.createdBy === input.currentUserId && board.slot === input.slot)
    )),
    saved,
  ].sort((left, right) => left.slot - right.slot || left.createdBy.localeCompare(right.createdBy))
}
