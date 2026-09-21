import { describe, expect, it } from 'vitest'
import {
  initialHandledTeachingBoardOperationNonce,
  isTeachingBoardOperationPending,
} from '@/lib/teaching-board-lifecycle'
import type { TeachingBoardOperation } from '@/lib/math-work'

const QUESTION_ID = '66666666-6666-4666-8666-666666666666'

describe('teaching board operation lifecycle', () => {
  it('does not replay the last operation when remounting a parked scene', () => {
    const operation: TeachingBoardOperation = {
      kind: 'load',
      nonce: 7,
      questionId: QUESTION_ID,
      slot: 2,
      boardId: '77777777-7777-4777-8777-777777777777',
    }
    const handledNonce = initialHandledTeachingBoardOperationNonce({
      operation,
      questionId: QUESTION_ID,
      slot: 2,
      hasValidParkedScene: true,
    })
    expect(handledNonce).toBe(7)
    expect(isTeachingBoardOperationPending({
      operation,
      handledNonce,
      questionId: QUESTION_ID,
      slot: 2,
    })).toBe(false)
  })

  it('blocks a fresh target from its first render until its operation is handled', () => {
    const operation: TeachingBoardOperation = {
      kind: 'reset',
      nonce: 8,
      questionId: QUESTION_ID,
      slot: 3,
      boardId: null,
    }
    const handledNonce = initialHandledTeachingBoardOperationNonce({
      operation,
      questionId: QUESTION_ID,
      slot: 3,
      hasValidParkedScene: false,
    })
    expect(handledNonce).toBe(0)
    expect(isTeachingBoardOperationPending({
      operation,
      handledNonce,
      questionId: QUESTION_ID,
      slot: 3,
    })).toBe(true)
  })
})
