import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { mkdtemp, chmod, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { assignmentSebPlistHelpers, readAssignmentSebOperatorContext, SebArtifactOperatorError } from './seb-assignment-artifact-core.mjs'
import { createWaitingSebArtifactPolicy, materializeWaitingSebInitialArtifact } from './seb-waiting-artifact-core.mjs'
import {
  enrollWaitingSebOperator as runEnroll, parseWaitingOperatorArguments, prepareWaitingSebOperator as runPrepare,
  readWaitingNativeEvidenceFromStdin, readWaitingOperatorFile, reserveWaitingOperatorPrivateFile, writeWaitingOperatorPrivateFile,
  waitingOperatorAssignmentIsPasswordless, waitingOperatorEnvironmentBlockers, waitingOperatorSafeError, waitingOperatorSafeFailure,
} from './seb-waiting-operator-core.mjs'

const reserveSyntheticFile = write => vi.fn(async path => ({ write: async bytes => write(path, bytes), close: async () => {} }))
const prepareWaitingSebOperator = (input, dependencies) => runPrepare(input, { checkPasswordlessAssignment: async () => true, ...dependencies })
const enrollWaitingSebOperator = (input, dependencies) => runEnroll(input, { checkPasswordlessAssignment: async () => true,
  reservePrivateFile: reserveSyntheticFile(dependencies.writePrivateFile ?? vi.fn()), ...dependencies })

const ASSIGNMENT = '30000000-0000-4000-8000-000000000003'
const REVISION = 3, TEACHER_HASH = 'b'.repeat(64), ADMIN_HASH = 'd'.repeat(64)
const ORIGIN = 'https://korkru-seb-uat.vercel.app'
const policy = createWaitingSebArtifactPolicy({ origin: ORIGIN, assignmentId: ASSIGNMENT, revision: REVISION })
const environment = {
  KORKRU_DEPLOYMENT_ENV: 'staging', EXAM_QA_ENVIRONMENT: 'staging', VERCEL_ENV: 'production',
  NEXT_PUBLIC_SITE_URL: ORIGIN, SEB_UAT_ISOLATED_PROJECT: 'true', NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: 'korkru-seb-uat.vercel.app',
  EXAM_QA_PRODUCTION_SITE_URL: 'https://www.korkru.com', NEXT_PUBLIC_SUPABASE_URL: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
  EXAM_QA_PRODUCTION_SUPABASE_URL: 'https://production-project.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-staging-anon-key-long', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-staging-service-key-long',
  SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS: 'true', SEB_EXAM_WAITING_ENABLED: 'true',
}
const context = { assignmentId: ASSIGNMENT, revision: REVISION, hashedQuitPassword: TEACHER_HASH, existingRelease: null }
function template() {
  return Buffer.from(`<?xml version="1.0" encoding="utf-8"?><plist version="1.0"><dict>
  <key>hashedAdminPassword</key><string>${'e'.repeat(64)}</string>
  <key>hashedQuitPassword</key><string>${'a'.repeat(64)}</string>
  <key>startURL</key><string>https://staging.korkru.com/assignments</string>
  <key>quitURL</key><string>https://staging.korkru.com/exam/quit</string>
  </dict></plist>`)
}
function initial() { return materializeWaitingSebInitialArtifact(template(), policy, TEACHER_HASH,
  { hashedAdminPassword: ADMIN_HASH, randomBytes: size => Buffer.alloc(size, 7) }) }
function evidence(override = {}) {
  return JSON.stringify({ schemaVersion: 2, assignmentId: ASSIGNMENT, revision: REVISION, configKey: 'c'.repeat(64),
    browserExamKeyBuilds: [
      { target: 'windows', platform: 'windows', versionString: '3.10.2', buildNumber: '920', key: '1'.repeat(64) },
      { target: 'macos', platform: 'macos', versionString: '3.7', buildNumber: '100', key: '2'.repeat(64) },
      { target: 'ipados', platform: 'ios', versionString: '3.7', buildNumber: '100', key: '3'.repeat(64) },
      { target: 'ios', platform: 'ios', versionString: '3.7', buildNumber: '100', key: '3'.repeat(64) },
    ], ...override })
}
function options(mode, extra = []) {
  return parseWaitingOperatorArguments(['--assignment', ASSIGNMENT, '--revision', String(REVISION),
    ...(mode === 'prepare' ? ['--template', '/synthetic/template.xml', '--output', '/synthetic/seed.seb']
      : ['--artifact', '/synthetic/native-final.seb', '--native-final-sha256', createHash('sha256').update(initial()).digest('hex'), '--manifest-output', '/synthetic/manifest.json']), ...extra], mode)
}
function storage({ uploadError = false, corruptPhase = null, registrationError = false, registrationOverride = {} } = {}) {
  const events = [], objects = new Map()
  const bucket = {
    upload: vi.fn(async (path, bytes, params) => {
      events.push(['upload', path, params]); objects.set(path, Buffer.from(bytes))
      return { error: uploadError ? { message: 'uncertain upload' } : null }
    }),
    download: vi.fn(async path => {
      events.push(['download', path])
      const stored = objects.get(path)
      const phase = [...objects.keys()].indexOf(path) === 0 ? 'initial' : 'terminal'
      const bytes = corruptPhase === phase ? Buffer.from('corrupt') : stored
      return { error: bytes ? null : { message: 'missing' }, data: bytes ? new Blob([bytes]) : null }
    }),
  }
  const admin = {
    storage: { from: vi.fn(() => bucket) },
    rpc: vi.fn(async (name, input) => {
      events.push(['rpc', name])
      return { error: registrationError ? { message: 'not printed' } : null, data: [{
        assignment_id: input.p_assignment_id, revision: input.p_revision,
        release_id: `asr-${ASSIGNMENT.replaceAll('-', '')}-r${REVISION}-${input.p_artifact_sha256.slice(0, 16)}`,
        artifact_storage_path: input.p_artifact_storage_path, artifact_sha256: input.p_artifact_sha256,
        artifact_size_bytes: input.p_artifact_size_bytes, security_mode: input.p_security_mode,
        browser_exam_key_count: input.p_browser_exam_keys.length, created_at: '2026-10-09T00:00:00Z', ...registrationOverride,
      }] }
    }),
  }
  return { admin, bucket, events, objects }
}

describe('waiting-profile CLI argument and environment boundaries', () => {
  it('requires exact dedicated UAT and Staging DB with both experimental gates', () => {
    expect(waitingOperatorEnvironmentBlockers(environment)).toEqual([])
    for (const changed of [{ NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com' }, { KORKRU_DEPLOYMENT_ENV: 'production' },
      { SEB_UAT_ISOLATED_PROJECT: 'false' }, { SEB_EXAM_WAITING_ENABLED: 'false' },
      { NEXT_PUBLIC_SUPABASE_URL: environment.EXAM_QA_PRODUCTION_SUPABASE_URL }, { SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS: 'false' }]) {
      expect(waitingOperatorEnvironmentBlockers({ ...environment, ...changed }).length).toBeGreaterThan(0)
    }
  })
  it('parses only explicit scalar flags and finite auth origins', () => {
    expect(options('prepare', ['--auth-origin', 'https://accounts.google.com', '--admin-password-output', '/synthetic/admin.txt', '--apply']))
      .toMatchObject({ revision: 3, apply: true, authOrigins: ['https://accounts.google.com'] })
    expect(options('enroll', ['--terminal-output', '/synthetic/terminal.seb', '--evidence-file', '/synthetic/native.json'])).toHaveProperty('apply', false)
  })
  it.each([
    ['--revision', '03'], ['--apply', '--apply'], ['--multiplatform'], ['--unknown', 'value'],
    ['--auth-origin', 'https://*.google.com'], ['--auth-origin', 'https://evil.test'],
    ['--auth-origin', 'https://accounts.google.com', '--auth-origin', 'https://accounts.google.com'],
    ['--admin-password-output', '/synthetic/seed.seb'], ['--env-file', '/synthetic/seed.seb'],
  ])('rejects ambiguous or broadened flags %#', extra => { expect(() => options('prepare', extra)).toThrow() })
  it('rejects output collision and malformed native-final digest', () => {
    expect(() => options('enroll', ['--terminal-output', '/synthetic/native-final.seb'])).toThrow('SEB_WAITING_OPERATOR_OUTPUT_CONFLICT')
    expect(() => parseWaitingOperatorArguments(['--assignment', ASSIGNMENT, '--revision', '3', '--artifact', 'a', '--native-final-sha256', 'bad', '--manifest-output', 'b'], 'enroll')).toThrow('SEB_WAITING_OPERATOR_NATIVE_FINAL_INVALID')
  })
  it('bounds stdin and never accepts an interactive, malformed UTF8 or empty credential stream', async () => {
    await expect(readWaitingNativeEvidenceFromStdin({ isTTY: true })).rejects.toThrow('SEB_NATIVE_EVIDENCE_STDIN_REQUIRED')
    await expect(readWaitingNativeEvidenceFromStdin(Readable.from([]))).rejects.toThrow('SEB_NATIVE_EVIDENCE_STDIN_REQUIRED')
    await expect(readWaitingNativeEvidenceFromStdin(Readable.from([Buffer.alloc(24_001)]))).rejects.toThrow('SEB_NATIVE_EVIDENCE_INVALID')
    await expect(readWaitingNativeEvidenceFromStdin(Readable.from([Buffer.from([0xff])]))).rejects.toThrow('SEB_NATIVE_EVIDENCE_INVALID')
    expect(await readWaitingNativeEvidenceFromStdin(Readable.from([evidence()]))).toBe(evidence())
  })
  it('redacts arbitrary failures to fixed codes rather than exception messages', () => {
    expect(waitingOperatorSafeError(new Error('private-secret-and-path'))).toBe('SEB_WAITING_OPERATOR_FAILED')
    expect(waitingOperatorSafeError(new SebArtifactOperatorError('SEB_OPERATOR_REVISION_CONFLICT'))).toBe('SEB_OPERATOR_REVISION_CONFLICT')
    expect(waitingOperatorSafeError({ code: 'EEXIST', message: 'private' })).toBe('SEB_OPERATOR_OUTPUT_EXISTS')
    expect(waitingOperatorSafeError({ name: 'SebWaitingArtifactError', code: 'private-secret' })).toBe('SEB_WAITING_OPERATOR_FAILED')
  })
  it.each(['tenant', 'owner', 'revision', 'active', 'assignment'])('retains the existing current operator-context guard for %s', async changed => {
    const assignment = { id: ASSIGNMENT, org_id: 'tenant', created_by: 'owner', mode: 'online', type: 'exam', status: 'draft', secure_browser_mode: 'seb_required' }
    const revision = { assignment_id: ASSIGNMENT, revision: REVISION, org_id: 'tenant', owner_id: 'owner', hashed_quit_password: TEACHER_HASH }
    if (changed === 'tenant') revision.org_id = 'another-tenant'
    if (changed === 'owner') revision.owner_id = 'another-owner'
    if (changed === 'revision') revision.revision = 2
    if (changed === 'assignment') assignment.status = 'published'
    const admin = { from: table => {
      const query = { select: () => query, eq: () => query, order: () => query, limit: () => query,
        maybeSingle: async () => ({ error: null, data: table === 'assignments' ? assignment : table === 'assignment_seb_config_revisions'
          ? revision : table === 'submissions' && changed === 'active' ? { id: 'existing-active' } : null }) }
      return query
    } }
    await expect(readAssignmentSebOperatorContext(admin, ASSIGNMENT, REVISION)).rejects.toThrow()
  })
  it('writes synthetic private files with wx, preserves existing bytes and refuses broad permission/symlink inputs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'korkru-waiting-operator-test-'))
    const output = join(directory, 'synthetic-private.txt'), alias = join(directory, 'alias.txt')
    try {
      await writeWaitingOperatorPrivateFile(output, 'synthetic-not-a-real-secret')
      expect((await readWaitingOperatorFile(output, { privateFile: true })).toString()).toBe('synthetic-not-a-real-secret')
      await expect(writeWaitingOperatorPrivateFile(output, 'overwrite')).rejects.toMatchObject({ code: 'EEXIST' })
      expect(await readFile(output, 'utf8')).toBe('synthetic-not-a-real-secret')
      await chmod(output, 0o644)
      await expect(readWaitingOperatorFile(output, { privateFile: true })).rejects.toThrow('SEB_OPERATOR_ENV_FILE_PERMISSIONS')
      await chmod(output, 0o600)
      await symlink(output, alias)
      await expect(readWaitingOperatorFile(alias, { privateFile: true })).rejects.toMatchObject({ code: 'ELOOP' })
      await expect(readWaitingOperatorFile(output, { maxBytes: 1 })).rejects.toThrow('SEB_WAITING_OPERATOR_FILE_INVALID')
      const manifest = join(directory, 'manifest.json')
      const reserved = await reserveWaitingOperatorPrivateFile(manifest)
      expect(await readFile(manifest, 'utf8')).toBe('')
      await expect(reserveWaitingOperatorPrivateFile(manifest)).rejects.toMatchObject({ code: 'EEXIST' })
      await reserved.write('synthetic-safe-metadata')
      await reserved.close()
      expect((await readWaitingOperatorFile(manifest, { privateFile: true })).toString()).toBe('synthetic-safe-metadata')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('checks access-code absence through a scoped ID-only query, never selecting the code value', async () => {
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), is: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: { id: ASSIGNMENT }, error: null })) }
    const admin = { from: vi.fn(() => query) }
    expect(await waitingOperatorAssignmentIsPasswordless(admin, ASSIGNMENT)).toBe(true)
    expect(query.select).toHaveBeenCalledExactlyOnceWith('id')
    expect(query.eq.mock.calls).toEqual([['id', ASSIGNMENT], ['type', 'exam'], ['mode', 'online'],
      ['secure_browser_mode', 'seb_required'], ['completion_rule', 'fixed']])
    expect(query.is).toHaveBeenCalledExactlyOnceWith('access_code', null)
    query.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await waitingOperatorAssignmentIsPasswordless(admin, ASSIGNMENT)).toBe(false)
  })
  it.each([
    [{}, true], [{ completion_rule: 'streak' }, false], [{ type: 'exercise' }, false],
    [{ mode: 'print' }, false], [{ secure_browser_mode: 'browser' }, false], [{ access_code: 'synthetic-code' }, false],
  ])('allows only fixed online SEB passwordless pilot under the ID-only predicate %#', async (changed, expected) => {
    const row = { id: ASSIGNMENT, type: 'exam', mode: 'online', secure_browser_mode: 'seb_required', completion_rule: 'fixed', access_code: null, ...changed }
    const filters = new Map(), columns = []
    const query = { select: value => { columns.push(value); return query },
      eq: (key, value) => { filters.set(key, value); return query }, is: (key, value) => { filters.set(key, value); return query },
      maybeSingle: async () => ({ error: null, data: [...filters].every(([key, value]) => row[key] === value) ? { id: row.id } : null }) }
    expect(await waitingOperatorAssignmentIsPasswordless({ from: () => query }, ASSIGNMENT)).toBe(expected)
    expect(columns).toEqual(['id'])
  })
})

describe('waiting-profile preparation with synthetic I/O', () => {
  it('dry-run does no context/network/credential generation/write work', async () => {
    const readContext = vi.fn(), writePrivateFile = vi.fn(), randomBytes = vi.fn()
    expect(await prepareWaitingSebOperator({ options: options('prepare'), environment, templateBytes: template() },
      { readContext, writePrivateFile, randomBytes })).toMatchObject({ mode: 'dry-run', networkUsed: false, fileWritten: false, nativeProof: 'pending_w7' })
    expect(readContext).not.toHaveBeenCalled(); expect(writePrivateFile).not.toHaveBeenCalled(); expect(randomBytes).not.toHaveBeenCalled()
  })
  it('generates fresh administrator plaintext only in memory/private output, hashes it and never returns either hash/key/password', async () => {
    const writePrivateFile = vi.fn(), readContext = vi.fn(async () => context)
    const result = await prepareWaitingSebOperator({ options: options('prepare', ['--apply', '--admin-password-output', '/synthetic/admin.txt']), environment, templateBytes: template() },
      { readContext, writePrivateFile, randomBytes: size => Buffer.alloc(size, 9) })
    const password = writePrivateFile.mock.calls[0][1].trim()
    expect(password.length).toBeGreaterThanOrEqual(20)
    const bytes = writePrivateFile.mock.calls[1][1]
    const scalars = assignmentSebPlistHelpers.parse(assignmentSebPlistHelpers.decode(bytes).xml)
    expect(scalars.get('hashedAdminPassword').value).toBe(createHash('sha256').update(password).digest('hex'))
    expect(scalars.get('hashedQuitPassword').value).toBe(TEACHER_HASH)
    expect(scalars.get('quitURL').value).toBe('')
    expect(scalars.get('startURL').value).toBe(policy.entryUrl)
    expect(scalars.get('examSessionReconfigureConfigURL').value).toBe(policy.completionUrl)
    const printed = JSON.stringify(result)
    for (const secret of [password, TEACHER_HASH, 'e'.repeat(64), 'synthetic-staging-service-key-long']) expect(printed).not.toContain(secret)
    expect(result).toHaveProperty('nativeProof', 'pending_w7')
  })
  it.each([{ revision: 2 }, { assignmentId: 'other' }, { hashedQuitPassword: 'invalid' }, { existingRelease: {} }])('blocks wrong/currently enrolled context before private outputs %#', async changed => {
    const writePrivateFile = vi.fn()
    await expect(prepareWaitingSebOperator({ options: options('prepare', ['--apply']), environment, templateBytes: template() },
      { readContext: async () => ({ ...context, ...changed }), writePrivateFile })).rejects.toThrow()
    expect(writePrivateFile).not.toHaveBeenCalled()
  })
  it('rejects a coded assignment before generating a credential or writing the seed', async () => {
    const writePrivateFile = vi.fn(), randomBytes = vi.fn()
    await expect(prepareWaitingSebOperator({ options: options('prepare', ['--apply']), environment, templateBytes: template() },
      { readContext: async () => context, checkPasswordlessAssignment: async () => false, writePrivateFile, randomBytes }))
      .rejects.toThrow('SEB_WAITING_OPERATOR_ASSIGNMENT_UNSUPPORTED')
    expect(writePrivateFile).not.toHaveBeenCalled(); expect(randomBytes).not.toHaveBeenCalled()
  })
  it('cannot omit the passwordless-assignment guard on apply', async () => {
    const writePrivateFile = vi.fn()
    await expect(runPrepare({ options: options('prepare', ['--apply']), environment, templateBytes: template() },
      { readContext: async () => context, writePrivateFile })).rejects.toThrow('SEB_OPERATOR_CONTEXT_UNAVAILABLE')
    expect(writePrivateFile).not.toHaveBeenCalled()
  })
})

describe('waiting-profile enrollment with synthetic Storage/RPC', () => {
  it('dry-run validates immutable candidate checksum/policy without native evidence, network, registration or files', async () => {
    const readContext = vi.fn(), writePrivateFile = vi.fn()
    expect(await enrollWaitingSebOperator({ options: options('enroll'), environment, artifactBytes: initial() },
      { readContext, writePrivateFile })).toMatchObject({ mode: 'dry-run', networkUsed: false, mutationUsed: false, nativeProof: 'pending_w7' })
    expect(readContext).not.toHaveBeenCalled(); expect(writePrivateFile).not.toHaveBeenCalled()
  })
  it('uploads frozen pair immutably, verifies both downloaded objects before RPC, and writes only nonsecret exact manifest refs', async () => {
    const { admin, events, objects } = storage(), writePrivateFile = vi.fn()
    const result = await enrollWaitingSebOperator({ options: options('enroll', ['--apply', '--terminal-output', '/synthetic/terminal.seb']), environment, artifactBytes: initial(), evidence: evidence() },
      { admin, readContext: async () => context, writePrivateFile })
    expect(objects.size).toBe(2)
    expect(events.map(event => event[0])).toEqual(['upload', 'download', 'upload', 'download', 'download', 'rpc'])
    expect(events.filter(event => event[0] === 'upload').every(event => event[2].upsert === false)).toBe(true)
    expect(admin.storage.from).toHaveBeenCalledWith('assignment-seb-configs')
    expect(admin.rpc).toHaveBeenCalledExactlyOnceWith('register_assignment_seb_config_release', expect.objectContaining({
      p_assignment_id: ASSIGNMENT, p_revision: 3, p_config_key: 'c'.repeat(64), p_security_mode: 'test_plaintext',
    }))
    expect(result).toMatchObject({ status: 'enrolled', nativeProof: 'pending_w7', profileId: 'waiting-room-completion-experimental-v1' })
    const manifest = JSON.parse(writePrivateFile.mock.calls[1][1])
    expect(manifest).toEqual([{ assignmentId: ASSIGNMENT, revision: REVISION, releaseId: result.releaseId,
      origin: ORIGIN, profileId: result.profileId, authOrigins: [], initial: result.initial, terminal: result.terminal }])
    const terminalBytes = objects.get(result.terminal.path)
    const terminalValues = assignmentSebPlistHelpers.parse(assignmentSebPlistHelpers.decode(terminalBytes).xml)
    expect(terminalValues.get('hashedAdminPassword').value).toBe(ADMIN_HASH)
    expect(terminalValues.get('hashedQuitPassword').value).toBe(TEACHER_HASH)
    expect(terminalValues.get('quitURL').value).toBe(policy.quitUrl)
    expect(terminalValues.get('browserExamKey').value).toBe('')
    expect(JSON.stringify([result, manifest])).not.toMatch(new RegExp([TEACHER_HASH, ADMIN_HASH, 'c'.repeat(64), '1'.repeat(64)].join('|')))
  })
  it.each(['initial', 'terminal'])('denies corrupted downloaded %s bytes before registration', async corruptPhase => {
    const { admin } = storage({ corruptPhase })
    await expect(enrollWaitingSebOperator({ options: options('enroll', ['--apply']), environment, artifactBytes: initial(), evidence: evidence() },
      { admin, readContext: async () => context, writePrivateFile: vi.fn() })).rejects.toThrow('SEB_OPERATOR_UPLOAD_CONFLICT')
    expect(admin.rpc).not.toHaveBeenCalled()
  })
  it.each(['manifest', 'terminal'])('reserves %s output with wx before any Storage/RPC mutation and preserves pre-existing output', async phase => {
    const { admin, bucket } = storage(), reservePrivateFile = vi.fn(async path => {
      if (path.endsWith(`${phase === 'manifest' ? 'manifest.json' : 'terminal.seb'}`)) throw Object.assign(new Error('private-path'), { code: 'EEXIST' })
      return { write: vi.fn(), close: vi.fn() }
    })
    await expect(enrollWaitingSebOperator({ options: options('enroll', ['--apply', '--terminal-output', '/synthetic/terminal.seb']), environment, artifactBytes: initial(), evidence: evidence() },
      { admin, readContext: async () => context, reservePrivateFile })).rejects.toMatchObject({ code: 'EEXIST' })
    expect(bucket.upload).not.toHaveBeenCalled(); expect(admin.rpc).not.toHaveBeenCalled()
  })
  it('rejects coded assignment before any output reservation or cloud mutation', async () => {
    const { admin, bucket } = storage(), reservePrivateFile = vi.fn()
    await expect(enrollWaitingSebOperator({ options: options('enroll', ['--apply']), environment, artifactBytes: initial(), evidence: evidence() },
      { admin, readContext: async () => context, checkPasswordlessAssignment: async () => false, reservePrivateFile })).rejects.toThrow('SEB_WAITING_OPERATOR_ASSIGNMENT_UNSUPPORTED')
    expect(reservePrivateFile).not.toHaveBeenCalled(); expect(bucket.upload).not.toHaveBeenCalled(); expect(admin.rpc).not.toHaveBeenCalled()
  })
  it('reuses only exact immutable bytes on an uncertain upload response', async () => {
    const { admin } = storage({ uploadError: true })
    expect(await enrollWaitingSebOperator({ options: options('enroll', ['--apply']), environment, artifactBytes: initial(), evidence: evidence() },
      { admin, readContext: async () => context, writePrivateFile: vi.fn() })).toHaveProperty('uploadStatus', { initial: 'reused', terminal: 'reused' })
  })
  it('freezes native-final bytes before async context work can mutate caller buffers', async () => {
    const artifactBytes = initial(), original = Buffer.from(artifactBytes)
    const { admin, objects } = storage()
    const result = await enrollWaitingSebOperator({ options: options('enroll', ['--apply']), environment, artifactBytes, evidence: evidence() },
      { admin, readContext: async () => { artifactBytes.fill(0); return context }, writePrivateFile: vi.fn() })
    expect(objects.get(result.initial.path)).toEqual(original)
    expect(artifactBytes.equals(original)).toBe(false)
  })
  it.each([evidence({ assignmentId: 'wrong' }), evidence({ revision: 4 }), evidence({ extra: 'secret' }), '{not json}',
    evidence({ browserExamKeyBuilds: [{ target: 'windows', platform: 'windows', versionString: '3.10.2', buildNumber: '920', key: '1'.repeat(64) }] })])('rejects incomplete/wrong native evidence before upload %#', async nativeEvidence => {
    const { admin, bucket } = storage()
    await expect(enrollWaitingSebOperator({ options: options('enroll', ['--apply']), environment, artifactBytes: initial(), evidence: nativeEvidence },
      { admin, readContext: async () => context, writePrivateFile: vi.fn() })).rejects.toThrow('SEB_NATIVE_EVIDENCE_INVALID')
    expect(bucket.upload).not.toHaveBeenCalled(); expect(admin.rpc).not.toHaveBeenCalled()
  })
  it('rejects changed native-final bytes and mismatched teacher hash before upload', async () => {
    const { admin, bucket } = storage()
    await expect(enrollWaitingSebOperator({ options: options('enroll', ['--apply']), environment, artifactBytes: Buffer.concat([initial(), Buffer.from('changed')]), evidence: evidence() },
      { admin, readContext: async () => context, writePrivateFile: vi.fn() })).rejects.toThrow('SEB_WAITING_OPERATOR_NATIVE_FINAL_INVALID')
    await expect(enrollWaitingSebOperator({ options: options('enroll', ['--apply']), environment, artifactBytes: initial(), evidence: evidence() },
      { admin, readContext: async () => ({ ...context, hashedQuitPassword: 'f'.repeat(64) }), writePrivateFile: vi.fn() })).rejects.toThrow('SEB_WAITING_ARTIFACT_REVISION_MISMATCH')
    expect(bucket.upload).not.toHaveBeenCalled()
  })
  it('rejects a different Windows build instead of accepting well-shaped but unbound native metadata', async () => {
    const decoded = JSON.parse(evidence())
    decoded.browserExamKeyBuilds[0].buildNumber = '919'
    const { admin, bucket } = storage()
    await expect(enrollWaitingSebOperator({ options: options('enroll', ['--apply']), environment, artifactBytes: initial(), evidence: JSON.stringify(decoded) },
      { admin, readContext: async () => context, writePrivateFile: vi.fn() })).rejects.toThrow('SEB_NATIVE_EVIDENCE_INVALID')
    expect(bucket.upload).not.toHaveBeenCalled()
  })
  it.each([{ registrationError: true }, { registrationOverride: { release_id: 'wrong' } }])('fails safely on registration mismatch/failure %#', async state => {
    const { admin } = storage(state), writePrivateFile = vi.fn()
    await expect(enrollWaitingSebOperator({ options: options('enroll', ['--apply']), environment, artifactBytes: initial(), evidence: evidence() },
      { admin, readContext: async () => context, writePrivateFile })).rejects.toThrow('SEB_WAITING_OPERATOR_RECONCILIATION_REQUIRED')
    expect(writePrivateFile).not.toHaveBeenCalled()
  })
  it('reports safe reconciliation refs after a post-registration disk failure without retrying registration', async () => {
    const { admin } = storage(), reservePrivateFile = vi.fn(async () => ({
      write: vi.fn(async () => { throw new Error('private-disk-and-secret-message') }), close: vi.fn(),
    }))
    let failure
    try {
      await enrollWaitingSebOperator({ options: options('enroll', ['--apply']), environment, artifactBytes: initial(), evidence: evidence() },
        { admin, readContext: async () => context, reservePrivateFile })
    } catch (error) { failure = waitingOperatorSafeFailure(error) }
    expect(failure).toMatchObject({ status: 'reconciliation_required', code: 'SEB_WAITING_OPERATOR_RECONCILIATION_REQUIRED',
      assignmentId: ASSIGNMENT, revision: REVISION, registrationOutcome: 'registered', nativeProof: 'pending_w7' })
    expect(failure.initial.path).toContain(failure.initial.sha256)
    expect(failure.terminal.path).toContain(failure.terminal.sha256)
    expect(JSON.stringify(failure)).not.toMatch(/private-disk|secret-message/)
    expect(admin.rpc).toHaveBeenCalledOnce()
  })
})
