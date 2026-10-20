// Bounded setup/verification only. The operator creates/publishes work and
// acknowledges its notice through the actual Staging UI, never this runner.
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { assertStagingEnvironment as assertReminderEnvironment, createStagingFetch } from './verify-assignment-reminders-staging.mjs'

const PROJECT = 'dyuxkrzeveknqgtuzpbh'
const SITE = 'https://staging.korkru.com'
const DATABASE_URL = `https://${PROJECT}.supabase.co`
const KIND = 'assigned-work-notices-staging'
const CONFIRM = '--confirm=assigned-work-notices-staging-synthetic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ASSIGNMENT_COLUMNS = 'id,created_by,org_id,title,type,mode,status,question_ids,secure_browser_mode'
class VerificationError extends Error {}
const check = (condition, label) => { if (!condition) throw new VerificationError(label) }
const must = (result, label) => { if (result.error) throw new VerificationError(`${label}: request_failed`); return result.data }
const log = (status, name, counts = {}) => console.log(JSON.stringify({ status, check: name, ...counts }))
const option = (argv, name) => argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const ownerOf = state => state.accounts.find(row => row.label === 'teacher')
const studentOf = state => state.accounts.find(row => row.label === 'student')
const titleFor = (state, type) => `${state.prefix} ${type}`

export function assertStagingEnvironment(env, argv) {
  check(argv.includes('--execute') && argv.includes(CONFIRM), 'Exact synthetic execution confirmation required')
  assertReminderEnvironment(env, ['--execute', '--confirm=assignment-reminders-staging-synthetic'])
  // The operator must compare the CLI ledger against this deployment's exact
  // project before authorizing fixture writes. This is an attestation, not an
  // automatic migration-list check or a permission to replay migrations.
  check(env.ASSIGNED_WORK_NOTICE_QA_MIGRATION_PARITY_VERIFIED === PROJECT, 'Verified exact Staging migration parity required')
}

export function parseRunMode(argv) {
  const chosen = ['create', 'discover', 'verify', 'cleanup'].filter(mode => argv.includes(`--${mode}-fixture`))
  check(chosen.length === 1, 'Choose exactly one create, discover, verify or cleanup mode')
  const mode = chosen[0]
  check(mode === 'create' || option(argv, 'fixture-file'), 'Exact private fixture file required')
  const rawReads = option(argv, 'expected-read-count')
  const rawAssignments = option(argv, 'expected-assignment-count')
  check(rawReads === undefined || (mode === 'verify' && /^(0|1|2)$/.test(rawReads)), 'Expected read count must be 0, 1 or 2 in verify mode')
  check(rawAssignments === undefined || (['discover', 'verify'].includes(mode) && /^(0|1|2)$/.test(rawAssignments)), 'Expected assignment count must be 0, 1 or 2 in discover or verify mode')
  return { mode, expectedReadCount: rawReads === undefined ? null : Number(rawReads), expectedAssignmentCount: rawAssignments === undefined ? null : Number(rawAssignments) }
}

export function privateFixturePath(raw) {
  check(typeof raw === 'string' && isAbsolute(raw), 'Fixture path must be absolute')
  const path = resolve(raw)
  check(realpathSync(dirname(path)) === '/private/tmp', 'Fixture must remain directly in private temporary storage')
  check(/^korkru-assigned-work-notices-staging-[A-Za-z0-9-]+\.json$/.test(basename(path)), 'Unexpected private fixture filename')
  return path
}

export function validateFixtureManifest(state) {
  check(state && state.version === 1 && state.kind === KIND && state.projectRef === PROJECT && state.target === SITE && UUID.test(state.run), 'Unexpected fixture target')
  check(state.prefix === `Assigned Work QA ${state.run}`, 'Unexpected fixture prefix')
  check(Array.isArray(state.accounts) && state.accounts.length <= 2, 'Invalid fixture account bounds')
  check(new Set(state.accounts.map(row => row.id)).size === state.accounts.length && new Set(state.accounts.map(row => row.label)).size === state.accounts.length, 'Duplicate fixture identities')
  for (const row of state.accounts) check(UUID.test(row.id) && ['teacher', 'student'].includes(row.label) && row.role === row.label
    && row.email === `assigned-work-qa-${state.run}-${row.label}@qa.staging.korkru.com`
    && typeof row.password === 'string' && row.password.length >= 16 && typeof row.membershipVerified === 'boolean'
    && Array.isArray(row.orgIds) && row.orgIds.length <= 1 && row.orgIds.every(id => UUID.test(id))
    && (!row.membershipVerified || row.orgIds.length === 1), 'Invalid synthetic identity provenance')
  for (const name of ['classroomId', 'questionId']) check(state[name] === null || UUID.test(state[name]), 'Invalid fixture resource ID')
  check(!(state.classroomId || state.questionId) || ownerOf(state), 'Fixture resource owner missing')
  check(Array.isArray(state.assignments) && state.assignments.length <= 2, 'Invalid fixture assignment bounds')
  check(new Set(state.assignments.map(row => row.id)).size === state.assignments.length && new Set(state.assignments.map(row => row.type)).size === state.assignments.length, 'Duplicate fixture assignments')
  for (const row of state.assignments) check(UUID.test(row.id) && ['exercise', 'exam'].includes(row.type) && row.title === titleFor(state, row.type), 'Invalid fixture assignment provenance')
  check(state.assignments.length === 0 || (state.classroomId && state.questionId && ownerOf(state)), 'Assignment dependencies missing')
  return state
}

export function validateCanonicalAssignments(state, rows, links, submissions) {
  validateFixtureManifest(state)
  const owner = ownerOf(state)
  check(Array.isArray(rows) && rows.length <= 2 && new Set(rows.map(row => row.id)).size === rows.length
    && new Set(rows.map(row => row.type)).size === rows.length, 'Unexpected canonical assignment count')
  for (const row of rows) check(UUID.test(row.id) && ['exercise', 'exam'].includes(row.type) && row.title === titleFor(state, row.type)
    && row.created_by === owner?.id && owner.orgIds.includes(row.org_id) && row.mode === 'online'
    && ['draft', 'published', 'closed'].includes(row.status) && row.secure_browser_mode === 'browser'
    && Array.isArray(row.question_ids) && row.question_ids.length === 1 && row.question_ids[0] === state.questionId, 'Canonical assignment provenance mismatch')
  check(Array.isArray(links) && links.length === rows.length, 'Canonical assignment links differ from fixture')
  for (const row of rows) {
    const ownLinks = links.filter(link => link.assignment_id === row.id)
    check(ownLinks.length === 1 && ownLinks[0].classroom_id === state.classroomId && ownLinks[0].group_ids === null, 'Canonical assignment audience mismatch')
  }
  check(Array.isArray(submissions) && submissions.length === 0, 'Fixture unexpectedly contains learner attempts; refusing cleanup or success')
  return rows.map(({ id, title, type }) => ({ id, title, type })).sort((a, b) => a.type.localeCompare(b.type))
}

export function verifyNoticeRows(state, rows, expectedReadCount = null) {
  validateFixtureManifest(state)
  check(state.accounts.length === 2 && state.classroomId && state.questionId, 'Complete synthetic fixture required')
  check(Array.isArray(rows) && rows.length === state.assignments.length && new Set(rows.map(row => row.id)).size === rows.length, 'Expected exactly one publication notice per canonical assignment')
  const teacher = ownerOf(state), student = studentOf(state)
  for (const assignment of state.assignments) {
    const notices = rows.filter(row => row.related_assignment_id === assignment.id)
    check(notices.length === 1, 'Missing or duplicate canonical publication notice')
    const row = notices[0]
    check(UUID.test(row.id) && row.type === 'classroom_post' && row.actor_id === teacher.id && row.recipient_id === student.id
      && row.org_id === teacher.orgIds[0] && row.related_classroom_id === state.classroomId && row.link === `/classrooms/${state.classroomId}`
      && typeof row.title === 'string' && row.title.includes(assignment.title) && typeof row.body === 'string' && row.body.length > 0
      && typeof row.is_read === 'boolean', 'Publication notice provenance or content mismatch')
  }
  const read = rows.filter(row => row.is_read).length
  if (expectedReadCount !== null) check(read === expectedReadCount, 'Durable acknowledgement read count mismatch')
  return { assignments: state.assignments.length, notices: rows.length, read, unread: rows.length - read, attempts: 0 }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes('--help')) {
    console.log('Staging only: --execute --confirm=assigned-work-notices-staging-synthetic --create-fixture [--fixture-file=/private/tmp/korkru-assigned-work-notices-staging-<run>.json]')
    console.log('Later: same safety flags plus --discover-fixture, --verify-fixture [--expected-read-count=0|1|2] or --cleanup-fixture, with --fixture-file=<private manifest>. discover/verify allow --expected-assignment-count=0|1|2. --check-config performs no requests. Requires ASSIGNED_WORK_NOTICE_QA_MIGRATION_PARITY_VERIFIED=dyuxkrzeveknqgtuzpbh after live parity check. No env file is loaded by this script.')
    return 0
  }
  let mode, expectedReadCount, expectedAssignmentCount
  try {
    assertStagingEnvironment(env, argv)
    if (argv.includes('--check-config')) { log('PASS', 'local Staging configuration fence; no network or mutations'); return 0 }
    ;({ mode, expectedReadCount, expectedAssignmentCount } = parseRunMode(argv))
  } catch (error) { log('FAIL', 'local execution fence', { message: error instanceof VerificationError ? error.message : 'Invalid configuration' }); return 1 }
  const run = randomUUID()
  let fixturePath
  try { fixturePath = privateFixturePath(option(argv, 'fixture-file') ?? `/private/tmp/korkru-assigned-work-notices-staging-${run}.json`) }
  catch { log('FAIL', 'private fixture path validation'); return 1 }
  const options = { global: { fetch: createStagingFetch() }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  const admin = createClient(DATABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options)
  const userClient = () => createClient(DATABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options)
  let state = { version: 1, kind: KIND, projectRef: PROJECT, target: SITE, run, prefix: `Assigned Work QA ${run}`, accounts: [], classroomId: null, questionId: null, assignments: [] }
  let trusted = false
  const persist = () => {
    const temporary = `${fixturePath}.${randomUUID()}.tmp`
    writeFileSync(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' })
    renameSync(temporary, fixturePath); chmodSync(fixturePath, 0o600)
  }
  async function account(role) {
    const email = `assigned-work-qa-${state.run}-${role}@qa.staging.korkru.com`, password = `Qa1!${randomUUID()}Aa9`
    const result = must(await admin.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { full_name: `${state.prefix} ${role}`, qa_run: state.run, qa_kind: KIND } }), 'Create synthetic identity')
    check(result.user?.id && UUID.test(result.user.id), 'Synthetic account receipt missing')
    const row = { id: result.user.id, label: role, role, email, password, orgIds: [], membershipVerified: false }
    state.accounts.push(row); persist()
    const members = must(await admin.from('organization_members').select('org_id,org_role').eq('user_id', row.id), 'Read synthetic organization')
    check(members.length === 1 && members[0].org_role === 'owner', 'Unexpected synthetic organization membership')
    row.orgIds = members.map(member => member.org_id); row.membershipVerified = true; persist()
    const configured = must(await admin.from('users').update({ role, status: 'active', survey_role: role,
      instructor_type: role === 'teacher' ? 'teacher' : null, full_name: `${state.prefix} ${role}` }).eq('id', row.id).select('id'), 'Configure synthetic profile')
    check(configured.length === 1 && configured[0].id === row.id, 'Synthetic profile receipt missing')
  }
  async function validateOwnedRows() {
    validateFixtureManifest(state)
    for (const account of state.accounts) {
      const result = await admin.auth.admin.getUserById(account.id)
      check(!result.error || result.error.status === 404, 'Synthetic Auth provenance lookup failed')
      if (result.data.user) check(result.data.user.email === account.email && result.data.user.user_metadata?.qa_run === state.run
        && result.data.user.user_metadata?.qa_kind === KIND, 'Synthetic Auth provenance mismatch')
    }
    const owner = ownerOf(state)
    for (const [table, id, ownerColumn, nameColumn, suffix] of [
      ['classrooms', state.classroomId, 'teacher_id', 'name', 'classroom'], ['questions', state.questionId, 'created_by', 'title', 'question'],
    ]) if (id) {
      const rows = must(await admin.from(table).select(`id,${ownerColumn},${nameColumn},org_id`).eq('id', id), 'Read synthetic resource provenance')
      check(rows.every(row => row[ownerColumn] === owner.id && owner.orgIds.includes(row.org_id) && row[nameColumn] === `${state.prefix} ${suffix}`), 'Synthetic resource provenance mismatch')
    }
    if (state.classroomId) {
      const roster = must(await admin.from('classroom_students').select('student_id').eq('classroom_id', state.classroomId), 'Read synthetic roster')
      check(roster.length <= 1 && roster.every(row => row.student_id === studentOf(state)?.id), 'Unexpected synthetic roster member')
    }
  }
  async function canonicalAssignments({ allowDeleted = false } = {}) {
    const owner = ownerOf(state)
    if (!owner || !state.classroomId || !state.questionId) return { rows: [], discovered: [] }
    const rows = must(await admin.from('assignments').select(ASSIGNMENT_COLUMNS).eq('created_by', owner.id).eq('org_id', owner.orgIds[0])
      .in('title', ['exercise', 'exam'].map(type => titleFor(state, type))).limit(3), 'Discover exact synthetic works')
    const ids = [...new Set([...rows.map(row => row.id), ...state.assignments.map(row => row.id)])]
    const [links, submissions, roomLinks] = await Promise.all([
      ids.length ? admin.from('assignment_classrooms').select('assignment_id,classroom_id,group_ids').in('assignment_id', ids) : { data: [], error: null },
      ids.length ? admin.from('submissions').select('id').in('assignment_id', ids).limit(1) : { data: [], error: null },
      admin.from('assignment_classrooms').select('assignment_id').eq('classroom_id', state.classroomId).limit(3),
    ])
    const discovered = validateCanonicalAssignments(state, rows, must(links, 'Read exact work audience'), must(submissions, 'Check no learner attempts'))
    check(must(roomLinks, 'Read exact fixture room links').every(row => rows.some(work => work.id === row.assignment_id)), 'Unexpected work linked to synthetic classroom')
    const missing = state.assignments.filter(old => !discovered.some(row => row.id === old.id && row.type === old.type && row.title === old.title))
    if (allowDeleted && missing.length) {
      const remaining = must(await admin.from('assignments').select('id').in('id', missing.map(row => row.id)), 'Check previously deleted synthetic work')
      check(remaining.length === 0, 'Previously discovered synthetic work changed provenance')
    } else check(missing.length === 0, 'Previously discovered synthetic work changed or disappeared')
    return { rows, discovered }
  }
  async function noticeRows() {
    if (!state.classroomId) return []
    const columns = 'id,org_id,actor_id,recipient_id,type,title,body,link,related_assignment_id,related_classroom_id,is_read'
    const [roomNotices, workNotices] = await Promise.all([
      admin.from('notifications').select(columns).eq('related_classroom_id', state.classroomId).limit(3),
      state.assignments.length ? admin.from('notifications').select(columns).in('related_assignment_id', state.assignments.map(row => row.id)).limit(3) : { data: [], error: null },
    ])
    const rows = [...new Map([...must(roomNotices, 'Read exact room notices'), ...must(workNotices, 'Read exact work notices')].map(row => [row.id, row])).values()]
    check(rows.length <= 2, 'Unexpected notification count in synthetic classroom')
    return rows
  }
  async function recoverPartialAccountMemberships() {
    validateFixtureManifest(state)
    for (const account of state.accounts.filter(row => !row.membershipVerified)) {
      // A failed setup read may follow a successful Auth+personal-org trigger.
      // Recover its receipt only after independently proving this exact Auth
      // identity and exclusive owner membership; never adopt an arbitrary org
      // from a stale/forged manifest or delete a shared organization.
      const lookup = must(await admin.auth.admin.getUserById(account.id), 'Read partial synthetic Auth provenance')
      check(lookup.user?.id === account.id && lookup.user.email === account.email && lookup.user.user_metadata?.qa_run === state.run
        && lookup.user.user_metadata?.qa_kind === KIND, 'Partial synthetic Auth provenance mismatch')
      const memberships = must(await admin.from('organization_members').select('org_id,org_role').eq('user_id', account.id).limit(2), 'Recover synthetic personal organization')
      check(memberships.length === 1 && UUID.test(memberships[0].org_id) && memberships[0].org_role === 'owner', 'Partial synthetic organization ownership mismatch')
      const orgId = memberships[0].org_id
      check(account.orgIds.length === 0 || account.orgIds[0] === orgId, 'Partial synthetic organization receipt changed')
      const members = must(await admin.from('organization_members').select('user_id,org_role').eq('org_id', orgId).limit(2), 'Verify partial organization exclusivity')
      check(members.length === 1 && members[0].user_id === account.id && members[0].org_role === 'owner', 'Refusing partial shared organization cleanup')
      account.orgIds = [orgId]; account.membershipVerified = true; persist()
    }
  }
  async function cleanup() {
    await recoverPartialAccountMemberships()
    await validateOwnedRows()
    const { discovered } = await canonicalAssignments({ allowDeleted: true })
    state.assignments = discovered; persist()
    const rows = await noticeRows(), owner = ownerOf(state), student = studentOf(state)
    check(rows.every(row => row.type === 'classroom_post' && row.actor_id === owner?.id && row.recipient_id === student?.id
      && row.org_id === owner.orgIds[0] && discovered.some(work => work.id === row.related_assignment_id)), 'Refusing unexpected notification cleanup')
    // Revoke logins before deleting synthetic data or identity.
    for (const account of state.accounts) {
      const lookup = await admin.auth.admin.getUserById(account.id)
      check(!lookup.error || lookup.error.status === 404, 'Synthetic cleanup identity lookup failed')
      if (!lookup.data.user) continue
      const client = userClient()
      const login = must(await client.auth.signInWithPassword({ email: account.email, password: account.password }), 'Authenticate exact cleanup identity')
      check(login.user?.id === account.id && login.session?.access_token, 'Synthetic cleanup session mismatch')
      must(await admin.auth.admin.signOut(login.session.access_token, 'global'), 'Revoke synthetic sessions')
      await client.auth.signOut().catch(() => undefined)
    }
    for (const row of rows) must(await admin.from('notifications').delete().eq('id', row.id).eq('actor_id', owner.id).eq('recipient_id', student.id), 'Remove exact synthetic notice')
    for (const row of discovered) must(await admin.from('assignments').delete().eq('id', row.id).eq('created_by', owner.id).eq('title', row.title), 'Remove exact synthetic work')
    state.assignments = []; persist()
    if (state.questionId) must(await admin.from('questions').delete().eq('id', state.questionId).eq('created_by', owner.id).eq('title', `${state.prefix} question`), 'Remove exact synthetic question')
    if (state.classroomId) must(await admin.from('classrooms').delete().eq('id', state.classroomId).eq('teacher_id', owner.id).eq('name', `${state.prefix} classroom`), 'Remove exact synthetic classroom')
    for (const account of [...state.accounts].reverse()) {
      check(account.membershipVerified, 'Synthetic organization ownership was not verified')
      for (const orgId of account.orgIds) {
        const organizations = must(await admin.from('organizations').select('id').eq('id', orgId), 'Read exact cleanup organization')
        if (!organizations.length) continue
        const members = must(await admin.from('organization_members').select('user_id,org_role').eq('org_id', orgId), 'Read exact cleanup members')
        check(members.length === 1 && members[0].user_id === account.id && members[0].org_role === 'owner', 'Refusing shared organization cleanup')
        for (const table of ['assignments', 'classrooms', 'questions']) check(must(await admin.from(table).select('id').eq('org_id', orgId).limit(1), 'Check organization resource scope').length === 0, 'Refusing organization with remaining resources')
        must(await admin.from('organizations').delete().eq('id', orgId), 'Remove synthetic personal organization')
      }
      const lookup = await admin.auth.admin.getUserById(account.id)
      check(!lookup.error || lookup.error.status === 404, 'Synthetic Auth deletion lookup failed')
      if (lookup.data.user) {
        check(lookup.data.user.user_metadata?.qa_run === state.run && lookup.data.user.user_metadata?.qa_kind === KIND && lookup.data.user.email === account.email, 'Auth deletion provenance mismatch')
        must(await admin.auth.admin.deleteUser(account.id), 'Remove synthetic Auth identity')
      }
      const deleted = await admin.auth.admin.getUserById(account.id)
      check(deleted.error?.status === 404 && !deleted.data.user, 'Synthetic Auth cleanup was not confirmed')
      for (const orgId of account.orgIds) check(must(await admin.from('organizations').select('id').eq('id', orgId), 'Verify synthetic organization cleanup').length === 0, 'Synthetic organization cleanup incomplete')
    }
    for (const [table, id] of [['classrooms', state.classroomId], ['questions', state.questionId]]) if (id) check(must(await admin.from(table).select('id').eq('id', id), 'Verify exact resource cleanup').length === 0, 'Synthetic resource cleanup incomplete')
    for (const row of discovered) check(must(await admin.from('assignments').select('id').eq('id', row.id), 'Verify exact work cleanup').length === 0, 'Synthetic work cleanup incomplete')
    if (existsSync(fixturePath)) unlinkSync(fixturePath)
  }
  try {
    if (mode === 'create') {
      check(!existsSync(fixturePath), 'Refusing to replace existing manifest')
      for (const [table, columns] of [
        ['users', 'id,role,status,survey_role,instructor_type'], ['organization_members', 'org_id,user_id,org_role'],
        ['classrooms', 'id,teacher_id,org_id,classroom_type,status'], ['classroom_students', 'classroom_id,student_id'],
        ['questions', 'id,created_by,org_id,question_type'], ['assignments', ASSIGNMENT_COLUMNS],
        ['assignment_classrooms', 'assignment_id,classroom_id,group_ids'], ['notifications', 'id,type,is_read,related_assignment_id,related_classroom_id'],
        ['submissions', 'id,assignment_id,student_id'],
      ]) must(await admin.from(table).select(columns).limit(0), 'Required Staging schema preflight unavailable')
      persist(); trusted = true
      await account('teacher'); await account('student')
      const owner = ownerOf(state)
      state.classroomId = randomUUID(); persist()
      must(await admin.from('classrooms').insert({ id: state.classroomId, teacher_id: owner.id, org_id: owner.orgIds[0],
        name: `${state.prefix} classroom`, description: 'Synthetic assigned-work popup verification only', classroom_type: 'subject', status: 'active',
        class_code: randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase() }), 'Create synthetic classroom')
      must(await admin.from('classroom_students').insert({ classroom_id: state.classroomId, student_id: studentOf(state).id }), 'Create synthetic student roster')
      state.questionId = randomUUID(); persist()
      must(await admin.from('questions').insert({ id: state.questionId, created_by: owner.id, org_id: owner.orgIds[0], visibility: 'private',
        title: `${state.prefix} question`, question_text: '<p>คำถามสมมติ: 1 + 1 เท่ากับเท่าไร</p>', question_type: 'written', variables: [], logic_rules: [],
        answer_formula: '2', answer_tolerance: 0.01, extra_data: {}, requires_work_image: false, team_edit_allowed: true }), 'Create synthetic question')
      await validateOwnedRows()
      const { discovered } = await canonicalAssignments()
      check(discovered.length === 0, 'Synthetic work baseline is not empty')
      verifyNoticeRows(state, await noticeRows(), 0)
      state.teacherHref = `${SITE}/assignments/new?classroom=${state.classroomId}&type=exercise&flow=create`
      state.studentHref = `${SITE}/dashboard`
      state.assignmentTitles = { exercise: titleFor(state, 'exercise'), exam: titleFor(state, 'exam') }
      persist()
      log('PASS', 'two synthetic identities, one room, one roster, one question, zero works/notices/attempts')
      log('DEFERRED_FOR_BROWSER', 'private fixture retained for real UI publication and acknowledgement', { fixturePath })
    } else {
      const stat = lstatSync(fixturePath)
      check(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0 && stat.uid === process.getuid?.() && stat.size <= 64_000, 'Fixture must be a private owned regular file')
      state = validateFixtureManifest(JSON.parse(readFileSync(fixturePath, 'utf8'))); trusted = true
      if (mode === 'cleanup') { await cleanup(); log('PASS', 'exact synthetic fixture cleanup'); return 0 }
      await validateOwnedRows()
      const { rows, discovered } = await canonicalAssignments()
      if (expectedAssignmentCount !== null) check(discovered.length === expectedAssignmentCount, 'Canonical assignment count mismatch')
      if (mode === 'discover') { state.assignments = discovered; persist(); log('PASS', 'canonical UI-created assignments recorded', { assignments: discovered.length }) }
      else {
        check(JSON.stringify(state.assignments) === JSON.stringify(discovered), 'Run discover mode for newly created works before verification')
        check(rows.every(row => row.status === 'published'), 'Synthetic work is not published')
        log('PASS', 'durable publication notices and zero attempts', verifyNoticeRows(state, await noticeRows(), expectedReadCount))
      }
    }
    return 0
  } catch (error) {
    log('FAIL', 'bounded Staging assigned-work fixture', { message: error instanceof VerificationError ? error.message : 'Unexpected verification failure' })
    // Never silently auto-delete evidence after an uncertain network result.
    // The manifest records every successful receipt for a deliberate retry.
    if (trusted) log('CLEANUP_REQUIRED', 'private fixture retained for exact scoped retry', { fixturePath })
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main()
