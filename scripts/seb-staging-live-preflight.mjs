const OFFICIAL_STAGING_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_STAGING_HOSTNAME = 'staging.korkru.com'
const OFFICIAL_STAGING_PREFLIGHT_PATH = '/exam-screen-lab/seb?view=launch&configured=0'
const OFFICIAL_STAGING_SUPABASE_ORIGIN = 'https://dyuxkrzeveknqgtuzpbh.supabase.co'
const OFFICIAL_STAGING_SUPABASE_PROJECT_REF = 'dyuxkrzeveknqgtuzpbh'
const OFFICIAL_VERCEL_API_ORIGIN = 'https://api.vercel.com'
const OFFICIAL_VERCEL_PROJECT = 'jk'
const OFFICIAL_VERCEL_TEAM_SLUG = 'korkru-mes-projects'
const OFFICIAL_GITHUB_ORG = 'korkru-me'
const OFFICIAL_GITHUB_REPO = 'jk'
const OFFICIAL_BRANCH_REF = 'staging'

const PREFLIGHT_STEP = Object.freeze({
  schemaVersion: 1,
  stepId: 'verify-staging-isolation',
  phase: 'preflight',
  actor: 'harness',
  mutates: false,
})
const RUN_IDENTITY_FIELDS = Object.freeze([
  'runId',
  'sourceRevision',
  'deploymentId',
])
const FULL_IDENTITY_FIELDS = Object.freeze([
  ...RUN_IDENTITY_FIELDS,
  'releaseId',
  'releaseRevision',
  'artifactSha256',
])
const SAFE_RUN_ID = /^seb-s5-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const FORBIDDEN_RUN_ID_TERMS = /(prod(?:uction)?|live|real|customer)/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{16,64}$/
const RELEASE_ID = /^asr-[0-9a-f]{32}-r([1-9][0-9]{0,9})-([0-9a-f]{16})$/
const SHA256 = /^[a-f0-9]{64}$/
const MAX_ASSIGNMENT_CONFIG_REVISION = 2_147_483_646
const VERCEL_TOKEN = /^[A-Za-z0-9._-]{20,512}$/
const VERCEL_PROTECTION_BYPASS = /^[\x21-\x7e]{20,512}$/
const REQUEST_TIMEOUT_MS = 5_000
const MAX_VERCEL_DEPLOYMENT_BYTES = 256 * 1024
const MAX_VERCEL_ALIAS_BYTES = 64 * 1024
const MAX_STAGING_HTML_BYTES = 2 * 1024 * 1024
const BLOCKED_MESSAGE = 'SEB Staging live preflight blocked'

const SCHEMA_PROBES = Object.freeze([
  Object.freeze({
    table: 'assignment_seb_config_revisions',
    columns: 'assignment_id,revision,org_id,owner_id,hashed_quit_password,created_at',
  }),
  Object.freeze({
    table: 'assignment_seb_config_releases',
    columns: 'assignment_id,revision,org_id,owner_id,release_id,artifact_storage_path,artifact_sha256,artifact_size_bytes,config_key,browser_exam_keys,security_mode,created_at',
  }),
  Object.freeze({
    table: 'submissions',
    columns: 'id,assignment_id,student_id,status,exam_access_mode,seb_config_revision',
  }),
  Object.freeze({
    table: 'exam_proctor_sessions',
    columns: 'submission_id,exam_access_mode,seb_config_revision',
  }),
  Object.freeze({
    table: 'seb_staging_qa_run_reservations',
    columns: 'run_id,qa_namespace,source_sha,deployment_id,reservation_proof_sha256,state,reserved_at,cleaned_at',
  }),
])

export class SebStagingLivePreflightBlockedError extends Error {
  constructor() {
    super(BLOCKED_MESSAGE)
    this.name = 'SebStagingLivePreflightBlockedError'
  }
}

function blocked() {
  throw new SebStagingLivePreflightBlockedError()
}

function isDataRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(descriptor => (
    Object.hasOwn(descriptor, 'value')
    && descriptor.enumerable === true
  ))
}

function hasExactFields(value, fields) {
  if (!isDataRecord(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...fields].sort()
  return actual.length === expected.length
    && actual.every((field, index) => field === expected[index])
}

function parseExpectedIdentity(identity) {
  const runOnly = hasExactFields(identity, RUN_IDENTITY_FIELDS)
  const full = hasExactFields(identity, FULL_IDENTITY_FIELDS)
  if (!runOnly && !full) return null

  const validRun = typeof identity.runId === 'string'
    && SAFE_RUN_ID.test(identity.runId)
    && !FORBIDDEN_RUN_ID_TERMS.test(identity.runId)
    && typeof identity.sourceRevision === 'string'
    && SOURCE_REVISION.test(identity.sourceRevision)
    && typeof identity.deploymentId === 'string'
    && DEPLOYMENT_ID.test(identity.deploymentId)
  if (!validRun) return null

  if (full) {
    const releaseMatch = typeof identity.releaseId === 'string'
      ? RELEASE_ID.exec(identity.releaseId)
      : null
    const validRelease = releaseMatch !== null
      && Number.isInteger(identity.releaseRevision)
      && identity.releaseRevision >= 1
      && identity.releaseRevision <= MAX_ASSIGNMENT_CONFIG_REVISION
      && Number(releaseMatch[1]) === identity.releaseRevision
      && typeof identity.artifactSha256 === 'string'
      && SHA256.test(identity.artifactSha256)
      && releaseMatch[2] === identity.artifactSha256.slice(0, 16)
    if (!validRelease) return null
  }

  return Object.freeze({
    sourceRevision: identity.sourceRevision,
    deploymentId: identity.deploymentId,
  })
}

function parsePreflightRequest(request) {
  if (!hasExactFields(request, [
    'schemaVersion',
    'stepId',
    'phase',
    'actor',
    'mutates',
    'identity',
  ])) return null

  const exactStep = request.schemaVersion === PREFLIGHT_STEP.schemaVersion
    && request.stepId === PREFLIGHT_STEP.stepId
    && request.phase === PREFLIGHT_STEP.phase
    && request.actor === PREFLIGHT_STEP.actor
    && request.mutates === PREFLIGHT_STEP.mutates
  return exactStep ? parseExpectedIdentity(request.identity) : null
}

function exactUrl(value, expectedUrl) {
  try {
    const url = new URL(value)
    const expected = new URL(expectedUrl)
    return url.href === expected.href
  } catch {
    return false
  }
}

function responseContentType(response, expected) {
  const value = response?.headers?.get?.('content-type')
  return typeof value === 'string'
    && value.toLowerCase().split(';', 1)[0].trim() === expected
}

function boundedContentLength(response, maximumBytes) {
  const value = response?.headers?.get?.('content-length')
  if (value === null || value === undefined || value === '') return true
  return /^[0-9]+$/.test(value) && Number(value) <= maximumBytes
}

async function readBoundedText(response, maximumBytes) {
  if (!boundedContentLength(response, maximumBytes)) blocked()
  const reader = response?.body?.getReader?.()
  if (!reader || typeof reader.read !== 'function') blocked()

  const chunks = []
  let totalBytes = 0
  while (true) {
    const result = await reader.read()
    if (!isDataRecord(result) || typeof result.done !== 'boolean') blocked()
    if (result.done) break
    if (!(result.value instanceof Uint8Array)) blocked()
    totalBytes += result.value.byteLength
    if (totalBytes > maximumBytes) {
      try {
        await reader.cancel()
      } catch {
        // The response has already been rejected. Cancellation is best effort.
      }
      blocked()
    }
    chunks.push(result.value)
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    blocked()
  }
}

async function readBoundedJson(response, maximumBytes) {
  const text = await readBoundedText(response, maximumBytes)
  try {
    const parsed = JSON.parse(text)
    return isDataRecord(parsed) ? parsed : blocked()
  } catch {
    blocked()
  }
}

async function withinTimeout(operation) {
  const controller = new AbortController()
  let timer = null
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new SebStagingLivePreflightBlockedError())
    }, REQUEST_TIMEOUT_MS)
  })

  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      timeout,
    ])
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}

function vercelHeaders(token) {
  return Object.freeze({
    accept: 'application/json',
    authorization: `Bearer ${token}`,
  })
}

async function fetchVercelJson(fetchImpl, token, url, maximumBytes) {
  return withinTimeout(async signal => {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: vercelHeaders(token),
      redirect: 'error',
      cache: 'no-store',
      signal,
    })
    if (response?.status !== 200
      || response?.ok !== true
      || !exactUrl(response.url, url)
      || !responseContentType(response, 'application/json')) blocked()
    return readBoundedJson(response, maximumBytes)
  })
}

function exactDeployment(deployment, expected) {
  const meta = deployment?.meta
  const aliases = deployment?.alias
  if (!isDataRecord(meta) || !Array.isArray(aliases)) return false
  const exactGitSource = isDataRecord(deployment.gitSource)
    && deployment.gitSource.type === 'github'
    && deployment.gitSource.ref === OFFICIAL_BRANCH_REF
    && deployment.gitSource.sha === expected.sourceRevision
  return deployment.id === expected.deploymentId
    && deployment.name === OFFICIAL_VERCEL_PROJECT
    && typeof deployment.projectId === 'string'
    && /^prj_[A-Za-z0-9]{16,64}$/.test(deployment.projectId)
    && deployment.readyState === 'READY'
    && deployment.target === null
    && deployment.aliasAssigned === true
    && aliases.includes(OFFICIAL_STAGING_HOSTNAME)
    && aliases.every(alias => typeof alias === 'string')
    && meta.githubCommitOrg === OFFICIAL_GITHUB_ORG
    && meta.githubCommitRepo === OFFICIAL_GITHUB_REPO
    && meta.githubCommitRef === OFFICIAL_BRANCH_REF
    && meta.githubCommitSha === expected.sourceRevision
    && exactGitSource
    && typeof deployment.url === 'string'
    && /^[a-z0-9-]+\.vercel\.app$/.test(deployment.url)
}

function exactAlias(alias, deployment) {
  return alias.alias === OFFICIAL_STAGING_HOSTNAME
    && alias.deploymentId === deployment.id
    && alias.projectId === deployment.projectId
    && isDataRecord(alias.deployment)
    && alias.deployment.id === deployment.id
    && alias.deployment.url === deployment.url
}

function decodeHtmlText(value) {
  return value
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/&middot;|&#183;|&#xb7;/gi, '·')
    .replace(/&amp;|&#38;|&#x26;/gi, '&')
    .replace(/&lt;|&#60;|&#x3c;/gi, '<')
    .replace(/&gt;|&#62;|&#x3e;/gi, '>')
    .replace(/&quot;|&#34;|&#x22;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
}

function parseAttributes(source) {
  const attributes = Object.create(null)
  const opening = /^<\s*[A-Za-z][A-Za-z0-9:-]*/.exec(source)
  if (!opening) return null
  const body = source.slice(opening[0].length, source.lastIndexOf('>'))
  const matcher = /\s+([A-Za-z_:][A-Za-z0-9:._-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let consumed = 0
  let match = null
  while ((match = matcher.exec(body)) !== null) {
    const gap = body.slice(consumed, match.index)
    if (gap.trim() !== '' && gap.trim() !== '/') return null
    const name = match[1].toLowerCase()
    if (Object.hasOwn(attributes, name)) return null
    attributes[name] = decodeHtmlText(match[2] ?? match[3] ?? match[4] ?? '')
    consumed = matcher.lastIndex
  }
  const remainder = body.slice(consumed).trim()
  return remainder === '' || remainder === '/' ? attributes : null
}

function stripNonRenderedHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
}

function exactRobotsMeta(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const attributes = parseAttributes(tag)
    if (!attributes || attributes.name?.toLowerCase() !== 'robots') continue
    const tokens = attributes.content?.toLowerCase().split(/[\s,]+/).filter(Boolean) ?? []
    const expected = ['nocache', 'nofollow', 'noindex']
    if (tokens.length === expected.length
      && [...tokens].sort().every((token, index) => token === expected[index])) return true
  }
  return false
}

function exactStagingHtml(html, expectedSourceRevision) {
  if (typeof html !== 'string' || html.includes('\0')) return false
  const rendered = stripNonRenderedHtml(html)
  const htmlTag = /<html\b[^>]*>/i.exec(rendered)?.[0]
  const htmlAttributes = htmlTag ? parseAttributes(htmlTag) : null
  if (htmlAttributes?.['data-deployment-environment'] !== 'staging') return false
  if (htmlAttributes?.['data-source-revision'] !== expectedSourceRevision) return false
  if (!exactRobotsMeta(rendered)) return false

  const statusTags = [...rendered.matchAll(/<([A-Za-z][A-Za-z0-9:-]*)\b[^>]*>/g)]
  for (const match of statusTags) {
    const attributes = parseAttributes(match[0])
    if (!attributes
      || attributes.role !== 'status'
      || attributes['aria-label'] !== 'ระบบทดสอบ Staging') continue
    const tagName = match[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const remainder = rendered.slice((match.index ?? 0) + match[0].length)
    const closeIndex = new RegExp(`<\\/${tagName}\\s*>`, 'i').exec(remainder)?.index
    if (closeIndex === undefined) return false
    const text = decodeHtmlText(remainder.slice(0, closeIndex).replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim()
    return text === 'STAGING · ระบบทดสอบ'
  }
  return false
}

async function fetchCanonicalStagingHtml(fetchImpl, protectionBypass, expectedSourceRevision) {
  const url = `${OFFICIAL_STAGING_SITE_ORIGIN}${OFFICIAL_STAGING_PREFLIGHT_PATH}`
  await withinTimeout(async signal => {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: Object.freeze({
        accept: 'text/html',
        'x-vercel-protection-bypass': protectionBypass,
      }),
      redirect: 'error',
      cache: 'no-store',
      signal,
    })
    if (response?.status !== 200
      || response?.ok !== true
      || !exactUrl(response.url, url)
      || !responseContentType(response, 'text/html')) blocked()
    const html = await readBoundedText(response, MAX_STAGING_HTML_BYTES)
    if (!exactStagingHtml(html, expectedSourceRevision)) blocked()
  })
}

function exactAdminAttestation(value) {
  return isDataRecord(value)
    && value.targetOrigin === OFFICIAL_STAGING_SUPABASE_ORIGIN
    && value.projectRef === OFFICIAL_STAGING_SUPABASE_PROJECT_REF
    && value.client?.supabaseUrl === OFFICIAL_STAGING_SUPABASE_ORIGIN
    && typeof value.client?.schema === 'function'
}

function exactProbeResult(value) {
  return isDataRecord(value) && value.error === null
}

async function probeOfficialStagingSchema(adminClientFactory) {
  const factoryRequest = Object.freeze({
    schemaVersion: 1,
    targetOrigin: OFFICIAL_STAGING_SUPABASE_ORIGIN,
    projectRef: OFFICIAL_STAGING_SUPABASE_PROJECT_REF,
    access: 'read-only-schema-probe',
  })
  const attestation = await withinTimeout(signal => adminClientFactory(factoryRequest, signal))
  if (!exactAdminAttestation(attestation)) blocked()

  let publicSchema = null
  try {
    publicSchema = attestation.client.schema('public')
  } catch {
    blocked()
  }
  if (!publicSchema || typeof publicSchema.from !== 'function') blocked()

  for (const probe of SCHEMA_PROBES) {
    const result = await withinTimeout(signal => {
      const table = publicSchema.from(probe.table)
      if (!table || typeof table.select !== 'function') blocked()
      const query = table.select(probe.columns, { head: true })
      if (!query || typeof query.limit !== 'function') blocked()
      const limitedQuery = query.limit(1)
      return typeof limitedQuery?.abortSignal === 'function'
        ? limitedQuery.abortSignal(signal)
        : limitedQuery
    })
    if (!exactProbeResult(result)) blocked()
  }
}

function safeAttestation(expected) {
  return Object.freeze({
    siteOrigin: OFFICIAL_STAGING_SITE_ORIGIN,
    supabaseOrigin: OFFICIAL_STAGING_SUPABASE_ORIGIN,
    sourceRevision: expected.sourceRevision,
    deploymentId: expected.deploymentId,
    branchRef: OFFICIAL_BRANCH_REF,
    readyState: 'READY',
  })
}

/**
 * Create a closure-private read-only capability for the exact S5 preflight
 * step. Vercel credentials and the Supabase admin client stay inside caller-
 * owned closures; failures are collapsed to one fixed error and the only
 * successful output is a small, non-secret source/deployment attestation.
 */
export function createSebStagingLivePreflight({
  readVercelToken,
  readProtectionBypass,
  fetchImpl,
  adminClientFactory,
} = {}) {
  if (typeof readVercelToken !== 'function'
    || typeof readProtectionBypass !== 'function'
    || typeof fetchImpl !== 'function'
    || typeof adminClientFactory !== 'function') blocked()

  const capability = Object.freeze({
    async attest(request) {
      try {
        const expected = parsePreflightRequest(request)
        if (!expected) blocked()

        const token = await withinTimeout(() => readVercelToken())
        if (typeof token !== 'string'
          || token !== token.trim()
          || !VERCEL_TOKEN.test(token)) blocked()

        const deploymentUrl = new URL(
          `/v13/deployments/${expected.deploymentId}`,
          OFFICIAL_VERCEL_API_ORIGIN,
        )
        deploymentUrl.searchParams.set('withGitRepoInfo', 'true')
        deploymentUrl.searchParams.set('slug', OFFICIAL_VERCEL_TEAM_SLUG)
        const deployment = await fetchVercelJson(
          fetchImpl,
          token,
          deploymentUrl.href,
          MAX_VERCEL_DEPLOYMENT_BYTES,
        )
        if (!exactDeployment(deployment, expected)) blocked()

        const aliasUrl = new URL(
          `/v4/aliases/${OFFICIAL_STAGING_HOSTNAME}`,
          OFFICIAL_VERCEL_API_ORIGIN,
        )
        aliasUrl.searchParams.set('slug', OFFICIAL_VERCEL_TEAM_SLUG)
        const alias = await fetchVercelJson(
          fetchImpl,
          token,
          aliasUrl.href,
          MAX_VERCEL_ALIAS_BYTES,
        )
        if (!exactAlias(alias, deployment)) blocked()

        const protectionBypass = await withinTimeout(() => readProtectionBypass())
        if (typeof protectionBypass !== 'string'
          || protectionBypass !== protectionBypass.trim()
          || !VERCEL_PROTECTION_BYPASS.test(protectionBypass)) blocked()

        await fetchCanonicalStagingHtml(
          fetchImpl,
          protectionBypass,
          expected.sourceRevision,
        )

        const aliasAfterHtml = await fetchVercelJson(
          fetchImpl,
          token,
          aliasUrl.href,
          MAX_VERCEL_ALIAS_BYTES,
        )
        if (!exactAlias(aliasAfterHtml, deployment)) blocked()

        await probeOfficialStagingSchema(adminClientFactory)
        return safeAttestation(expected)
      } catch {
        blocked()
      }
    },
  })
  return capability
}
