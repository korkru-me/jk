import { describe, expect, it } from 'vitest'
import { hasStudentAnswer } from './student-answer-state'

describe('shared student answer presence', () => {
  it('keeps zero and false answers while rejecting empty drafts', () => {
    for (const value of [undefined, null, '', '  ', '[]', '["", "  ", null]', '[']) expect(hasStudentAnswer(value)).toBe(false)
    for (const value of ['0', 'false', '5', '["", "0"]', '[{"url":"file"}]']) expect(hasStudentAnswer(value)).toBe(true)
  })
})
