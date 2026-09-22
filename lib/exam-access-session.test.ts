import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSebSession: vi.fn(),
  getAndroidExamSession: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/seb-session', () => ({ getSebSession: mocks.getSebSession }))
vi.mock('@/lib/android-exam-session', () => ({
  getAndroidExamSession: mocks.getAndroidExamSession,
}))

import { getExamAccessSession } from '@/lib/exam-access-session'

describe('exam access session selection', () => {
  beforeEach(() => {
    mocks.getSebSession.mockReset().mockResolvedValue(null)
    mocks.getAndroidExamSession.mockReset().mockResolvedValue(null)
  })

  it('prefers a verified SEB session and does not consult Android approval', async () => {
    mocks.getSebSession.mockResolvedValue({
      issuedAt: 10,
      platform: 'windows',
      version: 'SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser',
    })
    await expect(getExamAccessSession('student', 'assignment', true)).resolves.toMatchObject({
      mode: 'seb',
      platform: 'windows',
    })
    expect(mocks.getAndroidExamSession).not.toHaveBeenCalled()
  })

  it('never treats Android approval as SEB and only accepts it when explicitly allowed', async () => {
    mocks.getAndroidExamSession.mockResolvedValue({
      issuedAt: 10,
      approvedAt: 9,
      approvedBy: 'teacher',
    })
    await expect(getExamAccessSession('student', 'assignment', false)).resolves.toBeNull()
    expect(mocks.getAndroidExamSession).not.toHaveBeenCalled()

    await expect(getExamAccessSession('student', 'assignment', true)).resolves.toEqual({
      mode: 'android_monitored',
      issuedAt: 10,
      approvedAt: 9,
      approvedBy: 'teacher',
    })
  })
})
