import { describe, expect, it } from 'vitest'
import { parseSebVersion, createSebSessionClaims, signSebClaims, verifySebClaims } from '@/lib/seb'
import { parseSebVersionCore } from './seb-version-core.mjs'

const SECRET = 'synthetic-session-version-regression-secret'
const CONTEXT = {
  userId: '11111111-1111-4111-8111-111111111111',
  assignmentId: '22222222-2222-4222-8222-222222222222',
  configRevision: '33333333-3333-4333-8333-333333333333',
  assignmentConfigRevision: 2,
}

describe('one API-version grammar across verification and signed-session reads', () => {
  it.each([
    ['SEB_Windows_3.10.2.920', 'windows'],
    ['SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser', 'windows'],
    ['SEB_macOS_3.7_1591F_org.safeexambrowser.SafeExamBrowser', 'macos'],
    ['SEB_iOS_3.7.1_15753_org.safeexambrowser.SafeExamBrowser', 'ios'],
  ] as const)('round-trips the signed %s session and still enforces expiry/signature/platform', (version, platform) => {
    expect(parseSebVersion(version)).toEqual(parseSebVersionCore(version))
    const claims = createSebSessionClaims({ ...CONTEXT, platform, version, now: 1_000 })
    const token = signSebClaims(claims, SECRET)
    expect(verifySebClaims(token, SECRET, 2_000)).toMatchObject({ ...CONTEXT, version, platform })
    expect(verifySebClaims(token, SECRET, claims.expiresAt)).toBeNull()
    expect(verifySebClaims(`${token}x`, SECRET, 2_000)).toBeNull()
    const otherPlatform = platform === 'windows' ? 'ios' : 'windows'
    expect(verifySebClaims(signSebClaims({ ...claims, platform: otherPlatform }, SECRET), SECRET, 2_000)).toBeNull()
  })

  it.each([
    'SEB_Windows_3.10.2', 'SEB_Windows_3.10.2.920.extra',
    'SEB_Windows_3.10.2.920_org.safeexambrowser.SafeExamBrowser',
    'prefix_SEB_Windows_3.10.2.920', 'SEB_windows_3.10.2.920',
    'SEB_macOS_3.10.2.920', 'SEB_iOS_3.10.2.920', 'SEB_Windows_3.10.2.x',
    'SEB_Windows_3.10.2.920 ', ' SEB_Windows_3.10.2.920',
    'SEB_Windows_3.10.2.920\n', 'SEB_Windows_3.10.2_920_org.safeexambrowser.SafeExamBrowser\u0000',
    'SEB_Windows_' + '1'.repeat(241),
  ])('rejects malformed %s in both native metadata and signed sessions', version => {
    expect(parseSebVersion(version)).toBeNull()
    const claims = createSebSessionClaims({ ...CONTEXT, platform: 'windows', version, now: 1_000 })
    expect(verifySebClaims(signSebClaims(claims, SECRET), SECRET, 2_000)).toBeNull()
  })
})
