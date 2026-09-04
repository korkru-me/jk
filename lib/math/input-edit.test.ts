import { describe, expect, it } from 'vitest'
import {
  backspaceMathInput,
  clampMathCaret,
  insertMathFraction,
  insertMathFunction,
  insertMathText,
  resolveMathCaret,
} from './input-edit'

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

  it('edits at the remembered caret once the field is no longer focused', () => {
    // What an iPad does: tapping a key blurs the field, which then reports a
    // caret of 0. Without the remembered caret, "1" then "2" reads "21".
    expect(resolveMathCaret(1, null, { start: 1, end: 1 })).toEqual({ start: 1, end: 1 })
    // A focused field is authoritative, including its selection.
    expect(resolveMathCaret(4, { start: 1, end: 3 }, { start: 0, end: 0 })).toEqual({ start: 1, end: 3 })
    // Nothing remembered yet: append instead of inserting at the front.
    expect(resolveMathCaret(3, null, null)).toEqual({ start: 3, end: 3 })
  })

  it('keeps a remembered caret inside the value it is reused on', () => {
    expect(clampMathCaret(3, 1, 2)).toEqual({ start: 1, end: 2 })
    // A caret remembered before the expression shrank, or an end before its start.
    expect(clampMathCaret(2, 9, 9)).toEqual({ start: 2, end: 2 })
    expect(clampMathCaret(4, 3, 1)).toEqual({ start: 3, end: 3 })
    // Nothing remembered yet: type at the end rather than at the front.
    expect(clampMathCaret(4, null, null)).toEqual({ start: 4, end: 4 })
  })
})
