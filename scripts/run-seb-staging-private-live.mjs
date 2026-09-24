#!/usr/bin/env node

import { randomBytes } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { parseEnvFile } from './check-seb-readiness-core.mjs'
import { createSebStagingPrivateLiveStack } from './seb-staging-private-live-stack.mjs'

const execFile = promisify(execFileCallback)
const SITE_ORIGIN = 'https://staging.korkru.com'
const SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const PROJECT_REF = 'dyuxkrzeveknqgtuzpbh'
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const SAFE_BRANCH = /^seb-s5-native-[a-z0-9]{24}$/
const BLOCKED_MESSAGE = 'SEB Staging private live command blocked'
const DEFAULT_ENV_PATH = resolve('.env.qa.local')
const DEFAULT_TEMPLATE_PATH = resolve(
  '/Users/korkusonmasaen/Downloads/korkru-staging-v2-no-entry-password.seb',
)
const DEFAULT_KEY_PATH = resolve('.local/seb-s5/native-automation-key')
const DEFAULT_EXCHANGE_DIRECTORY = resolve('.local/seb-s5/exchange')
const DEFAULT_EVIDENCE_DIRECTORY = resolve('.local/seb-s5/evidence')

function blocked() {
  throw new Error(BLOCKED_MESSAGE)
}

function parseArguments(argv) {
  const parsed = Object.create(null)
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag?.startsWith('--') || value === undefined || value.startsWith('--')) blocked()
    if (Object.hasOwn(parsed, flag)) blocked()
    parsed[flag] = value
  }
  const allowed = new Set([
    '--run-id', '--source-revision', '--deployment-id', '--env', '--template',
    '--key', '--exchange-dir', '--evidence-dir',
  ])
  if (Object.keys(parsed).some(flag => !allowed.has(flag))) blocked()
  return Object.freeze({
    runId: parsed['--run-id'],
    sourceRevision: parsed['--source-revision'],
    deploymentId: parsed['--deployment-id'],
    envPath: resolve(parsed['--env'] ?? DEFAULT_ENV_PATH),
    templatePath: resolve(parsed['--template'] ?? DEFAULT_TEMPLATE_PATH),
    keyPath: resolve(parsed['--key'] ?? DEFAULT_KEY_PATH),
    exchangeDirectory: resolve(parsed['--exchange-dir'] ?? DEFAULT_EXCHANGE_DIRECTORY),
    evidenceDirectory: resolve(parsed['--evidence-dir'] ?? DEFAULT_EVIDENCE_DIRECTORY),
  })
}

async function readLocalEnvironment(path) {
  const contents = await readFile(path, 'utf8')
  const parsed = parseEnvFile(contents)
  if (parsed.warnings.length !== 0) blocked()
  const productionSite = parsed.values.EXAM_QA_PRODUCTION_SITE_URL
  const productionSupabase = parsed.values.EXAM_QA_PRODUCTION_SUPABASE_URL
  const anonKey = parsed.values.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (typeof productionSite !== 'string'
    || typeof productionSupabase !== 'string'
    || typeof anonKey !== 'string'
    || anonKey.length < 20) blocked()
  return Object.freeze({ productionSite, productionSupabase, anonKey })
}

async function readServiceRoleKey() {
  const { stdout } = await execFile('supabase', [
    'projects', 'api-keys', '--project-ref', PROJECT_REF, '--reveal', '--output', 'json',
  ], { maxBuffer: 1024 * 1024 })
  let rows
  try { rows = JSON.parse(stdout) } catch { blocked() }
  if (!Array.isArray(rows)) blocked()
  const candidates = rows.filter(row => (
    row?.name === 'service_role'
    && row?.type === 'legacy'
    && typeof (row.api_key ?? row.apiKey ?? row.value) === 'string'
  ))
  if (candidates.length !== 1) blocked()
  const value = candidates[0].api_key ?? candidates[0].apiKey ?? candidates[0].value
  if (value.length < 20 || /[\u0000-\u0020\u007f]/u.test(value)) blocked()
  return value
}

async function readVercelToken() {
  const path = join(homedir(), 'Library/Application Support/com.vercel.cli/auth.json')
  let parsed
  try { parsed = JSON.parse(await readFile(path, 'utf8')) } catch { blocked() }
  const token = parsed?.token
  return typeof token === 'string' && /^[A-Za-z0-9._-]{20,512}$/.test(token)
    ? token
    : blocked()
}

async function readAutomationKey(path) {
  const value = (await readFile(path, 'utf8')).trim()
  const bytes = Buffer.from(value, 'base64')
  if (bytes.length !== 32 || bytes.toString('base64') !== value) blocked()
  return value
}

async function createNativeRequestBranch({ requestId, exchangeDirectory, sourceRevision }) {
  if (!SAFE_BRANCH.test(requestId)) blocked()
  const requestSource = join(exchangeDirectory, 'request.json')
  const temporaryRoot = await import('node:fs/promises').then(({ mkdtemp }) => (
    mkdtemp(join(tmpdir(), 'korkru-seb-s5-native-'))
  ))
  const branch = requestId
  try {
    await execFile('git', ['worktree', 'add', '--detach', temporaryRoot, sourceRevision])
    await execFile('git', ['switch', '-c', branch], { cwd: temporaryRoot })
    const destination = join(temporaryRoot, '.github/seb-s5/request.json')
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
    await writeFile(destination, await readFile(requestSource), { mode: 0o600 })
    await execFile('git', ['add', '.github/seb-s5/request.json'], { cwd: temporaryRoot })
    await execFile('git', [
      '-c', 'user.name=KorKru S5 Automation',
      '-c', 'user.email=actions@qa.staging.korkru.com',
      'commit', '-m', `test(seb): request native evidence ${requestId}`,
    ], { cwd: temporaryRoot })
    await execFile('git', ['push', 'origin', `HEAD:refs/heads/${branch}`], { cwd: temporaryRoot })
  } finally {
    try { await execFile('git', ['worktree', 'remove', '--force', temporaryRoot]) } catch { /* redacted */ }
  }
  process.stdout.write(`${JSON.stringify({
    status: 'native-request-ready',
    requestId,
    branch,
    exchangeDirectory,
  })}\n`)
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!RUN_ID.test(args.runId ?? '')
    || args.runId === 'seb-s5-preview'
    || !SOURCE_REVISION.test(args.sourceRevision ?? '')
    || !DEPLOYMENT_ID.test(args.deploymentId ?? '')
    || !isAbsolute(args.templatePath)
    || !isAbsolute(args.exchangeDirectory)
    || !isAbsolute(args.evidenceDirectory)) blocked()

  const [local, automationKey, vercelToken] = await Promise.all([
    readLocalEnvironment(args.envPath),
    readAutomationKey(args.keyPath),
    readVercelToken(),
  ])
  let serviceRoleKey = await readServiceRoleKey()
  const sessionSecret = randomBytes(48).toString('base64url')
  const protectionBypass = randomBytes(32).toString('base64url')
  const now = Date.now()
  const runIdentity = Object.freeze({
    runId: args.runId,
    sourceRevision: args.sourceRevision,
    deploymentId: args.deploymentId,
    creationWindow: Object.freeze({
      notBefore: new Date(now - 60_000).toISOString(),
      notAfter: new Date(now + 60 * 60_000).toISOString(),
    }),
  })
  const environment = Object.freeze({
    KORKRU_DEPLOYMENT_ENV: 'staging',
    EXAM_QA_ENVIRONMENT: 'staging',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SITE_URL: SITE_ORIGIN,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_ORIGIN,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: local.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: 'closure-private-service-role-present',
    EXAM_QA_PRODUCTION_SITE_URL: local.productionSite,
    EXAM_QA_PRODUCTION_SUPABASE_URL: local.productionSupabase,
    EXAM_QA_DATA_POLICY: 'synthetic-only',
    EXAM_QA_COPY_PRODUCTION_DATA: 'false',
    EXAM_QA_ALLOW_SYNTHETIC_WRITES: 'true',
    EXAM_QA_SEB_TIME_CONTROL: 'true',
    SEB_ALLOW_TEST_ONLY_ASSIGNMENT_CONFIGS: 'true',
  })
  const readEnvironment = () => environment
  const namespace = `qa:${args.runId}`
  const serviceRoleCredentialProvider = async request => Object.freeze({
    schemaVersion: 1,
    targetOrigin: SUPABASE_ORIGIN,
    credentialKind: 'service-role',
    namespace,
    serviceRoleKey,
  })
  const browserSecretProvider = async () => Object.freeze({
    schemaVersion: 1,
    targetOrigin: SITE_ORIGIN,
    supabaseOrigin: SUPABASE_ORIGIN,
    namespace,
    browserChannel: 'chrome',
    vercelAutomationBypassSecret: protectionBypass,
    supabaseAnonKey: local.anonKey,
  })
  const sessionSecretProvider = Object.freeze({
    readSessionSecret: async () => sessionSecret,
  })
  const automationKeyProvider = async () => Object.freeze({
    schemaVersion: 1,
    namespace,
    keyBase64: automationKey,
  })

  await mkdir(args.exchangeDirectory, { recursive: true, mode: 0o700 })
  await mkdir(args.evidenceDirectory, { recursive: true, mode: 0o700 })
  await chmod(args.exchangeDirectory, 0o700)
  await chmod(args.evidenceDirectory, 0o700)

  try {
    const harness = await createSebStagingPrivateLiveStack({
      runIdentity,
      readEnvironment,
      serviceRoleCredentialProvider,
      browserSecretProvider,
      sessionSecretProvider,
      automationKeyProvider,
      readVercelToken: async () => vercelToken,
      readProtectionBypass: async () => protectionBypass,
      nativeTemplatePath: args.templatePath,
      nativeExchangeDirectory: args.exchangeDirectory,
      evidenceDirectory: args.evidenceDirectory,
      onNativeRequestReady: request => createNativeRequestBranch({
        requestId: request.requestId,
        exchangeDirectory: args.exchangeDirectory,
        sourceRevision: args.sourceRevision,
      }),
    })
    const result = await harness.run()
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (result.status !== 'passed' || result.runStatus !== 'complete') process.exitCode = 1
  } finally {
    serviceRoleKey = ''
  }
}

main().catch(() => {
  process.stderr.write(`${BLOCKED_MESSAGE}\n`)
  process.exitCode = 1
})
