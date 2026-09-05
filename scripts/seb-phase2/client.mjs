// Isolated, read-only administrative probe, NOT a SEB integrity verifier.
// Wire contract: SEB Server v2.2.3 / 3a417abff04b42094bb83f0e622879e1cb751700.
// Never import this lab connector into app/ or lib/.

export class LabError extends Error {
  constructor(code) {
    super(code)
    this.name = 'LabError'
    this.code = code
  }
}

const fail = (code) => { throw new LabError(code) }
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const positiveId = (value) => Number.isSafeInteger(value) && value > 0
const MAX_BODY = 128 * 1024
const TOKEN_PATH = '/oauth/token'
const ENDPOINTS = {
  'access-token-endpoint': TOKEN_PATH,
  'seb-handshake-endpoint': '/exam-api/v1/handshake',
  'seb-configuration-endpoint': '/exam-api/v1/examconfig',
  'seb-ping-endpoint': '/exam-api/v1/sebping',
  'seb-log-endpoint': '/exam-api/v1/seblog',
}

export function validateConfig(config) {
  if (!record(config) || config.labOnly !== true) fail('LAB_CONFIG_REQUIRED')
  // Literal IPv4 loopback only: no DNS, redirects, production URLs or aliases.
  if (typeof config.baseUrl !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(config.baseUrl)) {
    fail('LOOPBACK_URL_REQUIRED')
  }
  let url
  try { url = new URL(config.baseUrl) } catch { fail('LOOPBACK_URL_REQUIRED') }
  if (Number(url.port || 80) < 1024 || Number(url.port) > 65535) fail('LOOPBACK_URL_REQUIRED')
  for (const name of ['username', 'password', 'clientSecret']) {
    if (typeof config[name] !== 'string' || !/^[\x21-\x7e]{1,256}$/.test(config[name])) fail('LAB_CREDENTIALS_REQUIRED')
  }
  if (config.exam !== undefined) {
    const exam = config.exam
    if (!record(exam) || !positiveId(exam.id) || !positiveId(exam.institutionId)) fail('EXACT_EXAM_REQUIRED')
    // URL exams only, with a reserved, non-routable synthetic destination.
    if (typeof exam.startUrl !== 'string' || !/^https:\/\/example\.invalid\/lab-[a-z0-9-]+$/.test(exam.startUrl)) {
      fail('SYNTHETIC_EXAM_REQUIRED')
    }
  }
  if (config.connection !== undefined && (!config.exam || !record(config.connection) ||
      !positiveId(config.connection.id) || Object.keys(config.connection).some((key) => key !== 'id'))) {
    fail('EXACT_CONNECTION_REQUIRED')
  }
  return {
    baseUrl: config.baseUrl, username: config.username, password: config.password,
    clientSecret: config.clientSecret,
    ...(config.exam === undefined ? {} : { exam: { ...config.exam } }),
    ...(config.connection === undefined ? {} : { connection: { id: config.connection.id } }),
  }
}

async function requestJson(baseUrl, path, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options, redirect: 'error', signal: controller.signal,
      headers: { Accept: 'application/json', ...options?.headers },
    })
    if (!response.ok) {
      await response.body?.cancel()
      fail(response.status === 401 || response.status === 403 ? 'ACCESS_DENIED' : 'HTTP_ERROR')
    }
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
      await response.body?.cancel()
      fail('JSON_REQUIRED')
    }
    if (Number(response.headers.get('content-length')) > MAX_BODY) {
      await response.body?.cancel()
      fail('RESPONSE_TOO_LARGE')
    }
    const chunks = []
    let size = 0
    for await (const chunk of response.body ?? []) {
      size += chunk.length
      if (size > MAX_BODY) fail('RESPONSE_TOO_LARGE')
      chunks.push(chunk)
    }
    let result
    try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { fail('INVALID_JSON') }
    if (!record(result)) fail('INVALID_JSON')
    return result
  } catch (error) {
    if (error instanceof LabError) throw error
    // Never include remote response bodies, URL, auth headers, token or cause.
    fail(controller.signal.aborted ? 'REQUEST_TIMEOUT' : 'CONNECTION_FAILED')
  } finally {
    controller.abort()
    clearTimeout(timer)
  }
}

function validateDiscovery(discovery, baseUrl) {
  if (discovery['server-location'] !== baseUrl && discovery['server-location'] !== `${baseUrl}/`) {
    fail('DISCOVERY_ORIGIN_MISMATCH')
  }
  const versions = discovery['api-versions']
  if (!Array.isArray(versions)) fail('UNSUPPORTED_DISCOVERY')
  const matches = versions.filter((v) => record(v) && v.name === 'v1')
  if (matches.length !== 1 || !Array.isArray(matches[0].endpoints)) fail('UNSUPPORTED_DISCOVERY')
  for (const [name, path] of Object.entries(ENDPOINTS)) {
    const endpoints = matches[0].endpoints.filter((e) => record(e) && e.name === name)
    const authorization = name === 'access-token-endpoint' ? 'Basic' : 'Bearer'
    if (endpoints.length !== 1 || endpoints[0].location !== path || endpoints[0].authorization !== authorization) {
      fail('UNSUPPORTED_DISCOVERY')
    }
  }
}

function summarizeExam(exam, expected) {
  const attributes = record(exam.additionalAttributes) ? exam.additionalAttributes : {}
  if (exam.id !== expected.id || exam.institutionId !== expected.institutionId ||
      attributes.quiz_start_url !== expected.startUrl || exam.lmsSetupId !== null) fail('EXAM_BINDING_MISMATCH')
  if (!['UP_COMING', 'TEST_RUN', 'RUNNING', 'FINISHED', 'ARCHIVED'].includes(exam.status) ||
      typeof exam.active !== 'boolean') fail('INVALID_EXAM')
  // Report policy, never attest a student. ASK checks run asynchronously upstream.
  const askEnabled = attributes.SIGNATURE_KEY_CHECK_ENABLED === 'true'
  const threshold = attributes.NUMERICAL_TRUST_THRESHOLD
  // In v2.2.3, zero is NOT "manual only": even one matching client exceeds it.
  const numericalTrustThreshold = typeof threshold === 'string' && /^\d{1,9}$/.test(threshold)
    ? Number(threshold) : null
  return {
    bindingMatched: true, status: exam.status, active: exam.active,
    askCheckEnabled: askEnabled, numericalTrustThreshold,
    explicitClientGrantVerified: false, policyNeedsReview: true,
  }
}

function summarizeConnection(data, expected) {
  // Pinned upstream ClientConnectionData serializes the connection as `cdat`.
  // Never dump the row: it also contains token, user session, IP and SEB info.
  const connection = data.cdat
  if (!record(connection)) fail('INVALID_CONNECTION')
  if (connection.id !== expected.connection.id || connection.examId !== expected.exam.id ||
      connection.institutionId !== expected.exam.institutionId) fail('CONNECTION_BINDING_MISMATCH')
  if (!['UNDEFINED', 'CONNECTION_REQUESTED', 'READY', 'ACTIVE', 'CLOSED', 'DISABLED'].includes(connection.status)) {
    fail('INVALID_CONNECTION')
  }
  for (const value of [data.miss, connection.securityCheckGranted, connection.clientVersionGranted]) {
    if (value !== undefined && value !== null && typeof value !== 'boolean') fail('INVALID_CONNECTION')
  }
  return {
    bindingMatched: true, status: connection.status, missingPing: data.miss ?? null,
    reportedSecurityCheckGranted: connection.securityCheckGranted ?? null,
    reportedClientVersionGranted: connection.clientVersionGranted ?? null,
    // These are administrative observations, not an attestation. A grant flag
    // can follow upstream heuristics; neither this row nor its status proves
    // trusted build, freshness, KorKru student identity or config revision.
    explicitTrustedBuildVerified: false, freshnessVerified: false, studentBindingVerified: false,
  }
}

export async function probeLab(input, { timeoutMs = 5000 } = {}) {
  const config = validateConfig(input)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) fail('INVALID_TIMEOUT')
  const discovery = await requestJson(config.baseUrl, '/exam-api/discovery', {}, timeoutMs)
  validateDiscovery(discovery, config.baseUrl)
  // Administrative OAuth uses password grant, not the native client's
  // client_credentials handshake. Only read scope is requested and accepted.
  const token = await requestJson(config.baseUrl, TOKEN_PATH, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`guiClient:${config.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'password', username: config.username, password: config.password, scope: 'read',
    }).toString(),
  }, timeoutMs)
  if (typeof token.token_type !== 'string' || token.token_type.toLowerCase() !== 'bearer' || typeof token.access_token !== 'string' ||
      !/^[A-Za-z0-9._~+/-]{1,8192}=*$/.test(token.access_token) ||
      !Number.isFinite(token.expires_in) || token.expires_in <= 0 || token.scope !== 'read') fail('INVALID_TOKEN')
  const result = {
    labOnly: true, discovery: 'v1', adminReadAuthenticated: true,
    studentIntegrityVerified: false, productionGateChanged: false,
  }
  if (config.exam) {
    const exam = await requestJson(config.baseUrl, `/admin-api/v1/exam/${config.exam.id}`, {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        // Upstream EntityController requires this even for GET.
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }, timeoutMs)
    result.exam = summarizeExam(exam, config.exam)
  }
  if (config.connection) {
    // Only after the exact exam/institution/URL read matched. No listing,
    // user-controlled URL/token in the path, grants, instructions or writes.
    const data = await requestJson(config.baseUrl, `/admin-api/v1/seb-client-connection/data/${config.connection.id}`, {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }, timeoutMs)
    result.connection = summarizeConnection(data, config)
  }
  // Neither bearer/refresh token nor the raw exam object leaves this function.
  return result
}
