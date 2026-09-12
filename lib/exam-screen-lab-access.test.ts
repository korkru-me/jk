import { describe, expect, it } from 'vitest'
import {
  isExamScreenLabEnabled,
  isExamScreenLabPath,
  shouldBypassSessionRefresh,
} from './exam-screen-lab-access'

describe('exam screen lab access', () => {
  it('enables the lab only for explicit development and test builds', () => {
    expect(isExamScreenLabEnabled('development')).toBe(true)
    expect(isExamScreenLabEnabled('test')).toBe(true)
    expect(isExamScreenLabEnabled('production')).toBe(false)
    expect(isExamScreenLabEnabled('staging')).toBe(false)
    expect(isExamScreenLabEnabled('preview')).toBe(false)
    expect(isExamScreenLabEnabled(undefined)).toBe(false)
  })

  it('matches only the dedicated lab route', () => {
    expect(isExamScreenLabPath('/exam-screen-lab')).toBe(true)
    expect(isExamScreenLabPath('/exam-screen-lab/check')).toBe(true)
    expect(isExamScreenLabPath('/exam-screen-laboratory')).toBe(false)
    expect(isExamScreenLabPath('/assignments/example/take')).toBe(false)
  })

  it('bypasses session refresh for the development lab but never production', () => {
    expect(shouldBypassSessionRefresh('/exam-screen-lab', 'development')).toBe(true)
    expect(shouldBypassSessionRefresh('/exam-screen-lab', 'production')).toBe(false)
    expect(shouldBypassSessionRefresh('/exam-screen-lab', undefined)).toBe(false)
    expect(shouldBypassSessionRefresh('/dashboard', 'development')).toBe(false)
  })
})
