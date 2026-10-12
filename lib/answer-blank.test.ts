import { describe, it, expect } from 'vitest'
import { splitAnswerBlankHtml, countAnswerBlanks, splitNumberedAnswerBlanks, nextAnswerBlankNumber } from './answer-blank'

// splitAnswerBlankHtml decides where a composite sub-question's input goes:
// non-null puts it inline at the marker, null puts it on its own line below
// the text (components/exam/exam-client.tsx and question-preview-content.tsx).
// Either way there is an input — a sub-part with no input at all is scored by
// naturalMaxScore but unanswerable, so the student loses a point for a blank
// they were never given.
describe('splitAnswerBlankHtml', () => {
  it('splits a sub-question around its single marker', () => {
    expect(splitAnswerBlankHtml('ความเร็วเท่ากับ [คำตอบ] m/s')).toEqual(['ความเร็วเท่ากับ ', ' m/s'])
  })

  it('keeps an empty fragment when the marker sits at an edge', () => {
    expect(splitAnswerBlankHtml('[คำตอบ] คือคำตอบ')).toEqual(['', ' คือคำตอบ'])
    expect(splitAnswerBlankHtml('ตอบ [คำตอบ]')).toEqual(['ตอบ ', ''])
  })

  it('returns null when the marker is missing — the renderers fall back to a standalone input', () => {
    expect(splitAnswerBlankHtml('จงหาความเร็วของวัตถุ')).toBeNull()
    expect(splitAnswerBlankHtml('')).toBeNull()
  })

  it('returns null when there is more than one marker', () => {
    expect(splitAnswerBlankHtml('[คำตอบ] และ [คำตอบ]')).toBeNull()
  })

  it('does not match the numbered marker used by the main question stem', () => {
    expect(splitAnswerBlankHtml('ตอบ [คำตอบ 1] หน่วย')).toBeNull()
  })

  it('returns balanced rich-text fragments identically during SSR and hydration', () => {
    expect(splitAnswerBlankHtml('<p><strong>ตอบ [คำตอบ]</strong> m/s</p>')).toEqual([
      '<p><strong>ตอบ </strong></p>',
      '<p><strong></strong> m/s</p>',
    ])
  })
})

describe('numbered answer blanks', () => {
  it('counts bare and numbered markers alike', () => {
    expect(countAnswerBlanks('ก. [คำตอบ 1] ข. [คำตอบ 2]')).toBe(2)
    expect(countAnswerBlanks('ตอบ [คำตอบ]')).toBe(1)
    expect(countAnswerBlanks('ไม่มีช่องเลย')).toBe(0)
  })

  it('numbers a bare marker by its position among the blanks', () => {
    const { parts, numbers } = splitNumberedAnswerBlanks('ก. [คำตอบ] ข. [คำตอบ 5]')
    expect(numbers).toEqual([1, 5])
    expect(parts).toHaveLength(numbers.length + 1)
  })

  it('balances every rich-text fragment around numbered blanks', () => {
    expect(splitNumberedAnswerBlanks('<p>ก [คำตอบ 1] และ <em>ข [คำตอบ 2]</em></p>')).toEqual({
      parts: [
        '<p>ก </p>',
        '<p> และ <em>ข </em></p>',
        '<p><em></em></p>',
      ],
      numbers: [1, 2],
    })
  })

  it('picks the next number past the highest already used', () => {
    expect(nextAnswerBlankNumber('')).toBe(1)
    expect(nextAnswerBlankNumber('[คำตอบ 1] [คำตอบ 4]')).toBe(5)
  })
})
