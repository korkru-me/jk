import { describe, it, expect } from 'vitest'
import { choiceListHint } from './choice-list-hint'

describe('choiceListHint', () => {
  it('asks the question itself when the teacher wrote no prompt', () => {
    expect(choiceListHint('', 'correct')).toBe('ข้อใดต่อไปนี้ถูกต้อง? (เลือกได้มากกว่า 1 ข้อ)')
    expect(choiceListHint(null, undefined)).toBe('ข้อใดต่อไปนี้ถูกต้อง? (เลือกได้มากกว่า 1 ข้อ)')
  })

  // The complaint this was written for: the teacher's prompt is the question,
  // so a second one underneath it asks for something the list is not about.
  it('leaves the asking to the teacher and keeps only the affordance', () => {
    expect(choiceListHint('ตะปูเหล็กที่เกิดสนิมอยู่ในบีกเกอร์หมายเลข', 'correct'))
      .toBe('เลือกได้มากกว่า 1 ข้อ')
  })

  it('still says so when the list wants the wrong entries ticked', () => {
    expect(choiceListHint('บีกเกอร์ใดป้องกันการผุกร่อนไม่ได้', 'wrong'))
      .toBe('เลือกข้อที่ผิด — เลือกได้มากกว่า 1 ข้อ')
    expect(choiceListHint('', 'wrong')).toBe('ข้อใดต่อไปนี้ผิด? (เลือกได้มากกว่า 1 ข้อ)')
  })

  // A rich text editor leaves an emptied field as markup, not as ''.
  it('reads markup with no words in it as no prompt at all', () => {
    expect(choiceListHint('<p></p>', 'correct')).toBe('ข้อใดต่อไปนี้ถูกต้อง? (เลือกได้มากกว่า 1 ข้อ)')
    expect(choiceListHint('<p>&nbsp;</p>', 'correct')).toBe('ข้อใดต่อไปนี้ถูกต้อง? (เลือกได้มากกว่า 1 ข้อ)')
    expect(choiceListHint('<p><strong>ก่อ</strong></p>', 'correct')).toBe('เลือกได้มากกว่า 1 ข้อ')
  })

  it('treats an unset target as asking for the correct ones', () => {
    expect(choiceListHint('อะไรบ้าง', null)).toBe(choiceListHint('อะไรบ้าง', 'correct'))
  })
})
