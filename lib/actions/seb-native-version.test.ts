import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), readRelease: vi.fn(), setCookie: vi.fn(), rpc: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: mocks.setCookie }),
  headers: async () => new Headers({ origin: 'https://exam.example' }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }))
vi.mock('@/lib/seb-assignment-release.server', () => ({
  readCurrentAssignmentSebRelease: mocks.readRelease,
  createAssignmentSebSignedDownloadUrl: vi.fn(),
}))

import { createSebChallengeClaims, createSebRequestHash, signSebClaims } from '@/lib/seb'
import { verifySafeExamBrowser } from './seb'

const USER = '11111111-1111-4111-8111-111111111111'
const ASSIGNMENT = '22222222-2222-4222-8222-222222222222'
const RELEASE = '33333333-3333-4333-8333-333333333333'
const SECRET = 'synthetic-native-windows-regression-secret'
const CK = 'a'.repeat(64)
const BEK = 'b'.repeat(64)

function input(version = 'SEB_Windows_3.10.2.920') {
  const challenge = signSebClaims(createSebChallengeClaims(USER, ASSIGNMENT, RELEASE, 2, 'system_check'), SECRET)
  const requestUrl = `https://exam.example/assignments/${ASSIGNMENT}/system-check?sebChallenge=${encodeURIComponent(challenge)}`
  return {
    assignmentId: ASSIGNMENT, challenge, requestUrl, version,
    configKeyHash: createSebRequestHash(requestUrl, CK),
    browserExamKeyHash: createSebRequestHash(requestUrl, BEK),
    purpose: 'system_check' as const,
  }
}

describe('native Windows version through the real SEB verification action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('SEB_SESSION_SECRET', SECRET)
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://exam.example')
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER } } })
    mocks.readRelease.mockResolvedValue({
      releaseId: RELEASE, revision: 2, configKey: CK,
      browserExamKeys: [{ platform: 'windows', versionString: '3.10.2', buildNumber: '920', key: BEK }],
    })
    mocks.rpc.mockResolvedValue({ error: null })
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each(['SEB_Windows_3.10.2.920', 'SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser'])
  ('accepts %s only after both exact hashes pass', async version => {
    expect(await verifySafeExamBrowser(input(version))).toMatchObject({ success: true, platform: 'windows' })
    expect(mocks.rpc).toHaveBeenCalledWith('record_exam_seb_checkin', expect.objectContaining({
      p_assignment_id: ASSIGNMENT, p_student_id: USER, p_platform: 'windows', p_version: version,
    }))
    expect(mocks.setCookie).toHaveBeenCalledTimes(1)
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
