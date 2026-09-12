import { describe, expect, it } from 'vitest'
import { isAssignmentTakingPath } from './app-shell-mode'

describe('app shell mode', () => {
  it('uses the distraction-free shell only on the assignment-taking route', () => {
    expect(isAssignmentTakingPath('/assignments/exam-1/take')).toBe(true)
    expect(isAssignmentTakingPath('/assignments/exam-1/take/')).toBe(true)
    expect(isAssignmentTakingPath('/assignments/exam-1')).toBe(false)
    expect(isAssignmentTakingPath('/assignments/exam-1/preview')).toBe(false)
    expect(isAssignmentTakingPath('/assignments/take')).toBe(false)
  })
})
