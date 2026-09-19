const DEPLOYMENT_TIERS = new Set(['local', 'staging', 'production'])

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

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
  return url !== null && /^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname)
}

/**
 * Central, value-redacting contract for local, staging, and production.
 * It never returns configured URLs or credentials, so callers may safely
 * include failed field names in build and startup errors.
 */
export function inspectDeploymentEnvironment(environment) {
  const explicitTier = clean(environment.KORKRU_DEPLOYMENT_ENV)
  const vercelTier = clean(environment.VERCEL_ENV)
  const explicitTierValid = explicitTier === '' || DEPLOYMENT_TIERS.has(explicitTier)

  let tier = 'unknown'
  if (explicitTierValid && explicitTier !== '') tier = explicitTier
  else if (explicitTier === '' && vercelTier === '') tier = 'local'
  else if (explicitTier === '' && vercelTier === 'production') tier = 'production'

  const checks = []

  if (!explicitTierValid) {
    checks.push({
      status: 'blocker',
      field: 'KORKRU_DEPLOYMENT_ENV',
      message: 'ต้องเป็น local, staging หรือ production เท่านั้น',
    })
  } else if (tier === 'unknown') {
    checks.push({
      status: 'blocker',
      field: 'KORKRU_DEPLOYMENT_ENV',
      message: 'Vercel Preview ต้องระบุ staging อย่างชัดเจนก่อนเริ่มแอป',
    })
  } else {
    checks.push({
      status: explicitTier === '' ? 'warning' : 'pass',
      field: 'KORKRU_DEPLOYMENT_ENV',
      message: explicitTier === ''
        ? `อนุมานเป็น ${tier}; deployment ใหม่ควรตั้งค่าให้ชัดเจน`
        : `ระบุ ${tier} ชัดเจน`,
    })
  }

  if (tier === 'local') {
    if (vercelTier !== '') {
      checks.push({
        status: 'blocker',
        field: 'VERCEL_ENV',
        message: 'local ห้ามทำงานบน Vercel deployment',
      })
    }
  }

  if (tier === 'production') {
    if (vercelTier !== 'production') {
      checks.push({
        status: 'blocker',
        field: 'VERCEL_ENV',
        message: 'production ต้องทำงานบน Vercel production deployment เท่านั้น',
      })
    }
  }

  if (tier === 'staging') {
    checks.push(vercelTier === 'preview'
      ? { status: 'pass', field: 'VERCEL_ENV', message: 'เป็น Preview deployment' }
      : { status: 'blocker', field: 'VERCEL_ENV', message: 'staging ต้องเป็น Vercel Preview เท่านั้น' })

    checks.push(clean(environment.EXAM_QA_ENVIRONMENT) === 'staging'
      ? { status: 'pass', field: 'EXAM_QA_ENVIRONMENT', message: 'ระบุ staging ตรงกับ deployment' }
      : { status: 'blocker', field: 'EXAM_QA_ENVIRONMENT', message: 'ต้องเป็น staging ให้ตรงกับ deployment' })

    const stagingSite = parseCanonicalHttpsOrigin(clean(environment.NEXT_PUBLIC_SITE_URL))
    const productionSite = parseCanonicalHttpsOrigin(clean(environment.EXAM_QA_PRODUCTION_SITE_URL))
    checks.push(stagingSite !== null && productionSite !== null && stagingSite.origin !== productionSite.origin
      ? { status: 'pass', field: 'site isolation', message: 'Staging และ Production เป็น HTTPS origin คนละแห่ง' }
      : { status: 'blocker', field: 'site isolation', message: 'ต้องระบุ HTTPS origins ที่ถูกต้องและไม่ซ้ำกัน' })

    const stagingSupabase = parseCanonicalHttpsOrigin(clean(environment.NEXT_PUBLIC_SUPABASE_URL))
    const productionSupabase = parseCanonicalHttpsOrigin(clean(environment.EXAM_QA_PRODUCTION_SUPABASE_URL))
    checks.push(
      isSupabaseProjectOrigin(stagingSupabase)
      && isSupabaseProjectOrigin(productionSupabase)
      && stagingSupabase.origin !== productionSupabase.origin
        ? { status: 'pass', field: 'Supabase isolation', message: 'Staging และ Production เป็น Supabase project คนละแห่ง' }
        : { status: 'blocker', field: 'Supabase isolation', message: 'ต้องระบุ Supabase projects ที่ถูกต้องและไม่ซ้ำกัน' },
    )

    checks.push(clean(environment.NEXT_PUBLIC_SUPABASE_ANON_KEY).length >= 20
      ? { status: 'pass', field: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', message: 'มีค่า Staging ที่ไม่ว่าง' }
      : { status: 'blocker', field: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', message: 'ยังไม่มี Staging anon key' })

    checks.push(clean(environment.SUPABASE_SERVICE_ROLE_KEY).length >= 20
      ? { status: 'pass', field: 'SUPABASE_SERVICE_ROLE_KEY', message: 'มีค่า Staging ที่ไม่ว่าง' }
      : { status: 'blocker', field: 'SUPABASE_SERVICE_ROLE_KEY', message: 'ยังไม่มี Staging service-role key' })
  }

  return {
    tier,
    ready: checks.every(check => check.status !== 'blocker'),
    checks,
  }
}

export function assertDeploymentEnvironment(environment) {
  const result = inspectDeploymentEnvironment(environment)
  if (!result.ready) {
    const fields = result.checks
      .filter(check => check.status === 'blocker')
      .map(check => check.field)
      .join(', ')
    throw new Error(`KorKru deployment guard blocked startup (${fields}). No configured values were logged.`)
  }
  return result
}
