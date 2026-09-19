import { inspectDeploymentEnvironment } from '../lib/deployment-environment.mjs'

const EXPECTED_BUCKETS = new Set([
  'question-images',
  'work-images',
  'submission-files',
  'classroom-post-files',
  'math-work-artifacts',
  'ioc-signatures',
])

const EXPECTED_CRON_JOBS = new Set([
  'homeroom-weekly-digest',
  'exam-proctor-retention-daily',
  'exam-android-approval-retention-daily',
])

const EXPECTED_STEP_PATHS = [
  'supabase/schema.sql',
  'supabase/bootstrap/010_question_images_prerequisite.sql',
  'supabase/migrations',
  'supabase/bootstrap/900_disable_staging_cron.sql',
  'supabase/bootstrap/manifest.json',
  'supabase/seed.sql',
]

function projectRefFromSupabaseOrigin(value) {
  try {
    const url = new URL(value)
    const match = /^([a-z0-9-]+)\.supabase\.co$/i.exec(url.hostname)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

function databaseUrlMatchesProject(databaseUrlValue, stagingRef, productionRef) {
  if (!databaseUrlValue || databaseUrlValue !== databaseUrlValue.trim()) return false
  try {
    const url = new URL(databaseUrlValue)
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) return false
    if (!url.password || url.pathname !== '/postgres' || !stagingRef || !productionRef) return false

    const directRef = /^db\.([a-z0-9-]+)\.supabase\.co$/i.exec(url.hostname)?.[1] ?? null
    const pooledRef = /^postgres\.([a-z0-9-]+)$/i.exec(decodeURIComponent(url.username))?.[1] ?? null
    const targetRef = directRef ?? pooledRef
    return targetRef === stagingRef && targetRef !== productionRef
  } catch {
    return false
  }
}

function sameSet(actual, expected) {
  return actual.length === expected.size && actual.every(value => expected.has(value))
}

export function inspectStagingBootstrapReadiness(environment, manifest, fileInventory) {
  const deployment = inspectDeploymentEnvironment(environment)
  const checks = [...deployment.checks]
  if (deployment.tier !== 'staging') checks.push({
    status: 'blocker',
    field: 'bootstrap deployment target',
    message: 'fresh-project bootstrap อนุญาตเฉพาะ Staging ที่ระบุชัดเจน',
  })

  const stagingRef = projectRefFromSupabaseOrigin(environment.NEXT_PUBLIC_SUPABASE_URL)
  const productionRef = projectRefFromSupabaseOrigin(environment.EXAM_QA_PRODUCTION_SUPABASE_URL)
  checks.push(databaseUrlMatchesProject(
    environment.EXAM_QA_STAGING_DATABASE_URL,
    stagingRef,
    productionRef,
  )
    ? { status: 'pass', field: 'database target', message: 'database URL ตรงกับ Staging project และไม่ใช่ Production' }
    : { status: 'blocker', field: 'database target', message: 'database URL ต้องตรงกับ Staging project ที่ตรวจ isolation แล้ว' })

  const steps = Array.isArray(manifest?.orderedSteps) ? manifest.orderedSteps : []
  const stepPaths = steps.map(step => step?.path).filter(path => typeof path === 'string')
  const requiredBuckets = Array.isArray(manifest?.storage?.requiredBuckets)
    ? manifest.storage.requiredBuckets.map(bucket => bucket?.id).filter(id => typeof id === 'string')
    : []
  const retiredBuckets = Array.isArray(manifest?.storage?.retiredBuckets)
    ? manifest.storage.retiredBuckets
    : []
  const cronJobs = Array.isArray(manifest?.cron?.jobs) ? manifest.cron.jobs : []

  const manifestReady = manifest?.version === 1
    && manifest?.freshProjectOnly === true
    && JSON.stringify(stepPaths) === JSON.stringify(EXPECTED_STEP_PATHS)
    && sameSet(requiredBuckets, EXPECTED_BUCKETS)
    && retiredBuckets.some(bucket => (
      bucket?.id === 'classroom-post-images'
      && bucket?.removeWith === 'storage-api'
      && bucket?.mustBeEmpty === true
    ))
    && manifest?.cron?.policy === 'disabled'
    && sameSet(cronJobs, EXPECTED_CRON_JOBS)
    && manifest?.seed?.policy === 'synthetic-only'
    && manifest?.seed?.copyProductionRows === false
    && manifest?.seed?.copyProductionStorage === false

  checks.push(manifestReady
    ? { status: 'pass', field: 'bootstrap manifest', message: 'ลำดับ schema, migrations, Storage, cron และ seed ครบ' }
    : { status: 'blocker', field: 'bootstrap manifest', message: 'manifest ไม่ตรงกับสัญญา fresh-project bootstrap' })

  const missingFiles = EXPECTED_STEP_PATHS.filter(path => fileInventory[path] !== true)
  checks.push(missingFiles.length === 0 && fileInventory.migrationStartsAt002 === true
    ? { status: 'pass', field: 'bootstrap files', message: 'ไฟล์ครบและ migration ledger เริ่มที่ 002 ตามที่คาด' }
    : { status: 'blocker', field: 'bootstrap files', message: 'ไฟล์ไม่ครบหรือ migration ledger เปลี่ยนจาก baseline ที่ตรวจไว้' })

  return {
    ready: checks.every(check => check.status !== 'blocker'),
    checks,
  }
}

export function formatStagingBootstrapReport(checks) {
  const labels = { pass: 'PASS', blocker: 'BLOCKER', warning: 'WARNING' }
  const lines = [
    'Staging bootstrap readiness (read-only)',
    'ไม่เรียก network, ไม่แก้ database และไม่แสดง URL, project ref หรือ secret',
    '',
  ]
  for (const check of checks) lines.push(`[${labels[check.status]}] ${check.field}: ${check.message}`)
  const blockers = checks.filter(check => check.status === 'blocker').length
  const warnings = checks.filter(check => check.status === 'warning').length
  const passed = checks.filter(check => check.status === 'pass').length
  lines.push('', `Summary: ${passed} passed, ${blockers} blocker(s), ${warnings} warning(s).`)
  lines.push(blockers === 0
    ? 'READY for phase 2C bootstrap against the explicit Staging target.'
    : 'NOT READY: do not run schema, migration, seed, or Storage mutation commands.')
  return lines.join('\n')
}
