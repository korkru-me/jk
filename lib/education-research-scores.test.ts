import { describe, expect, it } from 'vitest'
import {
  formatResearchScore,
  parseResearchScoreInput,
  researchScoreAction,
} from '@/lib/education-research-scores'

describe('education research score helpers', () => {
  it('keeps a blank score missing instead of converting it to zero', () => {
    expect(parseResearchScoreInput('   ', 25)).toEqual({ value: null, error: null })
    expect(parseResearchScoreInput('0', 25)).toEqual({ value: 0, error: null })
  })

  it('rejects invalid and out-of-range score input', () => {
    expect(parseResearchScoreInput('abc', 25).error).toBe('กรุณากรอกเป็นตัวเลข')
    expect(parseResearchScoreInput('-1', 25).error).toBe('คะแนนต้องไม่ติดลบ')
    expect(parseResearchScoreInput('25.01', 25).error).toBe('คะแนนต้องไม่เกิน 25')
  })

  it('formats decimal scores without fake trailing precision', () => {
    expect(formatResearchScore(18)).toBe('18')
    expect(formatResearchScore(18.5)).toBe('18.5')
    expect(formatResearchScore(null)).toBe('—')
  })

  it('classifies additions, overwrites, unchanged values, and blanks', () => {
    expect(researchScoreAction(null, 10)).toBe('add')
    expect(researchScoreAction(9, 10)).toBe('update')
    expect(researchScoreAction(10, 10)).toBe('unchanged')
    expect(researchScoreAction(10, null)).toBe('blank')
  })
})
