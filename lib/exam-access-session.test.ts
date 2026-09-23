import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSebSession: vi.fn(),
  getAndroidExamSession: vi.fn(),
  readAssignmentSebRelease: vi.fn(),
  readCurrentAssignmentSebRelease: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/seb-session', () => ({ getSebSession: mocks.getSebSession }))
vi.mock('@/lib/android-exam-session', () => ({
  getAndroidExamSession: mocks.getAndroidExamSession,
}))
vi.mock('@/lib/seb-assignment-release.server', () => ({
  readAssignmentSebRelease: mocks.readAssignmentSebRelease,
  readCurrentAssignmentSebRelease: mocks.readCurrentAssignmentSebRelease,
}))

import { getExamAccessSession } from '@/lib/exam-access-session'

describe('exam access session selection', () => {
  beforeEach(() => {
    mocks.getSebSession.mockReset().mockResolvedValue(null)
    mocks.getAndroidExamSession.mockReset().mockResolvedValue(null)
    mocks.readAssignmentSebRelease.mockReset().mockResolvedValue(null)
    mocks.readCurrentAssignmentSebRelease.mockReset().mockResolvedValue({
      releaseId: 'assignment-release-1',
      revision: 1,
    })
  })

  it('prefers a verified SEB session and does not consult Android approval', async () => {
    mocks.getSebSession.mockResolvedValue({
      issuedAt: 10,
      platform: 'windows',
      version: 'SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser',
      configRevision: 'assignment-release-1',
      assignmentConfigRevision: 1,
    })
    await expect(getExamAccessSession('student', 'assignment', true)).resolves.toMatchObject({
      mode: 'seb',
      platform: 'windows',
      configRevision: 'assignment-release-1',
      assignmentConfigRevision: 1,
    })
    expect(mocks.getSebSession).toHaveBeenCalledWith(
      'student',
      'assignment',
      'assignment-release-1',
      1,
    )
    expect(mocks.getAndroidExamSession).not.toHaveBeenCalled()
  })

  it('never treats Android approval as SEB and only accepts it when explicitly allowed', async () => {
    mocks.readCurrentAssignmentSebRelease.mockResolvedValue(null)
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

  it('binds SEB to the stored attempt revision and fails closed for an explicit legacy null', async () => {
    mocks.readAssignmentSebRelease.mockResolvedValue({
      releaseId: 'assignment-release-7',
      revision: 7,
    })
    mocks.getSebSession.mockResolvedValue({
      issuedAt: 10,
      platform: 'windows',
      version: 'SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser',
      configRevision: 'assignment-release-7',
      assignmentConfigRevision: 7,
    })

    await expect(getExamAccessSession('student', 'assignment', false, 7, 'seb')).resolves.toMatchObject({
      mode: 'seb',
      assignmentConfigRevision: 7,
    })
    expect(mocks.readAssignmentSebRelease).toHaveBeenCalledWith('assignment', 7)

    mocks.getSebSession.mockClear()
    await expect(getExamAccessSession('student', 'assignment', false, null, 'seb')).resolves.toBeNull()
    expect(mocks.getSebSession).not.toHaveBeenCalled()
  })

  it('keeps the access mode immutable for an existing attempt', async () => {
    mocks.getSebSession.mockResolvedValue({
      issuedAt: 10,
      platform: 'windows',
      version: 'SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser',
      configRevision: 'assignment-release-1',
      assignmentConfigRevision: 1,
    })
    mocks.getAndroidExamSession.mockResolvedValue({
      issuedAt: 10,
      approvedAt: 9,
      approvedBy: 'teacher',
    })

    await expect(getExamAccessSession(
      'student',
      'assignment',
      true,
      null,
      'android_monitored',
    )).resolves.toEqual({
      mode: 'android_monitored',
      issuedAt: 10,
      approvedAt: 9,
      approvedBy: 'teacher',
    })
    expect(mocks.getSebSession).not.toHaveBeenCalled()

    mocks.getAndroidExamSession.mockClear()
    mocks.getSebSession.mockResolvedValue(null)
    await expect(getExamAccessSession(
      'student',
      'assignment',
      true,
      1,
      'seb',
    )).resolves.toBeNull()
    expect(mocks.getAndroidExamSession).not.toHaveBeenCalled()

    await expect(getExamAccessSession(
      'student',
      'assignment',
      true,
      null,
      null,
    )).resolves.toBeNull()
  })
})
