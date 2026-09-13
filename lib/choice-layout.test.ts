import { describe, it, expect } from 'vitest'
import { choicesFitOneRow } from './choice-layout'

describe('choicesFitOneRow', () => {
  // The two lists this was written for, both printed across one line on paper.
  it('rows up the beaker numbers and the polymer letters', () => {
    expect(choicesFitOneRow(['1', '2', '3', '4', '5', '6', '7'])).toBe(true)
    expect(choicesFitOneRow(['A', 'B', 'C'])).toBe(true)
    expect(choicesFitOneRow(['ถูก', 'ผิด'])).toBe(true)
  })

  it('rows up short words too', () => {
    expect(choicesFitOneRow(['เนื้อหมู', 'ยางรัดของ', 'เชือกป่าน'])).toBe(true)
  })

  it('stacks anything long enough to need its own line', () => {
    expect(choicesFitOneRow(['เสียงเดินทางในน้ำได้เร็วกว่าในอากาศ', 'ก'])).toBe(false)
    expect(choicesFitOneRow(['พอลิเมอร์ธรรมชาติ', 'พอลิเมอร์สังเคราะห์'])).toBe(false)
  })

  // Each one fits, but eight of them do not fit together.
  it('stacks a long list of middling choices', () => {
    expect(choicesFitOneRow(Array(8).fill('ทองแดง'))).toBe(true)
    expect(choicesFitOneRow(Array(9).fill('ทองแดงเงิน'))).toBe(false)
  })

  it('reads through the markup a rich text editor leaves behind', () => {
    expect(choicesFitOneRow(['<p>1</p>', '<p><strong>2</strong></p>'])).toBe(true)
  })

  it('stacks a choice carrying no words of its own', () => {
    expect(choicesFitOneRow(['1', '<p><img src="x"></p>'])).toBe(false)
    expect(choicesFitOneRow(['1', '<p>&nbsp;</p>'])).toBe(false)
  })

  it('leaves a list too short to be a row alone', () => {
    expect(choicesFitOneRow([])).toBe(false)
    expect(choicesFitOneRow(['1'])).toBe(false)
  })
})
