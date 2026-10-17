import { describe, expect, it } from 'vitest'
import {
  assertSafePracticeProgressDto,
  buildPracticeProgressHref,
  buildPracticeQuestionProgress,
  buildPracticeStudentProgress,
  parsePracticeProgressSearchParams,
  pagePracticeQuestionProgress,
} from './practice-progress'

const students = [
  { id: 'student-b', display_name: 'บี', class_number: 2 },
  { id: 'student-a', display_name: 'เอ', class_number: 1 },
]

const attempts = [
  { student_id: 'student-a', question_id: 'question-1' },
  { student_id: 'student-a', question_id: 'question-1' },
  { student_id: 'student-a', question_id: 'question-2' },
]

describe('practice progress DTOs', () => {
  it('normalizes server-side detail search and preserves it across pages', () => {
    const state = parsePracticeProgressSearchParams({ q: '  แรง   และ ไฟฟ้า ', page: '3' })
    expect(state).toEqual({ q: 'แรง และ ไฟฟ้า', page: 3 })
    expect(buildPracticeProgressHref('library', 'student', state, 2))
      .toBe('/practice/library/edit?tab=progress&student=student&q=%E0%B9%81%E0%B8%A3%E0%B8%87+%E0%B9%81%E0%B8%A5%E0%B8%B0+%E0%B9%84%E0%B8%9F%E0%B8%9F%E0%B9%89%E0%B8%B2&page=2')
  })

  it('keeps roster order and reports activity counts without ranking students', () => {
    expect(buildPracticeStudentProgress(students, attempts)).toEqual([
      {
        student_id: 'student-b',
        display_name: 'บี',
        class_number: 2,
        attempted_question_count: 0,
        total_attempt_count: 0,
      },
      {
        student_id: 'student-a',
        display_name: 'เอ',
        class_number: 1,
        attempted_question_count: 2,
        total_attempt_count: 3,
      },
    ])
  })

  it('keeps library-question order and includes unanswered questions', () => {
    expect(buildPracticeQuestionProgress('student-a', [
      { id: 'question-2', title: 'ของไหล', tags: ['ของไหล'] },
      { id: 'question-1', title: 'ไฟฟ้า', tags: ['ไฟฟ้า', 'สอวน. ค่าย 1'] },
      { id: 'question-3', title: 'นิวตัน', tags: ['นิวตัน'] },
    ], attempts)).toEqual([
      { question_id: 'question-2', title: 'ของไหล', tags: ['ของไหล'], attempt_count: 1 },
      {
        question_id: 'question-1',
        title: 'ไฟฟ้า',
        tags: ['ไฟฟ้า', 'สอวน. ค่าย 1'],
        attempt_count: 2,
      },
      { question_id: 'question-3', title: 'นิวตัน', tags: ['นิวตัน'], attempt_count: 0 },
    ])
  })

  it('never serializes answer quality or activity timestamps', () => {
    const overview = buildPracticeStudentProgress(students, attempts)
    const detail = buildPracticeQuestionProgress('student-a', [
      { id: 'question-1', title: 'ไฟฟ้า', tags: ['ไฟฟ้า'] },
    ], attempts)

    expect(() => assertSafePracticeProgressDto({ overview, detail })).not.toThrow()
    expect(JSON.stringify({ overview, detail })).not.toMatch(
      /answer|correct|score|points|verdict|solution|checked_at/i,
    )
  })

  it('places practiced questions from later pages first without ranking by count or changing the source', () => {
    const rows = Array.from({ length: 143 }, (_, index) => ({ question_id: `q-${index}`, title: `${index}`, tags: [], attempt_count: index === 140 ? 9 : index === 100 ? 1 : 0 }))
    const first = pagePracticeQuestionProgress(rows, 1)
    expect(first.questions.slice(0, 3).map(row => row.question_id)).toEqual(['q-100', 'q-140', 'q-0'])
    expect(first.totalPages).toBe(3)
    expect(pagePracticeQuestionProgress(rows, 2).questions.every(row => row.attempt_count === 0)).toBe(true)
    expect(pagePracticeQuestionProgress(rows, 3).questions).toHaveLength(43)
    expect(rows[0].question_id).toBe('q-0')
    expect(pagePracticeQuestionProgress(rows, 999).page).toBe(1)
    expect(pagePracticeQuestionProgress([], 2)).toEqual({ questions: [], totalPages: 1, page: 1 })
  })

  it.each([
    { answer: '42' },
    { correctness: true },
    { score: 1 },
    { nested: { answer_key: '42' } },
    [{ checked_at: '2026-10-12T00:00:00Z' }],
  ])('rejects forbidden fields even when nested: %j', (unsafe) => {
    expect(() => assertSafePracticeProgressDto(unsafe)).toThrow(
      /Forbidden practice progress field/,
    )
  })
})
