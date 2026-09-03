import { describe, expect, it } from 'vitest'
import { backspaceMathInput, insertMathFraction, insertMathFunction, insertMathText } from './input-edit'

describe('math input cursor edits', () => {
  it('inserts at the cursor and replaces a selection', () => {
    expect(insertMathText('12', 1, 1, 'π')).toEqual({ value: '1π2', cursor: 2 })
    expect(insertMathText('1234', 1, 3, '+')).toEqual({ value: '1+4', cursor: 2 })
  })

  it('puts the cursor inside an empty function', () => {
    expect(insertMathFunction('', 0, 0, 'sin')).toEqual({ value: 'sin()', cursor: 4 })
    expect(insertMathFunction('30', 0, 2, 'sin')).toEqual({ value: 'sin(30)', cursor: 7 })
  })

  it('builds an editable fraction from empty or selected input', () => {
    expect(insertMathFraction('', 0, 0)).toEqual({ value: '()/()', cursor: 1 })
    expect(insertMathFraction('12+3', 0, 2)).toEqual({ value: '(12)/()+3', cursor: 6 })
  })

  it('deletes a selection or the character before the cursor', () => {
    expect(backspaceMathInput('123', 1, 3)).toEqual({ value: '1', cursor: 1 })
    expect(backspaceMathInput('123', 2, 2)).toEqual({ value: '13', cursor: 1 })
  })
})
