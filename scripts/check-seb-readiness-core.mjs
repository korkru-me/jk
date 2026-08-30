const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i

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
export function inspectSebDeploymentReadiness(environment) {
  const sessionSecretReady = (environment.SEB_SESSION_SECRET?.trim().length ?? 0) >= 32
  const configKeyReady = validHex(environment.SEB_CONFIG_KEY) !== null

  const browserExamKeyTokens = (environment.SEB_BROWSER_EXAM_KEYS ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean)
  const validBrowserExamKeys = browserExamKeyTokens
    .map(key => validHex(key))
    .filter(key => key !== null)
  const browserExamKeyCount = new Set(validBrowserExamKeys).size
  const invalidBrowserExamKeyCount = browserExamKeyTokens.length - validBrowserExamKeys.length

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
      && browserExamKeyCount > 0
      && siteUrlReady,
    sessionSecretReady,
    configKeyReady,
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
    browserExamKeyCount > 0
      ? {
          status: 'pass',
          field: 'SEB_BROWSER_EXAM_KEYS',
          message: `พบ BEK ที่ถูกต้องและไม่ซ้ำ ${browserExamKeyCount} ค่า`,
        }
      : {
          status: 'blocker',
          field: 'SEB_BROWSER_EXAM_KEYS',
          message: 'ต้องมี BEK แบบ SHA-256 hex 64 ตัวอักษรอย่างน้อยหนึ่งค่า',
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

  if (invalidBrowserExamKeyCount > 0) {
    checks.push({
      status: 'warning',
      field: 'SEB_BROWSER_EXAM_KEYS',
      message: `ข้าม BEK ที่รูปแบบไม่ถูกต้อง ${invalidBrowserExamKeyCount} ค่า`,
    })
  }

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
