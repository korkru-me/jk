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
      boardId: '77777777-7777-4777-8777-777777777777',
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
      boardId: null,
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

  it('blocks the committed board while another slot is loading atomically', () => {
    const operation: TeachingBoardOperation = {
      kind: 'load',
      nonce: 11,
      questionId: QUESTION_ID,
      slot: 5,
      boardId: '99999999-9999-4999-8999-999999999999',
    }
    expect(isTeachingBoardOperationPending({
      operation,
      handledNonce: 10,
      questionId: QUESTION_ID,
      slot: 2,
    })).toBe(true)
  })

  it('does not mistake a parked scene from another board in the same slot for the requested target', () => {
    const operation: TeachingBoardOperation = {
      kind: 'load',
      nonce: 9,
      questionId: QUESTION_ID,
      slot: 2,
      boardId: '99999999-9999-4999-8999-999999999999',
    }
    expect(initialHandledTeachingBoardOperationNonce({
      operation,
      questionId: QUESTION_ID,
      slot: 2,
      boardId: '77777777-7777-4777-8777-777777777777',
      hasValidParkedScene: true,
    })).toBe(0)
  })

  it('treats an idle operation as settled across remounts', () => {
    const operation: TeachingBoardOperation = {
      kind: 'idle',
      nonce: 10,
      questionId: QUESTION_ID,
      slot: 4,
      boardId: null,
    }
    expect(initialHandledTeachingBoardOperationNonce({
      operation,
      questionId: QUESTION_ID,
      slot: 4,
      boardId: null,
      hasValidParkedScene: false,
    })).toBe(10)
    expect(isTeachingBoardOperationPending({
      operation,
      handledNonce: 0,
      questionId: QUESTION_ID,
      slot: 4,
    })).toBe(false)
  })
})
