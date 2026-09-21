import type { TeachingBoardOperation } from '@/lib/math-work'

export function isTeachingBoardOperationPending(input: {
  operation: TeachingBoardOperation
  handledNonce: number
  questionId: string
  slot: number
}): boolean {
  return input.operation.kind !== 'idle'
    && input.operation.questionId === input.questionId
    && input.operation.nonce !== input.handledNonce
}

/** A parked scene already embodies the last operation for this exact target. */
export function initialHandledTeachingBoardOperationNonce(input: {
  operation: TeachingBoardOperation
  questionId: string
  slot: number
  boardId: string | null
  hasValidParkedScene: boolean
}): number {
  return input.operation.kind === 'idle'
    || (input.hasValidParkedScene
    && input.operation.questionId === input.questionId
    && input.operation.slot === input.slot
    && input.operation.boardId === input.boardId)
    ? input.operation.nonce
    : 0
}
