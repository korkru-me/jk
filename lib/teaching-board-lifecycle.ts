import type { TeachingBoardOperation } from '@/lib/math-work'

export function isTeachingBoardOperationPending(input: {
  operation: TeachingBoardOperation
  handledNonce: number
  questionId: string
  slot: number
}): boolean {
  return input.operation.questionId === input.questionId
    && input.operation.slot === input.slot
    && input.operation.nonce !== input.handledNonce
}

/** A parked scene already embodies the last operation for this exact target. */
export function initialHandledTeachingBoardOperationNonce(input: {
  operation: TeachingBoardOperation
  questionId: string
  slot: number
  hasValidParkedScene: boolean
}): number {
  return input.hasValidParkedScene
    && input.operation.questionId === input.questionId
    && input.operation.slot === input.slot
    ? input.operation.nonce
    : 0
}
