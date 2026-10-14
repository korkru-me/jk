import { expect, it } from 'vitest'
import { practiceExerciseSchema } from './practice-exercises'

const id = '80000000-0000-4000-8000-000000000001'
const input = { id, libraryId: id, title: ' ทบทวน ', questionIds: [id] }
it('requires a name and unique question IDs without accepting ownership fields', () => {
  expect(practiceExerciseSchema.parse(input).title).toBe('ทบทวน')
  for (const patch of [{ title: ' ' }, { questionIds: [] }, { questionIds: [id, id] }, { studentId: id }, { title: 'ก'.repeat(121) }]) {
    expect(practiceExerciseSchema.safeParse({ ...input, ...patch }).success).toBe(false)
  }
})
