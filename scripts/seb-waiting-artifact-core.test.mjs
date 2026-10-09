import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  inspectAssignmentSebPlaintextArtifact,
  materializeAssignmentSebPlaintextSeed,
} from './seb-assignment-artifact-core.mjs'
import {
  WAITING_SEB_PROFILE_ID,
  createWaitingSebArtifactPolicy,
  freezeWaitingSebArtifact,
  inspectWaitingSebInitialArtifact,
  inspectWaitingSebTerminalArtifact,
  materializeWaitingSebInitialArtifact,
  materializeWaitingSebTerminalArtifact,
  readFrozenWaitingSebArtifact,
} from './seb-waiting-artifact-core.mjs'

const assignmentId = '30000000-0000-4000-8000-000000000003'
const origin = 'https://korkru-seb-uat.vercel.app'
const teacherHash = 'b'.repeat(64)
const templateAdminHash = 'e'.repeat(64)
const adminHash = 'd'.repeat(64)
const policy = createWaitingSebArtifactPolicy({ origin, assignmentId, revision: 3 })
const options = { randomBytes: size => Buffer.alloc(size, 9), hashedAdminPassword: adminHash }

function template() {
  return Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<plist version="1.0"><dict>
<key>startURL</key><string>https://staging.korkru.com/assignments</string>
<key>quitURL</key><string>https://staging.korkru.com/exam/quit</string>
<key>sebConfigPurpose</key><integer>0</integer>
<key>allowQuit</key><true/>
<key>downloadAndOpenSebConfig</key><false/>
<key>examSessionReconfigureAllow</key><false/>
<key>hashedAdminPassword</key><string>${templateAdminHash}</string>
<key>hashedQuitPassword</key><string>${'a'.repeat(64)}</string>
<key>sendBrowserExamKey</key><false/>
<key>examKeySalt</key><data>${Buffer.alloc(32, 1).toString('base64')}</data>
<key>browserExamKey</key><string>${'c'.repeat(64)}</string>
<key>allowUploads</key><true/>
<key>unrelatedLabel</key><string>Teacher &amp; student</string>
<key>nestedSettings</key><dict><key>label</key><string>A &amp; B</string></dict>
<key>URLFilterEnable</key><true/>
<key>URLFilterRules</key><array><dict>
<key>active</key><true/><key>regex</key><false/>
<key>expression</key><string>https://staging.korkru.com/*</string>
<key>action</key><integer>1</integer>
</dict></array>
</dict></plist>`)
}

function initial(templateBytes = template()) {
  return materializeWaitingSebInitialArtifact(templateBytes, policy, teacherHash, options)
}

function terminal() {
  return materializeWaitingSebTerminalArtifact(initial(), policy, { expectedQuitHash: teacherHash })
}

function isAllowed(candidatePolicy, value, phase = 'initial') {
  const rules = phase === 'terminal' ? candidatePolicy.terminalRules : candidatePolicy.rules
  return rules.some(item => new RegExp(item.expression).test(value))
}

function rewrite(bytes, key, replacement) {
  const expression = new RegExp(`(<key>${key}</key>)(<(?:string|data|integer)>[\\s\\S]*?</(?:string|data|integer)>|<(?:true|false)/>)`)
  expect(expression.test(bytes.toString('utf8'))).toBe(true)
  return Buffer.from(bytes.toString('utf8').replace(expression, `$1${replacement}`))
}

describe('experimental waiting-room SEB artifact profile', () => {
  it('binds canonical assignment/revision URLs and exposes no native readiness claim', () => {
    expect(policy).toMatchObject({
      profileId: WAITING_SEB_PROFILE_ID,
      experimental: true,
      nativeProof: 'pending_w7',
      routeBase: `/exam/${assignmentId}/r/3`,
      entryUrl: `${origin}/exam/${assignmentId}/r/3/entry`,
      completionUrl: `${origin}/exam/${assignmentId}/r/3/completion`,
      quitUrl: `${origin}/exam/${assignmentId}/r/3/quit`,
    })
    expect(Object.isFrozen(policy)).toBe(true)
    expect(Object.isFrozen(policy.rules)).toBe(true)
    expect(policy.completionUrl).not.toContain('.seb')
  })

  it.each([
    { origin: 'https://www.korkru.com' },
    { origin: `${origin}/` },
    { assignmentId: '../different-exam' },
    { revision: 0 },
    { revision: 3.5 },
    { rules: [] },
    { authOrigins: ['https://*.google.com'] },
    { authOrigins: ['http://accounts.google.com'] },
    { authOrigins: ['https://accounts.google.com/signin'] },
    { authOrigins: ['https://user:pass@accounts.google.com'] },
    { authOrigins: [origin] },
    { authOrigins: ['https://accounts.google.com', 'https://accounts.google.com'] },
  ])('rejects broadened or noncanonical context %#', override => {
    expect(() => createWaitingSebArtifactPolicy({ origin, assignmentId, revision: 3, ...override }))
      .toThrow('SEB_WAITING_ARTIFACT_CONTEXT_INVALID')
  })

  it('allows only bound exam navigation, bundled assets, and owned raster previews', () => {
    for (const path of ['entry', 'login', 'profile', 'waiting', 'system-check', 'take', 'submitted', 'api', 'api/start', 'resource/upload']) {
      expect(isAllowed(policy, `${origin}${policy.routeBase}/${path}`)).toBe(true)
    }
    expect(isAllowed(policy, `${policy.entryUrl}?sebChallenge=opaque`)).toBe(true)
    expect(isAllowed(policy, `${origin}${policy.routeBase}/resource?src=https%3A%2F%2Fstorage.example%2Fquestion.png`)).toBe(true)
    expect(isAllowed(policy, `${origin}${policy.routeBase}/resource?src=https://storage.example/question.png`)).toBe(true)
    expect(isAllowed(policy, policy.completionUrl)).toBe(true)
    expect(isAllowed(policy, `${origin}/_next/static/chunks/runtime.123.js`)).toBe(true)
    expect(isAllowed(policy, `${origin}/brand/deer-mark.svg`)).toBe(true)
    expect(isAllowed(policy, `blob:${origin}/${assignmentId}`)).toBe(true)
    expect(isAllowed(policy, 'data:image/png;base64,YWJj')).toBe(true)
    for (const value of [
      `${origin}/assignments`, `${origin}/dashboard`, `${origin}/exam/quit`, policy.quitUrl,
      `${origin}/rest/v1/submission_answers`, `${origin}/storage/v1/object/public/question-images/solution.png`,
      `${origin}/_next/image?url=https://other.invalid/solution.png`,
      `${origin}/_next/data/build/assignments.json`, `${origin}/brand/README.md`,
      `${policy.completionUrl}?ticket=anything`, `${policy.completionUrl}.seb`,
      `${origin}${policy.routeBase}/resource`, `${origin}${policy.routeBase}/resource?src=`,
      `${origin}${policy.routeBase}/resource/upload?anything=1`, `${origin}${policy.routeBase}/resource/token.png`,
      `${origin}/exam/40000000-0000-4000-8000-000000000004/r/3/take`,
      `${origin}/exam/${assignmentId}/r/4/take`, `${policy.entryUrl}/other`,
      `blob:https://other.invalid/${assignmentId}`, 'data:application/seb;base64,YWJj',
      'javascript:alert(1)', 'file:///tmp/completion.seb',
    ]) expect(isAllowed(policy, value), value).toBe(false)
    expect(policy.rules.every(item => item.active && item.regex && item.action === 1
      && item.expression.startsWith('^') && item.expression.endsWith('$'))).toBe(true)
  })

  it('limits explicitly named auth providers to auth paths and never permits their REST or Storage APIs', () => {
    const authPolicy = createWaitingSebArtifactPolicy({ origin, assignmentId, revision: 3,
      authOrigins: ['https://accounts.google.com', 'https://auth-test.supabase.co'] })
    for (const url of [
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=test',
      'https://accounts.google.com/v3/signin/identifier?continue=test',
      'https://auth-test.supabase.co/auth/v1/authorize?provider=google',
      `${origin}/auth/callback?code=test`,
    ]) expect(isAllowed(authPolicy, url)).toBe(true)
    for (const url of [
      'https://accounts.google.com/', 'https://google.com/search?q=test',
      'https://auth-test.supabase.co/rest/v1/submissions',
      'https://auth-test.supabase.co/storage/v1/object/public/question-images/solution.png',
      'https://not-listed.supabase.co/auth/v1/authorize',
    ]) expect(isAllowed(authPolicy, url)).toBe(false)
  })

  it('creates a passwordless initial candidate with no native quit URL and preserves unrelated XML', () => {
    const bytes = initial()
    const report = inspectWaitingSebInitialArtifact(bytes, policy, { expectedQuitHash: teacherHash })
    expect(report).toMatchObject({ phase: 'initial', nativeProof: 'pending_w7', entryPassword: false,
      teacherHashVerified: true, sizeBytes: bytes.length })
    expect(report.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    const xml = bytes.toString('utf8')
    expect(xml).toContain('<key>quitURL</key><string></string>')
    expect(xml).toContain(`<key>hashedQuitPassword</key><string>${teacherHash}</string>`)
    expect(xml).toContain('<key>allowUploads</key><true/>')
    expect(xml).toContain('Teacher &amp; student')
    expect(xml).toContain('A &amp; B')
    expect(xml).not.toContain('Teacher &amp;amp;')
    expect(xml).toContain('<key>browserExamKey</key><string></string>')
    expect(report).not.toHaveProperty('configKey')
    expect(report).not.toHaveProperty('hashedQuitPassword')
    expect(inspectWaitingSebInitialArtifact(bytes, policy).teacherHashVerified).toBe(false)
  })

  it.each(['gzip_xml', 'plnd'])('preserves passwordless %s wrapping in both phases', kind => {
    const wrapped = kind === 'plnd'
      ? gzipSync(Buffer.concat([Buffer.from('plnd'), gzipSync(template())]))
      : gzipSync(template())
    const bytes = initial(wrapped)
    const terminalBytes = materializeWaitingSebTerminalArtifact(bytes, policy)
    expect(inspectWaitingSebInitialArtifact(bytes, policy).containerKind).toBe(kind)
    expect(inspectWaitingSebTerminalArtifact(terminalBytes, policy).containerKind).toBe(kind)
    expect(gunzipSync(terminalBytes).subarray(0, 4).toString('utf8')).toBe(kind === 'plnd' ? 'plnd' : '<?xm')
  })

  it('creates deterministic terminal bytes retaining both hashes and requiring passwordless native proof later', () => {
    const source = initial()
    const sourceDigest = inspectWaitingSebInitialArtifact(source, policy).sha256
    const bytes = materializeWaitingSebTerminalArtifact(source, policy, {
      expectedQuitHash: teacherHash, expectedInitialSha256: sourceDigest,
    })
    expect(bytes).toEqual(materializeWaitingSebTerminalArtifact(source, policy))
    expect(source).toEqual(initial())
    const report = inspectWaitingSebTerminalArtifact(bytes, policy, {
      expectedQuitHash: teacherHash, expectedAdminHash: adminHash,
    })
    expect(report).toMatchObject({ phase: 'terminal', nativeProof: 'pending_w7' })
    expect(report.sha256).not.toBe(sourceDigest)
    const xml = bytes.toString('utf8')
    expect(xml).toContain(`<key>startURL</key><string>${policy.submittedUrl}</string>`)
    expect(xml).toContain(`<key>quitURL</key><string>${policy.quitUrl}</string>`)
    expect(xml).toContain('<key>downloadAndOpenSebConfig</key><false/>')
    expect(xml).toContain('<key>examSessionReconfigureAllow</key><false/>')
    expect(xml).toContain(`<key>hashedAdminPassword</key><string>${adminHash}</string>`)
    expect(isAllowed(policy, policy.submittedUrl, 'terminal')).toBe(true)
    expect(isAllowed(policy, policy.quitUrl, 'terminal')).toBe(true)
    for (const url of [policy.entryUrl, policy.completionUrl, `${origin}${policy.routeBase}/take`,
      `${origin}${policy.routeBase}/resource/token.png`, `${policy.submittedUrl}?anything=1`]) {
      expect(isAllowed(policy, url, 'terminal')).toBe(false)
    }
    expect(() => materializeWaitingSebTerminalArtifact(source, policy, {
      expectedInitialSha256: '0'.repeat(64),
    })).toThrow('SEB_WAITING_ARTIFACT_DIGEST_MISMATCH')
  })

  it.each([
    ['quitURL', `<string>${policy.quitUrl}</string>`],
    ['examSessionReconfigureConfigURL', '<string>https://other.invalid/*</string>'],
    ['downloadAndOpenSebConfig', '<false/>'],
    ['URLFilterEnableContentFilter', '<false/>'],
    ['sebConfigPurpose', '<integer>1</integer>'],
    ['allowDownloads', '<true/>'],
    ['allowQuit', '<false/>'],
    ['startURLAppendQueryParameter', '<true/>'],
    ['browserWindowAllowAddressBar', '<true/>'],
  ])('rejects initial policy drift in %s', (key, replacement) => {
    expect(() => inspectWaitingSebInitialArtifact(rewrite(initial(), key, replacement), policy)).toThrow()
  })

  it('rejects drift in filter sets, credentials, structure, and artifact size', () => {
    const bytes = initial()
    expect(() => inspectWaitingSebInitialArtifact(Buffer.from(bytes.toString().replace('action</key><integer>1',
      'action</key><integer>0')), policy)).toThrow()
    expect(() => inspectWaitingSebInitialArtifact(Buffer.from(bytes.toString().replace('</dict></plist>',
      '<key>quitURL</key><string></string></dict></plist>')), policy)).toThrow()
    expect(() => inspectWaitingSebInitialArtifact(Buffer.from('<html>error</html>'), policy)).toThrow()
    expect(() => initial(gzipSync(Buffer.alloc(2 * 1024 * 1024 + 1, 0x20)))).toThrow()
    expect(() => inspectWaitingSebInitialArtifact(bytes, policy, { expectedQuitHash: adminHash })).toThrow('SEB_WAITING_ARTIFACT_REVISION_MISMATCH')
    expect(() => materializeWaitingSebInitialArtifact(template(), policy, adminHash, options)).toThrow('SEB_WAITING_ARTIFACT_ADMIN_INVALID')
    expect(() => materializeWaitingSebInitialArtifact(template(), policy, teacherHash, { ...options, hashedAdminPassword: templateAdminHash })).toThrow('SEB_WAITING_ARTIFACT_ADMIN_INVALID')
    expect(() => materializeWaitingSebInitialArtifact(template(), policy, teacherHash, {
      ...options, randomBytes: () => Buffer.alloc(1),
    })).toThrow('SEB_WAITING_ARTIFACT_SALT_INVALID')
    expect(() => inspectWaitingSebInitialArtifact(bytes, { ...policy })).toThrow('SEB_WAITING_ARTIFACT_CONTEXT_INVALID')
    expect(() => inspectWaitingSebInitialArtifact(terminal(), policy)).toThrow()
    expect(() => inspectWaitingSebTerminalArtifact(bytes, policy)).toThrow()
  })

  it('retains immutable private bytes for repeated responses even if caller buffers are mutated', () => {
    const bytes = terminal()
    const expected = Buffer.from(bytes)
    const receipt = freezeWaitingSebArtifact(bytes, policy, { phase: 'terminal', expectedQuitHash: teacherHash })
    bytes.fill(0)
    const first = readFrozenWaitingSebArtifact(receipt)
    expect(first.bytes).toEqual(expected)
    expect(first.sha256).toBe(receipt.sha256)
    expect(first.sizeBytes).toBe(expected.length)
    first.bytes.fill(0)
    expect(readFrozenWaitingSebArtifact(receipt).bytes).toEqual(expected)
    expect(Object.isFrozen(receipt)).toBe(true)
    expect(() => readFrozenWaitingSebArtifact({ ...receipt })).toThrow('SEB_WAITING_ARTIFACT_RECEIPT_INVALID')
    expect(() => freezeWaitingSebArtifact(expected, policy, { phase: 'submitted' })).toThrow('SEB_WAITING_ARTIFACT_PHASE_INVALID')
  })

  it('keeps the legacy operator profile separate and its validation strict', () => {
    const legacy = materializeAssignmentSebPlaintextSeed(template(), teacherHash, options.randomBytes)
    expect(inspectAssignmentSebPlaintextArtifact(legacy, teacherHash)).toMatchObject({ quitUrlReady: true })
    expect(legacy.toString()).toContain('https://staging.korkru.com/assignments')
    expect(() => inspectAssignmentSebPlaintextArtifact(initial(), teacherHash, origin)).toThrow()
    expect(() => inspectWaitingSebInitialArtifact(legacy, policy)).toThrow()
  })
})
