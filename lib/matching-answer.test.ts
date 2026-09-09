import { describe, it, expect } from 'vitest'
import { placementFromTexts, textsFromPlacement } from './matching-answer'

// The matching input became drag-and-drop, but the stored answer did not
// change: right_text per prompt, in prompt order, which is what the 'MATCH:'
// branch of lib/assignment-attempt.ts grades. Everything here guards that
// boundary — a wrong conversion silently rewrites a student's answer between
// the moment they place a chip and the moment it is marked.

const OPTIONS = [
  { right_text: 'นิวตัน (N)' },
  { right_text: 'จูล (J)' },
  { right_text: 'วัตต์ (W)' },
]

describe('placementFromTexts', () => {
  it('resolves each stored text back to its option', () => {
    expect(placementFromTexts(['วัตต์ (W)', 'นิวตัน (N)', 'จูล (J)'], OPTIONS, 3))
      .toEqual(['2', '0', '1'])
  })

  it('leaves a prompt empty when nothing was stored for it', () => {
    expect(placementFromTexts(['จูล (J)', '', ''], OPTIONS, 3)).toEqual(['1', null, null])
    expect(placementFromTexts([], OPTIONS, 3)).toEqual([null, null, null])
  })

  // A teacher may legitimately answer two pairs with the same word. Handing
  // both prompts the same chip would leave one slot visibly empty even though
  // the stored answer is complete.
  it('gives repeated text a different chip each time', () => {
    const repeated = [{ right_text: 'ซ้ำ' }, { right_text: 'ซ้ำ' }]
    expect(placementFromTexts(['ซ้ำ', 'ซ้ำ'], repeated, 2)).toEqual(['0', '1'])
  })

  // An answer saved before the pairs were edited can name a choice that is
  // gone. The slot has to come back empty rather than pointing at nothing.
  it('drops a stored text that is no longer one of the options', () => {
    expect(placementFromTexts(['เคยมี', 'จูล (J)'], OPTIONS, 2)).toEqual([null, '1'])
  })

  it('follows the prompt count, not the length of the stored array', () => {
    expect(placementFromTexts(['นิวตัน (N)', 'จูล (J)', 'วัตต์ (W)'], OPTIONS, 2)).toEqual(['0', '1'])
    expect(placementFromTexts(['นิวตัน (N)'], OPTIONS, 3)).toEqual(['0', null, null])
  })
})

describe('textsFromPlacement', () => {
  it('writes the stored shape back out', () => {
    expect(textsFromPlacement(['2', '0', '1'], OPTIONS)).toEqual(['วัตต์ (W)', 'นิวตัน (N)', 'จูล (J)'])
  })

  it('stores an empty slot as an empty string, the way the dropdown did', () => {
    expect(textsFromPlacement([null, '0', null], OPTIONS)).toEqual(['', 'นิวตัน (N)', ''])
  })
})

describe('round trip', () => {
  it('returns a stored answer unchanged when nothing is moved', () => {
    const stored = ['วัตต์ (W)', '', 'จูล (J)']
    expect(textsFromPlacement(placementFromTexts(stored, OPTIONS, 3), OPTIONS)).toEqual(stored)
  })

  // The case that matters most: an answer saved by the old dropdown version
  // has to load, survive being shown as chips, and grade identically.
  it('survives a full answer saved before the drag input existed', () => {
    const stored = ['นิวตัน (N)', 'จูล (J)', 'วัตต์ (W)']
    expect(textsFromPlacement(placementFromTexts(stored, OPTIONS, 3), OPTIONS)).toEqual(stored)
  })
})
