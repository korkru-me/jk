import { expect, it } from 'vitest'
import { practiceExerciseSchema, practiceExerciseUpdateSchema, practiceReviewPinSchema, practiceExerciseDtoSchema } from './practice-exercises'

const id = '80000000-0000-4000-8000-000000000001'
const input = { id, libraryId: id, title: ' ทบทวน ', questionIds: [id] }
it('requires a name and unique question IDs without accepting ownership fields', () => {
  expect(practiceExerciseSchema.parse(input).title).toBe('ทบทวน')
  for (const patch of [{ title: ' ' }, { questionIds: [] }, { questionIds: [id, id] }, { studentId: id }, { title: 'ก'.repeat(121) }]) {
    expect(practiceExerciseSchema.safeParse({ ...input, ...patch }).success).toBe(false)
  }
})

it('requires a trusted revision for updates and an explicit target state for pins', () => {
  expect(practiceExerciseUpdateSchema.safeParse({ ...input, expectedRevision: 1 }).success).toBe(true)
  for (const expectedRevision of [undefined, 0, -1, 1.5]) expect(practiceExerciseUpdateSchema.safeParse({ ...input, expectedRevision }).success).toBe(false)
  expect(practiceReviewPinSchema.safeParse({ libraryId: id, questionId: id, pinned: true }).success).toBe(true)
  expect(practiceReviewPinSchema.safeParse({ libraryId: id, questionId: id, pinned: 'true' }).success).toBe(false)
  expect(practiceReviewPinSchema.safeParse({ libraryId: id, questionId: id, pinned: false, studentId: id }).success).toBe(false)
})
it('validates exercise counts and member titles used by the editor', () => {
  const group = { id, title: 'Test', questionIds: [id], attemptedCount: 0, revision: 1, questionTitles: { [id]: 'Question' } }
  expect(practiceExerciseDtoSchema.safeParse(group).success).toBe(true)
  expect(practiceExerciseDtoSchema.safeParse({ ...group, attemptedCount: 2 }).success).toBe(false)
  expect(practiceExerciseDtoSchema.safeParse({ ...group, questionTitles: {} }).success).toBe(false)
})
