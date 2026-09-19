function parseCanonicalHttpsOrigin(value) {
  if (!value || value !== value.trim()) return null
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:'
      || url.username !== ''
      || url.password !== ''
      || url.pathname !== '/'
      || url.search !== ''
      || url.hash !== ''
      || value !== url.origin
    ) return null
    return url
  } catch {
    return null
  }
}

function isSupabaseProjectOrigin(url) {
  return url !== null
    && /^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname)
}

/**
 * Validate isolation before an authenticated exam QA run. The function only
 * compares metadata and never returns configured URLs or credentials.
 */
export function inspectExamStagingReadiness(environment) {
  const qaModeReady = environment.EXAM_QA_ENVIRONMENT?.trim() === 'staging'
  const deploymentTier = environment.VERCEL_ENV?.trim()
  const deploymentTierReady = deploymentTier !== 'production'

  const stagingSite = parseCanonicalHttpsOrigin(environment.NEXT_PUBLIC_SITE_URL)
  const productionSite = parseCanonicalHttpsOrigin(environment.EXAM_QA_PRODUCTION_SITE_URL)
  const siteReady = stagingSite !== null
    && productionSite !== null
    && stagingSite.origin !== productionSite.origin

  const stagingSupabase = parseCanonicalHttpsOrigin(environment.NEXT_PUBLIC_SUPABASE_URL)
  const productionSupabase = parseCanonicalHttpsOrigin(environment.EXAM_QA_PRODUCTION_SUPABASE_URL)
  const supabaseReady = isSupabaseProjectOrigin(stagingSupabase)
    && isSupabaseProjectOrigin(productionSupabase)
    && stagingSupabase.origin !== productionSupabase.origin

  const anonReady = (environment.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim().length ?? 0) >= 20
  const serviceRoleReady = (environment.SUPABASE_SERVICE_ROLE_KEY?.trim().length ?? 0) >= 20

  const checks = [
    qaModeReady
      ? { status: 'pass', field: 'EXAM_QA_ENVIRONMENT', message: 'ระบุ staging ชัดเจน' }
      : { status: 'blocker', field: 'EXAM_QA_ENVIRONMENT', message: 'ต้องเป็น staging ก่อนอนุญาต QA ที่เขียนข้อมูล' },
    deploymentTierReady
      ? {
          status: deploymentTier ? 'pass' : 'warning',
          field: 'VERCEL_ENV',
          message: deploymentTier ? 'ไม่ใช่ production deployment' : 'ไม่ได้ตั้งค่า; local preflight ผ่านได้แต่ deployment ต้องตรวจซ้ำ',
        }
      : { status: 'blocker', field: 'VERCEL_ENV', message: 'ห้ามรัน authenticated exam QA บน production deployment' },
    siteReady
      ? { status: 'pass', field: 'site isolation', message: 'staging และ production เป็น HTTPS origin คนละแห่ง' }
      : { status: 'blocker', field: 'site isolation', message: 'ต้องตั้ง canonical HTTPS staging/production origins ที่ถูกต้องและไม่ซ้ำกัน' },
    supabaseReady
      ? { status: 'pass', field: 'Supabase isolation', message: 'staging และ production เป็น Supabase project คนละแห่ง' }
      : { status: 'blocker', field: 'Supabase isolation', message: 'ต้องระบุ Supabase HTTPS origins ที่ถูกต้องและเป็นคนละ project' },
    anonReady
      ? { status: 'pass', field: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', message: 'มีค่าที่ไม่ว่าง' }
      : { status: 'blocker', field: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', message: 'ยังไม่มี staging anon key' },
    serviceRoleReady
      ? { status: 'pass', field: 'SUPABASE_SERVICE_ROLE_KEY', message: 'มีค่าที่ไม่ว่าง' }
      : { status: 'blocker', field: 'SUPABASE_SERVICE_ROLE_KEY', message: 'ยังไม่มี staging service-role key' },
  ]

  return { ready: checks.every(check => check.status !== 'blocker'), checks }
}

export function formatExamStagingReadinessReport(checks) {
  const labels = { pass: 'PASS', blocker: 'BLOCKER', warning: 'WARNING' }
  const lines = [
    'Exam staging readiness (read-only)',
    'ตรวจเฉพาะ isolation/configuration; ไม่เรียก network และไม่แสดงค่าที่ตั้งไว้',
    '',
  ]
  for (const check of checks) lines.push(`[${labels[check.status]}] ${check.field}: ${check.message}`)
  const blockers = checks.filter(check => check.status === 'blocker').length
  const warnings = checks.filter(check => check.status === 'warning').length
  const passed = checks.filter(check => check.status === 'pass').length
  lines.push('', `Summary: ${passed} passed, ${blockers} blocker(s), ${warnings} warning(s).`)
  lines.push(blockers === 0
    ? 'READY to continue with staging network/data checks.'
    : 'NOT READY: do not create QA accounts, attempts, answers, or uploads yet.')
  return lines.join('\n')
}

