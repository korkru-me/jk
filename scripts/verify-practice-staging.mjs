// Authenticated self-practice integration gate for the isolated Korkru Staging
// project. The runner creates only synthetic rows and always attempts cleanup.
// It never prints API keys, passwords, tokens, or answer payloads.
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parseEnvFile } from './check-seb-readiness-core.mjs'

const OFFICIAL_SITE_ORIGIN = 'https://staging.korkru.com'
const OFFICIAL_PROJECT_REF = 'dyuxkrzeveknqgtuzpbh'
const CONFIRMATION = 'practice-staging-synthetic'
const args = new Set(process.argv.slice(2))
const keepForBrowser = args.has('--keep-for-browser')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function successful(result, message) {
  if (result.error) throw new Error(`${message}: ${result.error.code ?? 'request_failed'}`)
  return result.data
}

function loadEnvironment() {
  const parsed = parseEnvFile(
    readFileSync(new URL('../.env.qa.local', import.meta.url), 'utf8'),
    process.env,
  )
  assert(parsed.warnings.length === 0, 'QA environment file could not be parsed')
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => typeof value === 'string' && value !== ''),
  )
  return { ...parsed.values, ...inherited }
}

function assertExactStaging(environment) {
  assert(args.has('--execute'), 'Missing --execute')
  assert(args.has(`--confirm=${CONFIRMATION}`), 'Missing exact synthetic confirmation')
  assert(environment.EXAM_QA_ENVIRONMENT === 'staging', 'QA environment is not Staging')
  assert(environment.KORKRU_DEPLOYMENT_ENV === 'staging', 'Deployment is not Staging')
  assert(environment.VERCEL_ENV === 'preview', 'Deployment is not Vercel Preview')
  assert(environment.NEXT_PUBLIC_SITE_URL === OFFICIAL_SITE_ORIGIN, 'Unexpected Staging origin')
  assert(environment.NEXT_PUBLIC_SITE_URL !== environment.EXAM_QA_PRODUCTION_SITE_URL,
    'Staging and Production site origins must differ')
  const stagingUrl = new URL(environment.NEXT_PUBLIC_SUPABASE_URL)
  const productionUrl = new URL(environment.EXAM_QA_PRODUCTION_SUPABASE_URL)
  assert(stagingUrl.protocol === 'https:', 'Staging Supabase must use HTTPS')
  assert(stagingUrl.hostname === `${OFFICIAL_PROJECT_REF}.supabase.co`,
    'Unexpected Staging Supabase project')
  assert(stagingUrl.hostname !== productionUrl.hostname,
    'Staging and Production Supabase projects must differ')
  assert((environment.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').length >= 20,
    'Missing Staging anonymous key')
  assert((environment.SUPABASE_SERVICE_ROLE_KEY ?? '').length >= 20,
    'Missing Staging secret key')
}

const environment = loadEnvironment()
assertExactStaging(environment)

const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}
const admin = createClient(
  environment.NEXT_PUBLIC_SUPABASE_URL,
  environment.SUPABASE_SERVICE_ROLE_KEY,
  options,
)
const anonymous = createClient(
  environment.NEXT_PUBLIC_SUPABASE_URL,
  environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  options,
)

const runId = randomUUID()
const runLabel = runId.replaceAll('-', '').slice(0, 12)
const createdAccounts = []
const questionIds = []
let classroomId = null
let secondClassroomId = null
let libraryId = null
let verified = false
let deferredManifestPath = null

async function createAccount(role, label) {
  const email = `practice-qa-${runLabel}-${label}@qa.staging.korkru.com`
  const password = `Qa!${randomUUID()}aA9`
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Practice QA ${label} ${runLabel}`, qa_run: runId },
  })
  assert(!created.error && created.data.user, `Could not create synthetic ${label}`)
  const account = {
    id: created.data.user.id,
    label,
    email,
    password,
    orgIds: [],
    membershipVerified: false,
    client: createClient(
      environment.NEXT_PUBLIC_SUPABASE_URL,
      environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      options,
    ),
  }
  createdAccounts.push(account)

  const memberships = await admin
    .from('organization_members')
    .select('org_id, org_role')
    .eq('user_id', account.id)
  const rows = successful(memberships, `Could not read synthetic ${label} membership`)
  assert(rows.length === 1 && rows[0].org_role === 'owner',
    `Unexpected synthetic ${label} organization membership`)
  account.orgIds = rows.map(row => row.org_id)
  account.membershipVerified = true

  const profile = await admin
    .from('users')
    .update({
      role,
      status: 'active',
      full_name: `Practice QA ${label} ${runLabel}`,
      survey_role: role,
      instructor_type: role === 'teacher' ? 'teacher' : null,
    })
    .eq('id', account.id)
    .select('id')
  assert(successful(profile, `Could not configure synthetic ${label}`).length === 1,
    `Synthetic ${label} profile was not updated`)

  const login = await account.client.auth.signInWithPassword({ email, password })
  assert(!login.error && login.data.user?.id === account.id,
    `Could not authenticate synthetic ${label}`)
  return account
}

async function insertQuestions(ownerId, orgId) {
  for (let start = 1; start <= 1000; start += 100) {
    const rows = Array.from({ length: Math.min(100, 1001 - start) }, (_, offset) => {
      const number = start + offset
      const id = randomUUID()
      questionIds.push(id)
      const electricity = number % 2 === 0
      return {
        id,
        org_id: orgId,
        created_by: ownerId,
        visibility: 'private',
        title: `Practice QA ${runLabel} โจทย์ ${number}`,
        question_text: `<p>โจทย์สังเคราะห์ ${number} ตอบ 1</p>`,
        question_type: 'written',
        difficulty: 'medium',
        subject: 'ฟิสิกส์',
        tags: electricity
          ? ['สอวน. ค่าย 1', 'ไฟฟ้า']
          : ['สอวน. ค่าย 1', 'นิวตัน'],
        is_random: false,
        variables: [],
        logic_rules: [],
        answer_parts: null,
        answer_formula: '1',
        answer_unit: null,
        answer_tolerance: 0.01,
        mcq_options: null,
        extra_data: {},
        solution_text: '<p>คำตอบสังเคราะห์ 1</p>',
        solution_image_urls: [],
        image_urls: [],
        requires_work_image: false,
        team_edit_allowed: true,
        is_research_snapshot: false,
      }
    })
    successful(await admin.from('questions').insert(rows),
      `Could not insert synthetic questions ${start}-${start + rows.length - 1}`)
  }
}

async function cleanup() {
  let clean = true
  for (const id of [classroomId, secondClassroomId].filter(Boolean)) {
    const removedClassroom = await admin.from('classrooms').delete().eq('id', id)
    if (removedClassroom.error) clean = false
  }
  for (let start = 0; start < questionIds.length; start += 100) {
    const removedQuestions = await admin
      .from('questions')
      .delete()
      .in('id', questionIds.slice(start, start + 100))
    if (removedQuestions.error) clean = false
  }
  for (const account of createdAccounts.toReversed()) {
    await account.client.auth.signOut().catch(() => undefined)
    if (!account.membershipVerified) {
      clean = false
      continue
    }
    for (const orgId of account.orgIds) {
      const members = await admin
        .from('organization_members')
        .select('user_id, org_role')
        .eq('org_id', orgId)
      if (members.error || members.data.length !== 1
        || members.data[0].user_id !== account.id
        || members.data[0].org_role !== 'owner') {
        clean = false
        continue
      }
      if ((await admin.from('organizations').delete().eq('id', orgId)).error) clean = false
    }
    if ((await admin.auth.admin.deleteUser(account.id)).error) clean = false
  }
  if (libraryId) {
    const remaining = await admin
      .from('practice_libraries')
      .select('id')
      .eq('id', libraryId)
    if (remaining.error || remaining.data.length !== 0) clean = false
  }
  return clean
}

try {
  const owner = await createAccount('teacher', 'owner')
  const coAdmin = await createAccount('teacher', 'co-admin')
  const coManage = await createAccount('teacher', 'co-manage')
  const coView = await createAccount('teacher', 'co-view')
  const studentA = await createAccount('student', 'student-a')
  const studentB = await createAccount('student', 'student-b')
  const outsider = await createAccount('student', 'outsider')
  const foreignTeacher = await createAccount('teacher', 'foreign-teacher')
  const ownerOrgId = owner.orgIds[0]

  classroomId = randomUUID()
  successful(await admin.from('classrooms').insert({
    id: classroomId,
    org_id: ownerOrgId,
    teacher_id: owner.id,
    name: `Practice QA ${runLabel}`,
    description: 'Synthetic Staging UAT only',
    class_code: `P${runLabel.slice(0, 5).toUpperCase()}`,
    status: 'active',
    classroom_type: 'subject',
  }), 'Could not create synthetic classroom')
  secondClassroomId = randomUUID()
  successful(await admin.from('classrooms').insert({
    id: secondClassroomId,
    org_id: ownerOrgId,
    teacher_id: owner.id,
    name: `Practice QA second room ${runLabel}`,
    description: 'Synthetic Staging UAT only',
    class_code: `Q${runLabel.slice(0, 5).toUpperCase()}`,
    status: 'active',
    classroom_type: 'subject',
  }), 'Could not create second synthetic classroom')
  successful(await admin.from('classroom_co_teachers').insert([
    { classroom_id: classroomId, user_id: coAdmin.id, permission: 'admin', invited_by: owner.id },
    { classroom_id: classroomId, user_id: coManage.id, permission: 'manage', invited_by: owner.id },
    { classroom_id: classroomId, user_id: coView.id, permission: 'view', invited_by: owner.id },
  ]), 'Could not attach synthetic co-teachers')
  successful(await admin.from('classroom_students').insert([
    { classroom_id: classroomId, student_id: studentA.id, roster_order: 2 },
    { classroom_id: classroomId, student_id: studentB.id, roster_order: 1 },
  ]), 'Could not attach synthetic students')
  successful(await admin.from('student_profiles').upsert([
    { student_id: studentA.id, class_number: 8 },
    { student_id: studentB.id, class_number: 3 },
  ]), 'Could not configure synthetic student profiles')

  await insertQuestions(owner.id, ownerOrgId)
  const createdLibrary = await owner.client.rpc('create_practice_libraries_for_classrooms', {
    p_org_id: ownerOrgId,
    p_classroom_ids: [classroomId, secondClassroomId],
    p_title: `Practice QA ${runLabel} 1,000 questions`,
    p_description: 'Synthetic Staging UAT only',
    p_reveal_answer_key: false,
    p_access_code: 'SYNTHETIC-QA',
    p_calculator_enabled: true,
    p_scratchpad_enabled: true,
    p_shuffle_questions: false,
    p_shuffle_options: true,
    p_question_ids: questionIds,
    p_publish: true,
  })
  libraryId = successful(createdLibrary, 'Could not create published practice library')
  assert(typeof libraryId === 'string', 'Practice library id was not returned')
  const createdRooms = successful(await owner.client.from('practice_libraries')
    .select('id, classroom_id, access_code, calculator_enabled, scratchpad_enabled, shuffle_questions, shuffle_options')
    .in('classroom_id', [classroomId, secondClassroomId]), 'Could not read created room settings')
  assert(createdRooms.length === 2 && createdRooms.some(row => row.id === libraryId
    && row.classroom_id === classroomId), 'Multi-room creation did not return the primary library')
  assert(createdRooms.every(row => row.access_code === 'SYNTHETIC-QA'
    && row.calculator_enabled === true && row.scratchpad_enabled === true
    && row.shuffle_questions === false && row.shuffle_options === true),
  'Created practice settings were not persisted in both rooms')
  for (const row of createdRooms) {
    const memberships = await owner.client.from('practice_library_questions')
      .select('question_id', { count: 'exact', head: true }).eq('library_id', row.id)
    assert(!memberships.error && memberships.count === questionIds.length,
      'Multi-room creation did not preserve every question in both rooms')
  }
  const compatibilityDraft = successful(await owner.client.rpc('create_practice_libraries_for_classrooms', {
    p_org_id: ownerOrgId, p_classroom_ids: [classroomId],
    p_title: `Practice QA compatibility ${runLabel}`, p_description: null,
    p_reveal_answer_key: false, p_access_code: 'KEEP-QA',
    p_calculator_enabled: true, p_scratchpad_enabled: false,
    p_shuffle_questions: true, p_shuffle_options: false,
    p_question_ids: [questionIds[0]], p_publish: false,
  }), 'Could not create compatibility draft')
  const oldEditorCount = successful(await coManage.client.rpc('update_practice_library_draft', {
    p_library_id: compatibilityDraft, p_title: `Practice QA previous editor ${runLabel}`,
    p_description: null, p_reveal_answer_key: true, p_question_ids: [questionIds[0]],
  }), 'Previous editor could not save the compatibility draft')
  assert(Number(oldEditorCount) === 1, 'Previous editor membership count was incorrect')
  const oldEditorSettings = successful(await owner.client.from('practice_libraries')
    .select('access_code, calculator_enabled, scratchpad_enabled, shuffle_questions, shuffle_options')
    .eq('id', compatibilityDraft).single(), 'Could not read compatibility draft settings')
  assert(oldEditorSettings.access_code === 'KEEP-QA' && oldEditorSettings.calculator_enabled === true
    && oldEditorSettings.scratchpad_enabled === false && oldEditorSettings.shuffle_questions === true
    && oldEditorSettings.shuffle_options === false, 'Previous editor overwrote new settings')
  const deniedOldEditor = await coView.client.rpc('update_practice_library_draft', {
    p_library_id: compatibilityDraft, p_title: 'Forbidden QA', p_description: null,
    p_reveal_answer_key: false, p_question_ids: [questionIds[0]],
  })
  assert(deniedOldEditor.error?.code === '42501', 'View-only previous editor access was not denied')

  const anonymousRead = await anonymous.from('practice_libraries').select('id').eq('id', libraryId)
  assert(anonymousRead.error?.code === '42501', 'Anonymous practice read was not denied')
  const outsiderRead = successful(await outsider.client
    .from('practice_libraries').select('id').eq('id', libraryId),
  'Outsider library read failed unexpectedly')
  assert(outsiderRead.length === 0, 'Outsider could see the practice library')
  const studentRead = successful(await studentA.client
    .from('practice_libraries').select('id, status').eq('id', libraryId),
  'Roster student library read failed')
  assert(studentRead.length === 1 && studentRead[0].status === 'published',
    'Roster student could not see the published practice library')

  // The classroom page reads safe metadata through the actor's session and
  // counts memberships in PostgREST, without loading question/answer payloads.
  for (const account of [owner, coAdmin, coManage, coView, studentA, studentB, outsider, foreignTeacher]) {
    const studentView = [studentA, studentB, outsider].includes(account)
    let listQuery = account.client.from('practice_libraries')
      .select('id, title, status, practice_library_questions(count)')
      .eq('classroom_id', classroomId)
    if (studentView) listQuery = listQuery.eq('status', 'published')
    const list = successful(await listQuery.order('updated_at', { ascending: false })
      .order('id', { ascending: false }).range(0, 999), 'Classroom practice metadata read failed')
    const expected = [outsider, foreignTeacher].includes(account) ? 0 : studentView ? 1 : 2
    assert(list.length === expected, 'Classroom list crossed an actor/status boundary')
    assert(list.every(row => Object.keys(row).every(key =>
      ['id', 'title', 'status', 'practice_library_questions'].includes(key))),
    'Classroom list included fields outside the metadata allowlist')
    if (list.length) {
      assert(list.find(row => row.id === libraryId)?.practice_library_questions[0]?.count === 1000,
        'Classroom list lost memberships in its aggregate count')
    }
  }
  const anonymousList = await anonymous.from('practice_libraries')
    .select('id, title, status, practice_library_questions(count)').eq('classroom_id', classroomId)
  assert(anonymousList.error || anonymousList.data.length === 0, 'Anonymous classroom list was readable')

  const startedAt = process.hrtime.bigint()
  const search = await admin.rpc('search_practice_library_questions', {
    p_actor_id: studentA.id,
    p_library_id: libraryId,
    p_terms: ['โจทย์'],
    p_tags: ['สอวน. ค่าย 1', 'ไฟฟ้า'],
    p_limit: 24,
    p_offset: 0,
  })
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
  const searchRows = successful(search, 'Student practice search failed')
  assert(searchRows.length === 24, 'Student practice search was not page-bounded')
  assert(searchRows.every(row => Number(row.total_count) === 500),
    'Student practice search total was not exact')
  assert(searchRows.every(row => row.tags.includes('สอวน. ค่าย 1') && row.tags.includes('ไฟฟ้า')),
    'Student practice search did not preserve tag AND semantics')
  const payloadBytes = Buffer.byteLength(JSON.stringify(searchRows), 'utf8')
  assert(payloadBytes < 64 * 1024, 'Student practice search payload exceeded 64 KiB')
  assert(elapsedMs < 5000, 'Student practice search exceeded the 5 second UAT budget')

  const firstQuestionId = searchRows[0].question_id
  const sameKey = randomUUID()
  const nextKey = randomUUID()
  const firstAttempt = successful(await admin.rpc('record_practice_answer_attempt', {
    p_actor_id: studentA.id,
    p_library_id: libraryId,
    p_question_id: firstQuestionId,
    p_idempotency_key: sameKey,
  }), 'Could not record first practice attempt')[0]
  const retryAttempt = successful(await admin.rpc('record_practice_answer_attempt', {
    p_actor_id: studentA.id,
    p_library_id: libraryId,
    p_question_id: firstQuestionId,
    p_idempotency_key: sameKey,
  }), 'Could not retry practice attempt')[0]
  const nextAttempt = successful(await admin.rpc('record_practice_answer_attempt', {
    p_actor_id: studentA.id,
    p_library_id: libraryId,
    p_question_id: firstQuestionId,
    p_idempotency_key: nextKey,
  }), 'Could not record second logical practice attempt')[0]
  assert(firstAttempt.created === true && retryAttempt.created === false
    && nextAttempt.created === true, 'Practice attempt idempotency failed')
  successful(await admin.rpc('record_practice_answer_attempt', {
    p_actor_id: studentB.id,
    p_library_id: libraryId,
    p_question_id: firstQuestionId,
    p_idempotency_key: randomUUID(),
  }), 'Could not record second student practice attempt')

  const ownAttempts = successful(await studentA.client
    .from('practice_answer_attempts').select('question_id').eq('library_id', libraryId),
  'Student own progress read failed')
  const otherAttempts = successful(await studentB.client
    .from('practice_answer_attempts').select('question_id').eq('library_id', libraryId),
  'Second student own progress read failed')
  const outsideAttempts = successful(await outsider.client
    .from('practice_answer_attempts').select('question_id').eq('library_id', libraryId),
  'Outsider progress read failed unexpectedly')
  assert(ownAttempts.length === 2 && otherAttempts.length === 1 && outsideAttempts.length === 0,
    'Student progress isolation failed')
  const directWrite = await studentA.client.from('practice_answer_attempts').insert({
    library_id: libraryId,
    student_id: studentA.id,
    question_id: firstQuestionId,
    idempotency_key: randomUUID(),
  })
  assert(directWrite.error?.code === '42501', 'Student direct attempt write was not denied')

  for (const manager of [owner, coAdmin, coManage]) {
    const overview = successful(await admin.rpc('get_practice_library_student_progress', {
      p_actor_id: manager.id,
      p_library_id: libraryId,
    }), `Progress overview failed for ${manager.label}`)
    assert(overview.length === 2
      && overview.every(row => !('answer' in row) && !('is_correct' in row) && !('score' in row)),
    `Unsafe or incomplete progress overview for ${manager.label}`)
  }
  const viewOnly = await admin.rpc('get_practice_library_student_progress', {
    p_actor_id: coView.id,
    p_library_id: libraryId,
  })
  assert(viewOnly.error?.code === '42501', 'View-only co-teacher could read roster progress')
  const foreignProgress = await admin.rpc('get_practice_library_student_progress', {
    p_actor_id: foreignTeacher.id,
    p_library_id: libraryId,
  })
  assert(foreignProgress.error?.code === '42501', 'Foreign teacher could read roster progress')
  const outsideSearch = await admin.rpc('search_practice_library_questions', {
    p_actor_id: outsider.id,
    p_library_id: libraryId,
    p_terms: [],
    p_tags: [],
    p_limit: 24,
    p_offset: 0,
  })
  assert(outsideSearch.error?.code === '42501', 'Outsider could search the practice library')

  const detail = successful(await admin.rpc('get_practice_student_question_progress', {
    p_actor_id: owner.id,
    p_library_id: libraryId,
    p_student_id: studentA.id,
    p_query: '',
    p_limit: 50,
    p_offset: 0,
  }), 'Teacher student-detail progress failed')
  const attempted = detail.find(row => row.question_id === firstQuestionId)
  assert(attempted && Number(attempted.attempt_count) === 2
    && !('checked_at' in attempted) && !('answer' in attempted)
    && !('is_correct' in attempted) && !('score' in attempted),
  'Teacher detail exposed unsafe data or returned the wrong count')

  if (args.has('--personal-exercises')) {
    const exerciseId = randomUUID()
    const members = questionIds.slice(0, 3)
    const actor = { p_actor_id: studentA.id, p_library_id: libraryId }
    const create = { ...actor, p_id: exerciseId, p_title: 'Synthetic private exercise', p_question_ids: members }
    successful(await admin.rpc('create_student_practice_exercise', create), 'Personal exercise creation failed')
    successful(await admin.rpc('create_student_practice_exercise', create), 'Personal exercise retry failed')
    const groups = successful(await admin.rpc('list_student_practice_exercises', actor), 'Personal exercise list failed')
    assert(groups.length === 1 && groups[0].revision === 1 && groups[0].question_ids.length === 3,
      'Personal exercise creation was duplicated or lost members')
    const peerGroups = successful(await admin.rpc('list_student_practice_exercises', {
      ...actor, p_actor_id: studentB.id,
    }), 'Peer personal exercise list failed')
    assert(peerGroups.length === 0, 'Personal group leaked to a classmate')
    const page = successful(await admin.rpc('get_student_practice_exercise_questions', {
      ...actor, p_exercise_id: exerciseId, p_limit: 2, p_offset: 0,
    }), 'Personal exercise pagination failed')
    assert(page.length === 2 && Number(page[0].total_count) === 3, 'Personal exercise pagination/count differs')
    const peerPage = await admin.rpc('get_student_practice_exercise_questions', {
      ...actor, p_actor_id: studentB.id, p_exercise_id: exerciseId, p_limit: 2, p_offset: 0,
    })
    assert(peerPage.error?.code === '42501', 'A peer could open another student group')
    const outsiderGroup = await admin.rpc('create_student_practice_exercise', {
      ...create, p_actor_id: outsider.id, p_id: randomUUID(),
    })
    assert(outsiderGroup.error?.code === '42501', 'An outsider could create a personal exercise')
    const edit = { ...actor, p_id: exerciseId, p_title: 'Synthetic revised exercise',
      p_question_ids: members.slice(0, 2), p_expected_revision: 1 }
    assert(successful(await admin.rpc('update_student_practice_exercise', edit), 'Exercise update failed') === 2,
      'Exercise revision did not advance')
    assert(successful(await admin.rpc('update_student_practice_exercise', edit), 'Exercise update retry failed') === 2,
      'Idempotent update advanced revision')
    const stale = await admin.rpc('update_student_practice_exercise', { ...edit, p_title: 'Stale update' })
    assert(stale.error?.code === 'PT409', 'A stale edit overwrote the current exercise')
    const pin = { ...actor, p_question_id: firstQuestionId, p_pinned: true }
    successful(await admin.rpc('set_student_practice_review_pin', pin), 'Review pin failed')
    successful(await admin.rpc('set_student_practice_review_pin', pin), 'Review pin retry failed')
    const pins = successful(await admin.rpc('list_student_practice_review_pins', actor), 'Review pin list failed')
    assert(pins.length === 1 && pins[0].question_id === firstQuestionId, 'Review pin was duplicated')
    const pinnedQuestions = successful(await admin.rpc('search_student_practice_review_questions', {
      ...actor, p_terms: [], p_tags: [], p_limit: 24, p_offset: 0,
    }), 'Pinned question search failed')
    assert(pinnedQuestions.length === 1 && pinnedQuestions[0].question_id === firstQuestionId,
      'Pinned question search returned another scope')
    const peerPins = successful(await admin.rpc('list_student_practice_review_pins', {
      ...actor, p_actor_id: studentB.id,
    }), 'Peer pin list failed')
    assert(peerPins.length === 0, 'Review pins leaked to a classmate')
    const direct = await studentA.client.from('student_practice_exercises').select('id')
    assert(direct.error?.code === '42501' || direct.data?.length === 0, 'Browser bypassed the server-only table boundary')
    const spoof = await studentB.client.rpc('list_student_practice_exercises', actor)
    assert(spoof.error?.code === '42501', 'Browser could spoof the student on a privileged RPC')
    successful(await admin.rpc('set_student_practice_review_pin', { ...pin, p_pinned: false }), 'Unpin failed')
    assert(successful(await admin.rpc('list_student_practice_review_pins', actor), 'Unpin verification failed').length === 0,
      'Unpin did not persist')
    const roomLibraries = successful(await admin.from('practice_libraries').select('id').eq('classroom_id', classroomId),
      'Could not load synthetic room work')
    const workIds = roomLibraries.map(row => `practice:${row.id}`).toReversed()
    successful(await admin.rpc('reorder_classroom_work', {
      p_actor_id: owner.id, p_classroom_id: classroomId, p_work_ids: workIds,
    }), 'Practice ordering failed')
    const ordered = successful(await admin.from('practice_libraries').select('id,display_order').eq('classroom_id', classroomId),
      'Practice order verification failed')
    assert(ordered.every(row => row.display_order === workIds.indexOf(`practice:${row.id}`) + 1),
      'Practice order was not persisted')
    const forbiddenOrder = await admin.rpc('reorder_classroom_work', {
      p_actor_id: outsider.id, p_classroom_id: classroomId, p_work_ids: workIds,
    })
    assert(forbiddenOrder.error?.code === '42501', 'An outsider could reorder classroom work')
  }

  const frozenMembership = await owner.client
    .from('practice_library_questions')
    .delete()
    .eq('library_id', libraryId)
    .eq('question_id', firstQuestionId)
    .select('question_id')
  assert(!frozenMembership.error && frozenMembership.data.length === 0,
    'Published practice membership was not frozen')

  if (!keepForBrowser) {
    const closed = successful(await owner.client
      .from('practice_libraries')
      .update({ status: 'closed' })
      .eq('id', libraryId)
      .select('status'),
    'Could not close the published practice library')
    assert(closed.length === 1 && closed[0].status === 'closed',
      'Practice library did not close')
    const searchAfterClose = await admin.rpc('search_practice_library_questions', {
      p_actor_id: studentA.id,
      p_library_id: libraryId,
      p_terms: [],
      p_tags: [],
      p_limit: 24,
      p_offset: 0,
    })
    assert(searchAfterClose.error?.code === '42501', 'Closed library remained searchable')
  }

  verified = true
  if (keepForBrowser) {
    deferredManifestPath = `/private/tmp/korkru-practice-staging-${runLabel}.json`
    writeFileSync(deferredManifestPath, JSON.stringify({
      version: 1,
      target: OFFICIAL_SITE_ORIGIN,
      projectRef: OFFICIAL_PROJECT_REF,
      runId,
      runLabel,
      classroomId,
      secondClassroomId,
      libraryId,
      questionIds,
      accounts: createdAccounts.map(account => ({
        id: account.id,
        label: account.label,
        email: account.email,
        password: account.password,
        orgIds: account.orgIds,
        membershipVerified: account.membershipVerified,
      })),
    }), { encoding: 'utf8', mode: 0o600 })
  }
  console.log(JSON.stringify({
    status: 'PASS',
    environment: 'Korkru Staging',
    syntheticAccounts: createdAccounts.length,
    questions: questionIds.length,
    matchingQuestions: 500,
    requestDatabaseCalls: 1,
    returnedRows: searchRows.length,
    payloadBytes,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    checks: [
      'authenticated role matrix',
      'classroom metadata list, exact counts, role/status isolation and safe projection',
      'multi-classroom creation with 1,000 questions and persisted settings',
      'previous editor compatibility preserves settings and permissions',
      'tag AND plus pagination',
      'idempotent append-only progress',
      'student progress isolation',
      'teacher-safe progress DTO',
      'published membership freeze',
      ...(args.has('--personal-exercises') ? ['private exercise create/edit/pagination and stale-write protection',
        'private review pin/search/unpin', 'peer/outsider/browser-spoof denial', 'persisted practice order and authorization'] : []),
      ...(!keepForBrowser ? ['closed-library denial'] : []),
    ],
  }))
} catch (error) {
  console.log(JSON.stringify({
    status: 'FAIL',
    message: error instanceof Error ? error.message : 'Unknown Staging integration failure',
  }))
} finally {
  if (verified && keepForBrowser && deferredManifestPath) {
    console.log(JSON.stringify({
      cleanup: 'DEFERRED_FOR_BROWSER_UAT',
      manifestPath: deferredManifestPath,
      syntheticAccounts: createdAccounts.length,
      syntheticQuestions: questionIds.length,
    }))
    process.exitCode = 0
  } else {
    const cleanupComplete = await cleanup()
    console.log(JSON.stringify({
      cleanup: cleanupComplete ? 'PASS' : 'FAIL',
      syntheticAccounts: createdAccounts.length,
      syntheticQuestions: questionIds.length,
    }))
    process.exitCode = verified && cleanupComplete ? 0 : 1
  }
}
