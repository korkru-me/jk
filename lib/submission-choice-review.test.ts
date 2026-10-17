import { describe, expect, it } from 'vitest'
import { choiceLabel, studentChoicePosition } from './submission-choice-review'

describe('student MCQ review after option shuffling', () => {
  const choices = [{ text: 'หนึ่ง', index: 2 }, { text: 'สอง', index: 0 }, { text: 'สาม', index: 1 }]
  it('maps the stored authored index to its displayed position', () => {
    expect(studentChoicePosition('MCQ:1', choices)).toBe(2)
    expect(choiceLabel(2)).toBe('ค')
  })
  it('reads historical text answers when a single option matches', () => expect(studentChoicePosition('สอง', choices)).toBe(1))
  it.each([null, '', ' ', 'MCQ:9', 'MCQ:-1', 'MCQ:1x'])('does not select an option for blank or unknown answers: %s', answer => expect(studentChoicePosition(answer, choices)).toBeNull())
  it('does not invent the position of an ambiguous legacy text answer', () => expect(studentChoicePosition('ซ้ำ', [{text:'ซ้ำ'}, {text:'ซ้ำ'}])).toBeNull())
  it('distinguishes blank answers from image-only options', () => {
    expect(studentChoicePosition('', [{ text:'' }])).toBeNull()
    expect(studentChoicePosition('MCQ:0', [{ text:'' }])).toBe(0)
  })
})
