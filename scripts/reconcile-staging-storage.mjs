#!/usr/bin/env node
/**
 * Reconcile the versioned Staging bucket manifest through the Storage API.
 * Read-only by default. --apply is accepted only after every deployment and
 * bootstrap guard passes; configured URLs, project refs, and keys are never
 * printed.
 */
import { access, readFile, readdir } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { parseEnvFile } from './check-seb-readiness-core.mjs'
import { inspectStagingBootstrapReadiness } from './check-staging-bootstrap-core.mjs'

const APPLY = process.argv.includes('--apply')
const ENV_FILE_URL = new URL('../.env.qa.local', import.meta.url)
const MANIFEST_URL = new URL('../supabase/bootstrap/manifest.json', import.meta.url)

async function loadEnvironment() {
  try {
    return parseEnvFile(await readFile(ENV_FILE_URL, 'utf8'), process.env)
  } catch (error) {
    if (error?.code === 'ENOENT') return { values: {}, warnings: [] }
    return { values: {}, warnings: [{ line: 0, reason: 'read failure' }] }
  }
}

const parsed = await loadEnvironment()
const environment = { ...parsed.values, ...process.env }
let manifest = null
try {
  manifest = JSON.parse(await readFile(MANIFEST_URL, 'utf8'))
} catch {
  manifest = null
}

const fileInventory = {}
for (const step of manifest?.orderedSteps ?? []) {
  try {
    await access(new URL(`../${step.path}`, import.meta.url))
    fileInventory[step.path] = true
  } catch {
    fileInventory[step.path] = false
  }
}
try {
  const migrations = (await readdir(new URL('../supabase/migrations', import.meta.url)))
    .filter(name => name.endsWith('.sql'))
    .sort()
  fileInventory.migrationStartsAt002 = migrations[0]?.startsWith('002_') === true
} catch {
  fileInventory.migrationStartsAt002 = false
}

const readiness = inspectStagingBootstrapReadiness(environment, manifest, fileInventory)
const blockers = [
  ...readiness.checks.filter(check => check.status === 'blocker').map(check => check.field),
  ...parsed.warnings.map(() => '.env.qa.local'),
]
if (blockers.length > 0) {
  console.error(`BLOCKED before network access (${[...new Set(blockers)].join(', ')}). No configured values were logged.`)
  process.exit(1)
}

const supabase = createClient(
  environment.NEXT_PUBLIC_SUPABASE_URL,
  environment.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)
const { data: currentBuckets, error: listError } = await supabase.storage.listBuckets()
if (listError) {
  console.error('Storage inventory failed. No configured values were logged.')
  process.exit(1)
}

const currentById = new Map((currentBuckets ?? []).map(bucket => [bucket.id, bucket]))
let changes = 0

for (const expected of manifest.storage.requiredBuckets) {
  const current = currentById.get(expected.id)
  const options = {
    public: expected.public,
    fileSizeLimit: expected.fileSizeLimit,
    allowedMimeTypes: expected.allowedMimeTypes,
  }
  if (!current) {
    changes += 1
    console.log(`[MISSING] ${expected.id}`)
    if (APPLY) {
      const { error } = await supabase.storage.createBucket(expected.id, options)
      if (error) throw new Error(`Storage create failed for ${expected.id}`)
    }
    continue
  }

  const currentMimeTypes = [...(current.allowed_mime_types ?? [])].sort()
  const expectedMimeTypes = [...expected.allowedMimeTypes].sort()
  const differs = current.public !== expected.public
    || Number(current.file_size_limit) !== expected.fileSizeLimit
    || JSON.stringify(currentMimeTypes) !== JSON.stringify(expectedMimeTypes)
  if (differs) {
    changes += 1
    console.log(`[DRIFT] ${expected.id}`)
    if (APPLY) {
      const { error } = await supabase.storage.updateBucket(expected.id, options)
      if (error) throw new Error(`Storage update failed for ${expected.id}`)
    }
  } else {
    console.log(`[OK] ${expected.id}`)
  }
}

for (const retired of manifest.storage.retiredBuckets) {
  if (!currentById.has(retired.id)) {
    console.log(`[RETIRED] ${retired.id}`)
    continue
  }
  const { data: entries, error } = await supabase.storage.from(retired.id).list('', { limit: 1 })
  if (error) throw new Error(`Storage inspection failed for ${retired.id}`)
  if ((entries ?? []).length > 0) {
    console.error(`[BLOCKER] ${retired.id} is not empty; it was not removed.`)
    process.exitCode = 1
    continue
  }
  changes += 1
  console.log(`[REMOVE EMPTY] ${retired.id}`)
  if (APPLY) {
    const { error: deleteError } = await supabase.storage.deleteBucket(retired.id)
    if (deleteError) throw new Error(`Storage removal failed for ${retired.id}`)
  }
}

console.log(APPLY
  ? `Storage reconciliation applied (${changes} change(s)).`
  : `Read-only plan complete (${changes} change(s)); rerun with --apply only in phase 2C.`)
