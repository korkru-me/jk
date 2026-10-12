import { describe, expect, it } from 'vitest'
import {
  PRACTICE_ANSWER_ATTEMPT_COLUMNS,
  PRACTICE_LIBRARY_COLUMNS,
  PRACTICE_LIBRARY_QUESTION_COLUMNS,
  RECORD_PRACTICE_ANSWER_ATTEMPT_RPC,
  DUPLICATE_PRACTICE_LIBRARY_RPC,
  GET_PRACTICE_LIBRARY_QUESTIONS_FOR_MANAGER_RPC,
  canManagePracticeLibrary,
  canRecordPracticeAnswerAttempt,
  canReadAllPracticeProgress,
  canReadOwnPracticeProgress,
  canReadPracticeLibrary,
  parseRecordPracticeAnswerAttemptInput,
  toRecordPracticeAnswerAttemptRpcArgs,
} from './practice-library-contracts'

const libraryId = '6c468b54-2bd5-4d83-9c0c-1b5440c178a0'
const questionId = '992374e6-ad86-438c-ac66-57d5121b706d'
const idempotencyKey = '019ed7ef-651e-7e37-a985-63568a0e172f'
const actorId = '16e72bc6-d54e-4d68-8994-164f74664570'

describe('practice attempt persistence contract', () => {
  it('locks the library and membership schema vocabulary', () => {
    expect(PRACTICE_LIBRARY_COLUMNS).toEqual([
      'id',
      'org_id',
      'classroom_id',
      'created_by',
      'title',
      'description',
      'status',
      'reveal_answer_key',
      'published_at',
      'closed_at',
      'created_at',
      'updated_at',
    ])
    expect(PRACTICE_LIBRARY_QUESTION_COLUMNS).toEqual([
      'library_id',
      'question_id',
      'position',
      'created_at',
    ])
  })

  it('keeps exactly the five approved durable columns', () => {
    expect(PRACTICE_ANSWER_ATTEMPT_COLUMNS).toEqual([
      'library_id',
      'student_id',
      'question_id',
      'checked_at',
      'idempotency_key',
    ])
    expect(PRACTICE_ANSWER_ATTEMPT_COLUMNS).not.toContain('answer')
    expect(PRACTICE_ANSWER_ATTEMPT_COLUMNS).not.toContain('is_correct')
    expect(PRACTICE_ANSWER_ATTEMPT_COLUMNS).not.toContain('score')
  })

  it('builds an RPC call without accepting actor or clock fields from the client', () => {
    const parsed = parseRecordPracticeAnswerAttemptInput({
      library_id: libraryId,
      question_id: questionId,
      idempotency_key: idempotencyKey,
    })

    expect(RECORD_PRACTICE_ANSWER_ATTEMPT_RPC).toBe('record_practice_answer_attempt')
    expect(toRecordPracticeAnswerAttemptRpcArgs(actorId, parsed)).toEqual({
      p_actor_id: actorId,
      p_library_id: libraryId,
      p_question_id: questionId,
      p_idempotency_key: idempotencyKey,
    })
  })

  it('pins the source-aware manager read and atomic duplicate RPC names', () => {
    expect(GET_PRACTICE_LIBRARY_QUESTIONS_FOR_MANAGER_RPC)
      .toBe('get_practice_library_questions_for_manager')
    expect(DUPLICATE_PRACTICE_LIBRARY_RPC).toBe('duplicate_practice_library')
  })

  it.each([
    ['answer', '42'],
    ['correctness', true],
    ['score', 1],
    ['student_id', '16e72bc6-d54e-4d68-8994-164f74664570'],
    ['checked_at', '2026-10-12T16:00:00.000Z'],
  ])('rejects the unsupported %s field', (field, value) => {
    expect(() => parseRecordPracticeAnswerAttemptInput({
      library_id: libraryId,
      question_id: questionId,
      idempotency_key: idempotencyKey,
      [field]: value,
    })).toThrow('practice attempt input contains unsupported fields')
  })

  it('rejects malformed identities and retry keys', () => {
    expect(() => parseRecordPracticeAnswerAttemptInput({
      library_id: 'library-1',
      question_id: questionId,
      idempotency_key: idempotencyKey,
    })).toThrow('library_id must be a UUID')
    expect(() => parseRecordPracticeAnswerAttemptInput({
      library_id: libraryId,
      question_id: 'question-1',
      idempotency_key: idempotencyKey,
    })).toThrow('question_id must be a UUID')
    expect(() => parseRecordPracticeAnswerAttemptInput({
      library_id: libraryId,
      question_id: questionId,
      idempotency_key: 'retry-me',
    })).toThrow('idempotency_key must be a UUID')
    expect(() => toRecordPracticeAnswerAttemptRpcArgs('actor-1', {
      library_id: libraryId,
      question_id: questionId,
      idempotency_key: idempotencyKey,
    })).toThrow('actor_id must be a UUID')
  })
})

describe('practice classroom permission contract', () => {
  it.each([
    'classroom_owner',
    'co_teacher_admin',
    'co_teacher_manage',
    'co_teacher_view',
  ] as const)('lets %s read library metadata', (access) => {
    expect(canReadPracticeLibrary(access, 'draft')).toBe(true)
    expect(canReadPracticeLibrary(access, 'published')).toBe(true)
  })

  it.each([
    ['classroom_owner', true],
    ['co_teacher_admin', true],
    ['co_teacher_manage', true],
    ['co_teacher_view', false],
    ['student_member', false],
    ['none', false],
  ] as const)('applies the manage boundary for %s', (access, expected) => {
    expect(canManagePracticeLibrary(access)).toBe(expected)
    expect(canReadAllPracticeProgress(access)).toBe(expected)
  })

  it('lets a rostered student read only published libraries and only own progress', () => {
    expect(canReadPracticeLibrary('student_member', 'draft')).toBe(false)
    expect(canReadPracticeLibrary('student_member', 'published')).toBe(true)
    expect(canReadPracticeLibrary('student_member', 'closed')).toBe(false)
    expect(canReadAllPracticeProgress('student_member')).toBe(false)
    expect(canReadOwnPracticeProgress('student_member', 'draft')).toBe(false)
    expect(canReadOwnPracticeProgress('student_member', 'published')).toBe(true)
    expect(canReadOwnPracticeProgress('student_member', 'closed')).toBe(false)
    expect(canRecordPracticeAnswerAttempt('student_member', 'draft')).toBe(false)
    expect(canRecordPracticeAnswerAttempt('student_member', 'published')).toBe(true)
    expect(canRecordPracticeAnswerAttempt('student_member', 'closed')).toBe(false)
  })

  it('denies users without a classroom relationship', () => {
    expect(canReadPracticeLibrary('none', 'published')).toBe(false)
    expect(canManagePracticeLibrary('none')).toBe(false)
    expect(canReadAllPracticeProgress('none')).toBe(false)
    expect(canReadOwnPracticeProgress('none', 'published')).toBe(false)
    expect(canRecordPracticeAnswerAttempt('none', 'published')).toBe(false)
  })
})
