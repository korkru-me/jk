import { describe, expect, it } from 'vitest'
import { shouldPersistExamAnswerLocally } from './exam-autosave-policy'

describe('exam autosave persistence policy', () => {
  it('keeps recovery backups for real attempts', () => {
    expect(shouldPersistExamAnswerLocally(false)).toBe(true)
  })

  it('keeps previews in React state only', () => {
    expect(shouldPersistExamAnswerLocally(true)).toBe(false)
  })
})
