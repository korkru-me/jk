import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), readRelease: vi.fn(), setCookie: vi.fn(), rpc: vi.fn(),
  cookieValues: new Map<string, string>(),
  from: vi.fn(), studentHasAssignment: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: mocks.setCookie,
    get: (name: string) => {
      const value = mocks.cookieValues.get(name)
      return value === undefined ? undefined : { value }
    },
  }),
  headers: async () => new Headers({ origin: 'https://exam.example' }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/assignment-access', () => ({
  studentHasAssignment: mocks.studentHasAssignment, canManageAssignment: vi.fn(),
}))
vi.mock('@/lib/seb-assignment-release.server', () => ({
  readCurrentAssignmentSebRelease: mocks.readRelease,
  readAssignmentSebRelease: mocks.readRelease,
  createAssignmentSebSignedDownloadUrl: vi.fn(),
}))
vi.mock('@/lib/android-exam-session', () => ({ getAndroidExamSession: vi.fn(async () => null) }))

import { createSebChallengeClaims, createSebRequestHash, signSebClaims } from '@/lib/seb'
import { verifySafeExamBrowser } from './seb'
import { getSebSession, sebSessionCookieName } from '@/lib/seb-session'
import { getExamAccessSession } from '@/lib/exam-access-session'
import { startSubmission } from './submissions'

const USER = '11111111-1111-4111-8111-111111111111'
const ASSIGNMENT = '22222222-2222-4222-8222-222222222222'
const RELEASE = '33333333-3333-4333-8333-333333333333'
const SECRET = 'synthetic-native-windows-regression-secret'
const CK = 'a'.repeat(64)
const BEK = 'b'.repeat(64)
const SUBMISSION = '77777777-7777-4777-8777-777777777777'

function mockAttemptReads() {
  const auditUpdate = vi.fn()
  mocks.from.mockImplementation((table: string) => {
    const data = table === 'assignments'
      ? { id: ASSIGNMENT, status: 'published', type: 'exam', secure_browser_mode: 'seb_required',
          android_exam_mode: 'blocked', duration_minutes: null, start_at: null, end_at: null }
      : table === 'submissions'
        ? { id: SUBMISSION, status: 'in_progress', attempt_number: 1,
            started_at: new Date().toISOString(), exam_access_mode: 'seb', seb_config_revision: 2 }
        : null
    const query = {
      select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => query),
      limit: vi.fn(() => query), update: vi.fn((value: unknown) => { auditUpdate(value); return query }),
      maybeSingle: vi.fn(async () => ({ data, error: null })),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
    }
    return query
  })
  return auditUpdate
}

function input(version = 'SEB_Windows_3.10.2.920', purpose: 'take' | 'system_check' = 'system_check') {
  const challenge = signSebClaims(createSebChallengeClaims(USER, ASSIGNMENT, RELEASE, 2, purpose), SECRET)
  const path = purpose === 'take' ? 'take' : 'system-check'
  const requestUrl = `https://exam.example/assignments/${ASSIGNMENT}/${path}?sebChallenge=${encodeURIComponent(challenge)}`
  return {
    assignmentId: ASSIGNMENT, challenge, requestUrl, version,
    configKeyHash: createSebRequestHash(requestUrl, CK),
    browserExamKeyHash: createSebRequestHash(requestUrl, BEK),
    purpose,
  }
}

describe('native Windows version through the real SEB verification action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cookieValues.clear()
    mocks.setCookie.mockImplementation((name: string, value: string) => {
      mocks.cookieValues.set(name, value)
    })
    vi.stubEnv('SEB_SESSION_SECRET', SECRET)
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://exam.example')
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER } } })
    mocks.readRelease.mockResolvedValue({
      releaseId: RELEASE, revision: 2, configKey: CK,
      browserExamKeys: [{ platform: 'windows', versionString: '3.10.2', buildNumber: '920', key: BEK }],
    })
    mocks.rpc.mockResolvedValue({ error: null })
    mocks.studentHasAssignment.mockResolvedValue(true)
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each([
    { version: 'SEB_Windows_3.10.2.920', purpose: 'system_check' as const },
    { version: 'SEB_Windows_3.10.2.920', purpose: 'take' as const },
    { version: 'SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser', purpose: 'system_check' as const },
    { version: 'SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser', purpose: 'take' as const },
  ])('round-trips $version/$purpose into the real exam access reader', async ({ version, purpose }) => {
    expect(await verifySafeExamBrowser(input(version, purpose))).toMatchObject({ success: true, platform: 'windows' })
    if (purpose === 'system_check') {
      expect(mocks.rpc).toHaveBeenCalledWith('record_exam_seb_checkin', expect.objectContaining({
        p_assignment_id: ASSIGNMENT, p_student_id: USER, p_platform: 'windows', p_version: version,
      }))
    } else {
      expect(mocks.rpc).not.toHaveBeenCalled()
    }
    expect(mocks.setCookie).toHaveBeenCalledTimes(1)
    expect(await getSebSession(USER, ASSIGNMENT, RELEASE, 2)).toMatchObject({
      kind: 'seb_session', platform: 'windows', version,
    })
    expect(await getExamAccessSession(USER, ASSIGNMENT, false, 2, 'seb')).toMatchObject({
      mode: 'seb', platform: 'windows', version, configRevision: RELEASE, assignmentConfigRevision: 2,
    })
  })

  it('keeps exact cookie binding and rejects tampering after a valid compact verification', async () => {
    await verifySafeExamBrowser(input())
    expect(await getSebSession(USER, ASSIGNMENT, RELEASE, 2)).not.toBeNull()
    expect(await getSebSession('44444444-4444-4444-8444-444444444444', ASSIGNMENT, RELEASE, 2)).toBeNull()
    expect(await getSebSession(USER, '55555555-5555-4555-8555-555555555555', RELEASE, 2)).toBeNull()
    expect(await getSebSession(USER, ASSIGNMENT, '66666666-6666-4666-8666-666666666666', 2)).toBeNull()
    expect(await getSebSession(USER, ASSIGNMENT, RELEASE, 3)).toBeNull()
    const cookieName = sebSessionCookieName(ASSIGNMENT)
    mocks.cookieValues.set(cookieName, `${mocks.cookieValues.get(cookieName)}x`)
    expect(await getSebSession(USER, ASSIGNMENT, RELEASE, 2)).toBeNull()
  })

  it.each(['take', 'system_check'] as const)
  ('resumes the same SEB attempt after real %s verification without looping to the launch gate', async purpose => {
    const auditUpdate = mockAttemptReads()
    expect(await verifySafeExamBrowser(input('SEB_Windows_3.10.2.920', purpose))).toHaveProperty('success', true)
    expect(await startSubmission(ASSIGNMENT)).toEqual({ submissionId: SUBMISSION })
    expect(auditUpdate).toHaveBeenCalledWith(expect.objectContaining({
      exam_access_mode: 'seb', secure_browser_platform: 'windows',
      secure_browser_version: 'SEB_Windows_3.10.2.920',
    }))
  })

  it('does not resume a SEB attempt with a tampered signed session', async () => {
    const auditUpdate = mockAttemptReads()
    await verifySafeExamBrowser(input('SEB_Windows_3.10.2.920', 'take'))
    const cookieName = sebSessionCookieName(ASSIGNMENT)
    mocks.cookieValues.set(cookieName, `${mocks.cookieValues.get(cookieName)}x`)
    expect(await startSubmission(ASSIGNMENT)).toHaveProperty('requiresSecureBrowser', true)
    expect(auditUpdate).not.toHaveBeenCalled()
  })

  it.each(['SEB_Windows_3.10.2.921', 'SEB_Windows_3.10.3.920'])
  ('rejects an unregistered runtime %s before check-in/session', async version => {
    expect(await verifySafeExamBrowser(input(version))).toHaveProperty('error')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.setCookie).not.toHaveBeenCalled()
  })

  it.each(['configKeyHash', 'browserExamKeyHash'] as const)
  ('rejects a wrong %s even when the compact version is valid', async field => {
    expect(await verifySafeExamBrowser({ ...input(), [field]: '0'.repeat(64) })).toHaveProperty('error')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.setCookie).not.toHaveBeenCalled()
  })

  it('rejects a wrong URL binding before check-in/session', async () => {
    expect(await verifySafeExamBrowser({ ...input(), requestUrl: 'https://evil.example/system-check' }))
      .toHaveProperty('error')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.setCookie).not.toHaveBeenCalled()
  })

  it('rejects a release revision mismatch before check-in/session', async () => {
    mocks.readRelease.mockResolvedValue({ releaseId: RELEASE, revision: 3 })
    expect(await verifySafeExamBrowser(input())).toHaveProperty('error')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.setCookie).not.toHaveBeenCalled()
  })

  it('does not create a session when persisting the verified check-in fails', async () => {
    mocks.rpc.mockResolvedValue({ error: { code: 'SYNTHETIC_FAILURE' } })
    expect(await verifySafeExamBrowser(input())).toHaveProperty('error')
    expect(mocks.setCookie).not.toHaveBeenCalled()
  })
})
