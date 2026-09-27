const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i
const SAFE_METADATA_PATTERN = /^[A-Za-z0-9.+-]{1,40}$/
const SAFE_REVISION_PATTERN = /^[A-Za-z0-9._-]{1,120}$/
const REGISTRY_FIELDS = new Set(['schemaVersion', 'configRevision', 'entries'])
const ENTRY_FIELDS = new Set(['platform', 'versionString', 'buildNumber', 'key'])

function validHex(value) {
  const trimmed = value?.trim() ?? ''
  return SHA256_HEX_PATTERN.test(trimmed) ? trimmed : null
}

function parseHttpUrl(value) {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

function validConfigRevision(value) {
  const trimmed = value?.trim() ?? ''
  return SAFE_REVISION_PATTERN.test(trimmed) ? trimmed : null
}

function parseBrowserExamKeyRegistry(rawValue, expectedConfigRevision) {
  if (!rawValue || rawValue.length > 24_000 || !expectedConfigRevision) return null
  try {
    const registry = JSON.parse(rawValue)
    if (!registry || typeof registry !== 'object' || Array.isArray(registry)) return null
    if (
      Object.keys(registry).some(field => !REGISTRY_FIELDS.has(field))
      || registry.schemaVersion !== 1
      || registry.configRevision !== expectedConfigRevision
      || !Array.isArray(registry.entries)
      || registry.entries.length === 0
      || registry.entries.length > 32
    ) return null

    const identities = new Set()
    for (const entry of registry.entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
      if (
        Object.keys(entry).some(field => !ENTRY_FIELDS.has(field))
        || !['windows', 'macos', 'ios'].includes(entry.platform)
        || typeof entry.versionString !== 'string'
        || !SAFE_METADATA_PATTERN.test(entry.versionString)
        || typeof entry.buildNumber !== 'string'
        || !SAFE_METADATA_PATTERN.test(entry.buildNumber)
        || validHex(entry.key) === null
      ) return null
      const identity = `${entry.platform}:${entry.versionString}:${entry.buildNumber}`
      if (identities.has(identity)) return null
      identities.add(identity)
    }
    return registry.entries
  } catch {
    return null
  }
}

function inspectReleaseRegistryBinding(releaseRegistry, configRevision, browserExamKeys) {
  const empty = {
    configRevisionReady: false,
    releaseRegistryReady: false,
    browserExamKeyRegistryReady: false,
    browserExamKeyCoverageReady: false,
  }
  const revisions = Array.isArray(releaseRegistry?.revisions) ? releaseRegistry.revisions : []
  const revision = revisions.find(candidate => candidate?.revision === configRevision)
  if (!revision || !['candidate', 'active'].includes(revision.lifecycle)) return empty

  const builds = Array.isArray(revision.builds) ? revision.builds : []
  const targets = new Set()
  const declaredIdentities = new Set()
  let buildsApproved = builds.length === 4
  for (const build of builds) {
    if (typeof build?.target === 'string') targets.add(build.target)
    const expectedRuntime = build?.target === 'ipados' || build?.target === 'ios'
      ? 'ios'
      : build?.target
    const metadataReady = ['windows', 'macos', 'ios'].includes(build?.runtimePlatform)
      && build.runtimePlatform === expectedRuntime
      && typeof build?.versionString === 'string'
      && SAFE_METADATA_PATTERN.test(build.versionString)
      && typeof build?.buildNumber === 'string'
      && SAFE_METADATA_PATTERN.test(build.buildNumber)
    if (metadataReady) {
      declaredIdentities.add(`${build.runtimePlatform}:${build.versionString}:${build.buildNumber}`)
    }
    if (!metadataReady || build?.approval !== 'approved') buildsApproved = false
  }
  const requiredTargetsReady = ['macos', 'ipados', 'ios', 'windows']
    .every(target => targets.has(target))
  const policy = revision.policy && typeof revision.policy === 'object' ? revision.policy : {}
  const policiesReady = Object.keys(policy).length === 6
    && Object.values(policy).every(value => value === 'approved')
  const receivedIdentities = new Set(
    (browserExamKeys ?? []).map(entry => `${entry.platform}:${entry.versionString}:${entry.buildNumber}`),
  )
  const entriesDeclared = browserExamKeys !== null
    && receivedIdentities.size > 0
    && [...receivedIdentities].every(identity => declaredIdentities.has(identity))
  const coverageReady = entriesDeclared
    && requiredTargetsReady
    && declaredIdentities.size > 0
    && [...declaredIdentities].every(identity => receivedIdentities.has(identity))
  return {
    configRevisionReady: true,
    releaseRegistryReady: requiredTargetsReady && buildsApproved && policiesReady,
    browserExamKeyRegistryReady: entriesDeclared,
    browserExamKeyCoverageReady: coverageReady,
  }
}

const DOTENV_LINE_PATTERN = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]*)?\s*(?:#.*)?$/

function lastUnescapedDollarIndex(value) {
  const matches = Array.from(value.matchAll(/(?<!\\)\$/g))
  return matches.length > 0 ? matches.at(-1).index : -1
}

// Match Next.js/dotenv-expand semantics by resolving the last variable first.
// Resolving from the right is important for nested `${A:-${B}}` fallbacks.
function interpolateEnvValue(value, environment, parsed, depth = 0) {
  if (depth > 200) throw new Error('cyclic variable expansion')
  const dollarIndex = lastUnescapedDollarIndex(value)
  if (dollarIndex === -1) return value.replace(/\\\$/g, '$')

  const tail = value.slice(dollarIndex)
  const match = tail.match(/((?<!\\)\${?([A-Za-z0-9_]+)(?::-([^}\\]*))?}?)/)
  if (!match) return value.replace(/\\\$/g, '$')

  const [token, , name, fallback] = match
  const replacement = environment[name] || fallback || parsed[name] || ''
  const nextValue = value.replace(token, replacement)
  if (nextValue === value) throw new Error('cyclic variable expansion')
  return interpolateEnvValue(nextValue, environment, parsed, depth + 1)
}

function expandEnvValues(parsed, baseEnvironment, lineNumbers, warnings) {
  const expanded = {}
  let expansionFailed = false

  for (const [key, value] of Object.entries(parsed)) {
    try {
      const sourceValue = Object.hasOwn(baseEnvironment, key)
        ? baseEnvironment[key]
        : value
      const expandedValue = interpolateEnvValue(String(sourceValue ?? ''), baseEnvironment, parsed)
      expanded[key] = expandedValue
      // dotenv-expand mutates parsed values in insertion order, so later
      // references must observe the already-expanded value of earlier keys.
      parsed[key] = expandedValue
    } catch {
      // Next.js rejects the whole env file when expansion fails. Discard all
      // values from this file too, otherwise valid-looking sibling values
      // could produce a false READY result.
      expansionFailed = true
      warnings.push({ line: lineNumbers[key], reason: 'cyclic variable expansion' })
    }
  }

  return expansionFailed ? {} : expanded
}

/**
 * Parse the small dotenv subset used by this project without mutating
 * process.env. Parse diagnostics contain line numbers only, never values.
 */
export function parseEnvFile(contents, baseEnvironment = {}) {
  const parsedValues = {}
  const lineNumbers = {}
  const warnings = []
  const lines = contents.replace(/^\uFEFF/, '').split(/\r?\n/)

  for (const [index, sourceLine] of lines.entries()) {
    const lineNumber = index + 1
    const line = sourceLine.trim()
    if (!line || line.startsWith('#')) continue

    const match = sourceLine.match(DOTENV_LINE_PATTERN)
    if (!match) {
      warnings.push({ line: lineNumber, reason: 'unsupported syntax' })
      continue
    }

    const [, key, rawValue = ''] = match
    let value = rawValue.trim()
    const quote = value[0]
    value = value.replace(/^(['"`])([\s\S]*)\1$/, '$2')
    if (quote === '"') value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r')

    if (Object.hasOwn(parsedValues, key)) {
      warnings.push({ line: lineNumber, reason: 'duplicate variable' })
    }
    parsedValues[key] = value
    lineNumbers[key] = lineNumber
  }

  return {
    values: expandEnvValues(parsedValues, baseEnvironment, lineNumbers, warnings),
    warnings,
  }
}

/**
 * Pure production-readiness validation. Keep this result aligned with
 * inspectSebReadiness in lib/seb.ts; the parity test guards against drift.
 */
export function inspectSebDeploymentReadiness(environment, releaseRegistry = {}) {
  const sessionSecretReady = (environment.SEB_SESSION_SECRET?.trim().length ?? 0) >= 32
  const configKeyReady = validHex(environment.SEB_CONFIG_KEY) !== null
  const configRevision = validConfigRevision(environment.SEB_CONFIG_REVISION)
  const browserExamKeys = parseBrowserExamKeyRegistry(
    environment.SEB_BROWSER_EXAM_KEY_REGISTRY,
    configRevision,
  )
  const {
    configRevisionReady,
    releaseRegistryReady,
    browserExamKeyRegistryReady,
    browserExamKeyCoverageReady,
  } = inspectReleaseRegistryBinding(releaseRegistry, configRevision, browserExamKeys)
  const browserExamKeyCount = browserExamKeys?.length ?? 0

  const siteUrlRaw = environment.NEXT_PUBLIC_SITE_URL
  const siteUrlValue = siteUrlRaw?.trim()
  const siteUrl = parseHttpUrl(siteUrlValue)
  const siteUrlReady = siteUrl !== null
    && siteUrl.protocol === 'https:'
    && siteUrl.username === ''
    && siteUrl.password === ''
    && siteUrl.pathname === '/'
    && siteUrl.search === ''
    && siteUrl.hash === ''
    && siteUrlRaw === siteUrl.origin

  const configUrlValue = environment.NEXT_PUBLIC_SEB_CONFIG_URL?.trim()
  const configUrl = parseHttpUrl(configUrlValue)
  const configFileStatus = !configUrlValue
    ? 'manual'
    : configUrl
      && configUrl.protocol === 'https:'
      && configUrl.username === ''
      && configUrl.password === ''
      && configUrl.pathname.toLowerCase().endsWith('.seb')
        ? 'ready'
        : 'invalid'

  const appReadiness = {
    publishReady: sessionSecretReady
      && configKeyReady
      && configRevisionReady
      && releaseRegistryReady
      && browserExamKeyRegistryReady
      && browserExamKeyCoverageReady
      && browserExamKeyCount > 0
      && siteUrlReady,
    sessionSecretReady,
    configKeyReady,
    configRevisionReady,
    releaseRegistryReady,
    browserExamKeyRegistryReady,
    browserExamKeyCoverageReady,
    browserExamKeyCount,
    siteUrlReady,
    configFileStatus,
  }

  const checks = [
    sessionSecretReady
      ? { status: 'pass', field: 'SEB_SESSION_SECRET', message: 'มีความยาวอย่างน้อย 32 ตัวอักษร' }
      : { status: 'blocker', field: 'SEB_SESSION_SECRET', message: 'ต้องตั้งค่าอย่างน้อย 32 ตัวอักษร' },
    configKeyReady
      ? { status: 'pass', field: 'SEB_CONFIG_KEY', message: 'เป็น SHA-256 hex 64 ตัวอักษร' }
      : { status: 'blocker', field: 'SEB_CONFIG_KEY', message: 'ต้องเป็น SHA-256 hex 64 ตัวอักษร' },
    configRevisionReady
      ? { status: 'pass', field: 'SEB_CONFIG_REVISION', message: 'revision id อยู่ใน release registry' }
      : { status: 'blocker', field: 'SEB_CONFIG_REVISION', message: 'ต้องตรงกับ candidate/active revision ใน SEB release registry' },
    browserExamKeyRegistryReady && browserExamKeyCount > 0
      ? {
          status: 'pass',
          field: 'SEB_BROWSER_EXAM_KEY_REGISTRY',
          message: `พบ BEK ที่ผูก platform/version/build ${browserExamKeyCount} รายการ`,
        }
      : {
          status: 'blocker',
          field: 'SEB_BROWSER_EXAM_KEY_REGISTRY',
          message: 'ต้องเป็น JSON schema 1 ที่ revision ตรงและมี BEK แบบ 64 hex ต่อ build',
        },
    releaseRegistryReady && browserExamKeyCoverageReady
      ? {
          status: 'pass',
          field: 'SEB release coverage',
          message: 'policy/build อนุมัติและมี BEK ครบทุก exact build',
        }
      : {
          status: 'blocker',
          field: 'SEB release coverage',
          message: 'ยังต้องยืนยัน policy/build หรือเพิ่ม BEK ให้ครบ release registry',
        },
    siteUrlReady
      ? { status: 'pass', field: 'NEXT_PUBLIC_SITE_URL', message: 'เป็น HTTPS origin ที่ถูกต้อง' }
      : {
          status: 'blocker',
          field: 'NEXT_PUBLIC_SITE_URL',
          message: 'ต้องเป็น canonical HTTPS origin ไม่มี credential, / ท้าย, path, query หรือ fragment',
        },
    configFileStatus === 'ready'
      ? { status: 'pass', field: 'NEXT_PUBLIC_SEB_CONFIG_URL', message: 'เป็น HTTPS URL ที่ลงท้ายด้วย .seb' }
      : configFileStatus === 'manual'
        ? {
            status: 'warning',
            field: 'NEXT_PUBLIC_SEB_CONFIG_URL',
            message: 'ไม่ได้ตั้งค่า จึงต้องแจกไฟล์ .seb ด้วยวิธีอื่น',
          }
        : {
            status: 'blocker',
            field: 'NEXT_PUBLIC_SEB_CONFIG_URL',
            message: 'หากตั้งค่า ต้องเป็น HTTPS URL ที่ path ลงท้ายด้วย .seb',
          },
  ]

  return {
    ready: checks.every(check => check.status !== 'blocker'),
    appReadiness,
    checks,
  }
}

/** Inspect only permission metadata; no file content or secret is returned. */
export function inspectEnvFilePermission({ exists, mode, platform, readError = false }) {
  if (readError) {
    return {
      status: 'blocker',
      field: '.env.local permissions',
      message: 'อ่านหรือตรวจ metadata ของไฟล์ไม่ได้',
    }
  }
  if (!exists) {
    return {
      status: 'warning',
      field: '.env.local permissions',
      message: 'ไม่พบไฟล์ จึงตรวจ permission ไม่ได้ (ยังใช้ environment ของ process ได้)',
    }
  }
  if (platform === 'win32') {
    return {
      status: 'warning',
      field: '.env.local permissions',
      message: 'ข้ามการตรวจ POSIX permission บน Windows',
    }
  }

  if ((mode & 0o077) !== 0) {
    return {
      status: 'blocker',
      field: '.env.local permissions',
      message: 'ไฟล์เปิดสิทธิ์ให้ group/other; จำกัดเป็น owner-only เช่น chmod 600 .env.local',
    }
  }
  if ((mode & 0o100) !== 0) {
    return {
      status: 'warning',
      field: '.env.local permissions',
      message: 'ไฟล์มี owner execute bit ซึ่งไม่จำเป็น',
    }
  }
  return {
    status: 'pass',
    field: '.env.local permissions',
    message: 'เป็น owner-only บน POSIX',
  }
}

export function formatSebReadinessReport(checks) {
  const labels = { pass: 'PASS', blocker: 'BLOCKER', warning: 'WARNING' }
  const lines = [
    'SEB production readiness (pre-deploy, read-only)',
    'ตรวจเฉพาะ environment และ permission; ไม่เรียก network หรือฐานข้อมูล',
    '',
  ]

  for (const check of checks) {
    lines.push(`[${labels[check.status]}] ${check.field}: ${check.message}`)
  }

  const blockers = checks.filter(check => check.status === 'blocker').length
  const warnings = checks.filter(check => check.status === 'warning').length
  const passed = checks.filter(check => check.status === 'pass').length
  lines.push('', `Summary: ${passed} passed, ${blockers} blocker(s), ${warnings} warning(s).`)
  lines.push(blockers === 0 ? 'READY for deployment checks.' : 'NOT READY: resolve every blocker before deployment.')
  return lines.join('\n')
}
