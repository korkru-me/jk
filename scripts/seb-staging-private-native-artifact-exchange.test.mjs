import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createCipheriv } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import {
  SebStagingPrivateNativeArtifactExchangeBlockedError,
  createSebStagingPrivateNativeArtifactExchange,
} from './seb-staging-private-native-artifact-exchange.mjs'

const ASSIGNMENT_ID = '11111111-1111-4111-8111-111111111111'
const KEY = Buffer.alloc(32, 7)
const identity = Object.freeze({
  runId: 'seb-s5-native-exchange',
  sourceRevision: 'a'.repeat(40),
  deploymentId: 'dpl_1234567890abcdef',
  creationWindow: Object.freeze({
    notBefore: '2026-09-24T00:00:00.000Z',
    notAfter: '2026-09-25T00:00:00.000Z',
  }),
})

function environment(overrides = {}) {
  return Object.freeze({
    KORKRU_DEPLOYMENT_ENV: 'staging', EXAM_QA_ENVIRONMENT: 'staging', VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: 'https://staging.korkru.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://dyuxkrzeveknqgtuzpbh.supabase.co',
    EXAM_QA_DATA_POLICY: 'synthetic-only', EXAM_QA_COPY_PRODUCTION_DATA: 'false',
    EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true', SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS: 'true',
    ...overrides,
  })
}

function encryptEvidence(evidence) {
  const iv = Buffer.alloc(12, 9)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(evidence))), cipher.final(),
  ])
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }
}

async function makeTemplate(path) {
  const template = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>startURL</key><string>https://staging.korkru.com/assignments</string>
<key>quitURL</key><string>https://staging.korkru.com/exam/quit</string>
<key>sebConfigPurpose</key><integer>0</integer>
<key>allowQuit</key><true />
<key>downloadAndOpenSebConfig</key><false />
<key>examSessionReconfigureAllow</key><false />
<key>hashedAdminPassword</key><string>${'a'.repeat(64)}</string>
<key>hashedQuitPassword</key><string>${'b'.repeat(64)}</string>
<key>sendBrowserExamKey</key><true />
<key>examKeySalt</key><data>${Buffer.alloc(32, 1).toString('base64')}</data>
<key>browserExamKey</key><string></string>
</dict></plist>`
  await writeFile(path, template, { mode: 0o600 })
}

async function harness({ tamperEvidence = false, ...overrides } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'seb-native-exchange-'))
  const exchangeDirectory = join(root, 'exchange')
  const templatePath = join(root, 'template.seb')
  await makeTemplate(templatePath)
  const evidence = {
    schemaVersion: 1,
    assignmentId: ASSIGNMENT_ID,
    revision: 1,
    configKey: 'c'.repeat(64),
    browserExamKeys: [{ platform: 'windows', versionString: '3.10.2', buildNumber: '920', key: 'd'.repeat(64) }],
  }
  const onRequestReady = vi.fn(async ({ requestId }) => {
    const request = JSON.parse(await readFile(join(exchangeDirectory, 'request.json'), 'utf8'))
    expect(request.requestId).toBe(requestId)
    expect(request.payloadCiphertext).not.toContain('hashedQuitPassword')
    if (tamperEvidence) {
      await writeFile(join(exchangeDirectory, 'evidence.enc.json'), JSON.stringify({
        schemaVersion: 1,
        requestId,
        seedSha256: '0'.repeat(64),
        iv: Buffer.alloc(12).toString('base64'),
        tag: Buffer.alloc(16).toString('base64'),
        ciphertext: Buffer.from('tampered').toString('base64'),
      }), { mode: 0o600 })
      return
    }
    const encrypted = encryptEvidence(evidence)
    await writeFile(join(exchangeDirectory, 'evidence.enc.json'), JSON.stringify({
      schemaVersion: 1,
      requestId,
      seedSha256: request.seedSha256,
      ...encrypted,
    }), { mode: 0o600 })
  })
  const subject = createSebStagingPrivateNativeArtifactExchange({
    runIdentity: identity,
    readEnvironment: () => environment(),
    serviceRoleCredentialProvider: vi.fn(async input => Object.freeze({
      schemaVersion: 1, targetOrigin: input.targetOrigin, credentialKind: 'service-role',
      namespace: input.namespace, serviceRoleKey: 'synthetic-service-role-key',
    })),
    automationKeyProvider: vi.fn(async input => Object.freeze({
      schemaVersion: 1, namespace: input.namespace, keyBase64: KEY.toString('base64'),
    })),
    templatePath,
    exchangeDirectory,
    onRequestReady,
    createClient: vi.fn(() => Object.freeze({ marker: 'admin' })),
    readContext: vi.fn(async () => Object.freeze({
      assignmentId: ASSIGNMENT_ID,
      revision: 1,
      hashedQuitPassword: 'e'.repeat(64),
      existingRelease: null,
    })),
    randomBytes: size => Buffer.alloc(size, 5),
    timeoutMs: 1_000,
    pollIntervalMs: 25,
    ...overrides,
  })
  return { subject, evidence, onRequestReady }
}

describe('SEB Staging private native artifact exchange', () => {
  it('exchanges only ciphertext and returns exact native evidence once', async () => {
    const { subject, evidence, onRequestReady } = await harness()
    const result = await subject.readNativeArtifact(Object.freeze({
      targetOrigin: 'https://staging.korkru.com',
      namespace: `qa:${identity.runId}`,
      assignmentId: ASSIGNMENT_ID,
      revision: 1,
    }), Object.freeze({ signal: new AbortController().signal }))
    expect(result.evidence).toEqual(evidence)
    expect(createHash('sha256').update(result.artifactBytes).digest('hex')).toMatch(/^[a-f0-9]{64}$/)
    expect(onRequestReady).toHaveBeenCalledTimes(1)
    await expect(subject.readNativeArtifact(Object.freeze({}), Object.freeze({ signal: new AbortController().signal })))
      .rejects.toThrow(SebStagingPrivateNativeArtifactExchangeBlockedError)
  })

  it('blocks tampered encrypted evidence without returning artifact material', async () => {
    const { subject } = await harness({ tamperEvidence: true })
    await expect(subject.readNativeArtifact(Object.freeze({
      targetOrigin: 'https://staging.korkru.com',
      namespace: `qa:${identity.runId}`,
      assignmentId: ASSIGNMENT_ID,
      revision: 1,
    }), Object.freeze({ signal: new AbortController().signal })))
      .rejects.toThrow(SebStagingPrivateNativeArtifactExchangeBlockedError)
  })

  it('blocks construction outside isolated Staging', async () => {
    await expect(harness({ readEnvironment: () => environment({ VERCEL_ENV: 'production' }) }))
      .rejects.toThrow(SebStagingPrivateNativeArtifactExchangeBlockedError)
  })
})
