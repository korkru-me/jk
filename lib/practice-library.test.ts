import { describe, expect, it } from 'vitest'
import {
  countsAsPracticeAnswerAttempt,
  createPracticeAnswerAttemptMetadata,
  hasPracticeAnswer,
  isPracticeIdempotencyKey,
  matchesPracticeTags,
} from './practice-library'

const question = {
  title: 'วงจรไฟฟ้า',
  question_text: '<p>จงหากระแสไฟฟ้า</p>',
  difficulty: 'medium',
  tags: ['สอวน. ค่าย 1', 'ไฟฟ้า', 'Newton'],
}

describe('practice-library tag filters', () => {
  it('requires every selected whole tag and normalizes edge whitespace and case', () => {
    expect(matchesPracticeTags(question, ['  สอวน. ค่าย 1 ', ' ไฟฟ้า '])).toBe(true)
    expect(matchesPracticeTags(question, ['newton', 'ไฟฟ้า'])).toBe(true)
    expect(matchesPracticeTags(question, ['สอวน. ค่าย 1', 'ของไหล'])).toBe(false)
  })

  it('does not invent aliases or turn exact tags into substring matches', () => {
    expect(matchesPracticeTags(question, ['สอวน.ค่าย 1'])).toBe(false)
    expect(matchesPracticeTags(question, ['สอวน. ค่าย'])).toBe(false)
    expect(matchesPracticeTags(question, ['กลศาสตร์'])).toBe(false)
  })

  it('does not filter when no tag is selected', () => {
    expect(matchesPracticeTags(question, [])).toBe(true)
  })
})

describe('practice answer-attempt boundary', () => {
  it('counts an explicit check with a non-empty answer', () => {
    expect(countsAsPracticeAnswerAttempt({ kind: 'check_answer', answer: ' 42 ' })).toBe(true)
    expect(countsAsPracticeAnswerAttempt({ kind: 'check_answer', answer: 0 })).toBe(true)
    expect(countsAsPracticeAnswerAttempt({ kind: 'check_answer', answer: false })).toBe(true)
    expect(countsAsPracticeAnswerAttempt({ kind: 'check_answer', answer: ['', 'B'] })).toBe(true)
  })

  it('does not count a blank check', () => {
    for (const answer of [undefined, null, '', '   ', [], {}, ['', null]]) {
      expect(countsAsPracticeAnswerAttempt({ kind: 'check_answer', answer })).toBe(false)
    }
  })

  it('does not count viewing, drafting, autosaving, or opening the solution', () => {
    for (const kind of ['view', 'draft', 'autosave', 'view_solution'] as const) {
      expect(countsAsPracticeAnswerAttempt({ kind, answer: '42' })).toBe(false)
    }
  })

  it('recognizes structured answers without treating empty containers as answers', () => {
    expect(hasPracticeAnswer({ main: '', parts: { first: 'A' } })).toBe(true)
    expect(hasPracticeAnswer({ main: ' ', parts: [] })).toBe(false)
    expect(hasPracticeAnswer(Number.NaN)).toBe(false)
  })
})

describe('practice answer-attempt metadata', () => {
  const idempotencyKey = 'baf3b9df-6e49-46ea-bd24-7f9f0c3f1a18'
  const metadata = {
    library_id: 'library-1',
    student_id: 'student-1',
    question_id: 'question-1',
    checked_at: '2026-10-12T03:15:00.000Z',
    idempotency_key: idempotencyKey,
  }

  it('accepts one stable UUID and rejects altered or loosely formatted keys', () => {
    expect(isPracticeIdempotencyKey(idempotencyKey)).toBe(true)
    expect(isPracticeIdempotencyKey(` ${idempotencyKey} `)).toBe(false)
    expect(isPracticeIdempotencyKey('attempt-1')).toBe(false)
    expect(isPracticeIdempotencyKey('baf3b9df6e4946eabd247f9f0c3f1a18')).toBe(false)
  })

  it('keeps the same idempotency key when the caller retries the same check', () => {
    const first = createPracticeAnswerAttemptMetadata(metadata)
    const retry = createPracticeAnswerAttemptMetadata(metadata)

    expect(retry).toEqual(first)
    expect(retry.idempotency_key).toBe(idempotencyKey)
  })

  it('emits only append-only progress metadata and strips sensitive extras', () => {
    const event = createPracticeAnswerAttemptMetadata({
      ...metadata,
      answer: '42',
      correctness: true,
      score: 1,
    } as typeof metadata)

    expect(Object.keys(event)).toEqual([
      'library_id',
      'student_id',
      'question_id',
      'checked_at',
      'idempotency_key',
    ])
    expect(event).not.toHaveProperty('answer')
    expect(event).not.toHaveProperty('correctness')
    expect(event).not.toHaveProperty('score')
    expect(Object.isFrozen(event)).toBe(true)
  })

  it('rejects a missing identity or timestamp instead of recording ambiguous metadata', () => {
    expect(() => createPracticeAnswerAttemptMetadata({ ...metadata, student_id: ' ' }))
      .toThrow('student_id must not be empty')
    expect(() => createPracticeAnswerAttemptMetadata({ ...metadata, checked_at: '' }))
      .toThrow('checked_at must not be empty')
    expect(() => createPracticeAnswerAttemptMetadata({ ...metadata, idempotency_key: 'retry-me' }))
      .toThrow('idempotency_key must be a UUID')
  })
})
