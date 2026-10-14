// Exact cleanup companion for verify-practice-staging.mjs --keep-for-browser.
// The manifest is local, mode 0600, and contains only synthetic fixture data.
import { readFileSync, unlinkSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parseEnvFile } from './check-seb-readiness-core.mjs'

const OFFICIAL_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_PROJECT_REF = 'dyuxkrzeveknqgtuzpbh'
const CONFIRMATION = 'practice-staging-synthetic-cleanup'
const manifestArgument = process.argv.find(value => value.startsWith('--manifest='))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(process.argv.includes('--execute'), 'Missing --execute')
assert(process.argv.includes(`--confirm=${CONFIRMATION}`), 'Missing exact cleanup confirmation')
assert(manifestArgument, 'Missing --manifest')

const parsed = parseEnvFile(
  readFileSync(new URL('../.env.qa.local', import.meta.url), 'utf8'),
  process.env,
)
assert(parsed.warnings.length === 0, 'QA environment file could not be parsed')
const inherited = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => typeof value === 'string' && value !== ''),
)
const environment = { ...parsed.values, ...inherited }
assert(environment.EXAM_QA_ENVIRONMENT === 'staging', 'QA environment is not Staging')
assert(environment.NEXT_PUBLIC_SITE_URL === OFFICIAL_SITE_ORIGIN, 'Unexpected Staging origin')
assert(new URL(environment.NEXT_PUBLIC_SUPABASE_URL).hostname
  === `${OFFICIAL_PROJECT_REF}.supabase.co`, 'Unexpected Staging Supabase project')
assert(new URL(environment.NEXT_PUBLIC_SUPABASE_URL).hostname
  !== new URL(environment.EXAM_QA_PRODUCTION_SUPABASE_URL).hostname,
'Staging and Production Supabase projects must differ')
assert((environment.SUPABASE_SERVICE_ROLE_KEY ?? '').length >= 20,
  'Missing Staging secret key')

const manifestPath = manifestArgument.slice('--manifest='.length)
assert(manifestPath.startsWith('/private/tmp/korkru-practice-staging-')
  && manifestPath.endsWith('.json'), 'Unexpected cleanup manifest path')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
assert(manifest.version === 1 && manifest.target === OFFICIAL_SITE_ORIGIN
  && manifest.projectRef === OFFICIAL_PROJECT_REF, 'Unexpected cleanup manifest target')
assert(typeof manifest.classroomId === 'string' && typeof manifest.libraryId === 'string',
  'Cleanup manifest is incomplete')
assert(Array.isArray(manifest.questionIds) && manifest.questionIds.length === 1000,
  'Cleanup manifest question set is incomplete')
assert(Array.isArray(manifest.accounts) && manifest.accounts.length === 8,
  'Cleanup manifest account set is incomplete')

const admin = createClient(
  environment.NEXT_PUBLIC_SUPABASE_URL,
  environment.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
)
let clean = true
const failures = []

function fail(step, error = null) {
  clean = false
  failures.push({
    step,
    ...(error ? { code: error.code ?? 'request_failed' } : {}),
  })
}

for (const id of [manifest.classroomId, manifest.secondClassroomId].filter(Boolean)) {
  const removedClassroom = await admin.from('classrooms').delete().eq('id', id)
  if (removedClassroom.error) fail('classroom-delete', removedClassroom.error)
}
for (let start = 0; start < manifest.questionIds.length; start += 100) {
  const removed = await admin.from('questions').delete()
    .in('id', manifest.questionIds.slice(start, start + 100))
  if (removed.error) fail('question-delete', removed.error)
}
for (const account of manifest.accounts.toReversed()) {
  if (!account.membershipVerified || !Array.isArray(account.orgIds)) {
    fail('account-manifest-guard')
    continue
  }
  for (const orgId of account.orgIds) {
    const organization = await admin.from('organizations').select('id').eq('id', orgId)
    if (organization.error) {
      fail('organization-read', organization.error)
      continue
    }
    if (organization.data.length === 0) continue
    const members = await admin.from('organization_members')
      .select('user_id, org_role').eq('org_id', orgId)
    if (members.error || members.data.length !== 1
      || members.data[0].user_id !== account.id
      || members.data[0].org_role !== 'owner') {
      fail('organization-membership-guard', members.error)
      continue
    }
    const removedOrganization = await admin.from('organizations').delete().eq('id', orgId)
    if (removedOrganization.error) fail('organization-delete', removedOrganization.error)
  }
  const existingUser = await admin.auth.admin.getUserById(account.id)
  if (!existingUser.error && existingUser.data.user) {
    const removedUser = await admin.auth.admin.deleteUser(account.id)
    if (removedUser.error) fail('auth-user-delete', removedUser.error)
  } else if (existingUser.error?.code !== 'user_not_found') {
    fail('auth-user-read', existingUser.error)
  }
}
const remainingClassroom = await admin.from('classrooms')
  .select('id').eq('id', manifest.classroomId)
if (remainingClassroom.error || remainingClassroom.data.length !== 0) {
  fail('classroom-verification', remainingClassroom.error)
}
const remainingLibrary = await admin.from('practice_libraries')
  .select('id').eq('id', manifest.libraryId)
if (remainingLibrary.error || remainingLibrary.data.length !== 0) {
  fail('library-verification', remainingLibrary.error)
}
for (let start = 0; start < manifest.questionIds.length; start += 100) {
  const remainingQuestions = await admin.from('questions')
    .select('id', { count: 'exact', head: true })
    .in('id', manifest.questionIds.slice(start, start + 100))
  if (remainingQuestions.error || remainingQuestions.count !== 0) {
    fail('question-verification', remainingQuestions.error)
  }
}

if (clean) unlinkSync(manifestPath)
console.log(JSON.stringify({
  cleanup: clean ? 'PASS' : 'FAIL',
  syntheticAccounts: manifest.accounts.length,
  syntheticQuestions: manifest.questionIds.length,
  manifestRemoved: clean,
  failures,
}))
process.exitCode = clean ? 0 : 1
