import { describe, expect, it } from 'vitest'
import { shouldDetectTabSwitch } from './exam-tab-switch'

describe('shouldDetectTabSwitch', () => {
  it('always detects tab switches during a real exam', () => {
    expect(shouldDetectTabSwitch('exam', false)).toBe(true)
  })

  it('never detects tab switches during an exercise', () => {
    expect(shouldDetectTabSwitch('exercise', false)).toBe(false)
  })

  it('does not detect tab switches in a teacher preview', () => {
    expect(shouldDetectTabSwitch('exam', true)).toBe(false)
  })
})
