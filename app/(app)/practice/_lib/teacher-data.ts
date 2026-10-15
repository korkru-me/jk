import 'server-only'

import type { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  fetchAllRows, fetchRowsInChunks,
} from '@/lib/supabase/fetch-all-rows'
import { withQuestionPoints, type BankQuestion } from '@/lib/question-bank'
import {
  practiceQuestionSupport,
  type PracticeQuestionShape,
} from '@/lib/practice-question'
import {
  PRACTICE_LIBRARY_COLUMNS,
  GET_PRACTICE_LIBRARY_QUESTIONS_FOR_MANAGER_RPC,
  canManagePracticeLibrary,
  type PracticeClassroomAccess,
  type PracticeLibraryRow,
} from '@/lib/practice-library-contracts'
import type { Question } from '@/lib/types'
import type {
  ClassroomCoTeacherPermission,
  PracticeClassroomOption,
} from './teacher-contract'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type PracticeBankRow = Pick<
  Question,
  | 'created_by'
  | 'id'
  | 'title'
  | 'question_text'
  | 'difficulty'
  | 'question_type'
  | 'subject'
  | 'tags'
  | 'answer_formula'
  | 'answer_parts'
  | 'mcq_options'
  | 'extra_data'
  | 'variables'
  | 'logic_rules'
>

const PRACTICE_BANK_FIELDS = 'created_by, id, title, question_text, difficulty, question_type, subject, tags, answer_formula, answer_parts, mcq_options, extra_data, variables, logic_rules'

export type ManagedPracticeQuestionRow = PracticeQuestionShape & {
  id: string
  question_id: string
  position: number
  created_by: string
  org_id: string | null
  title: string
  question_text: string
  difficulty: Question['difficulty']
  subject: string | null
  tags: string[] | null
  answer_unit: string | null
  answer_tolerance: number
  image_urls: string[]
  is_random: boolean
  is_research_snapshot: boolean
}

export interface PracticeClassroomAccessRow {
  id: string
  org_id: string
  teacher_id: string
  name: string
  description: string | null
  status: string
  classroom_type: string
  access: PracticeClassroomAccess
}

export interface TeacherPracticeLibraryListItem {
  library: PracticeLibraryRow
  classroomName: string
  access: PracticeClassroomAccess
  canManage: boolean
  questionCount: number
}

type ClassroomRow = Omit<PracticeClassroomAccessRow, 'access'>

type CoTeacherRow = {
  classroom_id: string
  permission: ClassroomCoTeacherPermission
  classrooms: ClassroomRow | ClassroomRow[] | null
}

function oneClassroom(value: CoTeacherRow['classrooms']): ClassroomRow | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function accessForPermission(permission: ClassroomCoTeacherPermission): PracticeClassroomAccess {
  if (permission === 'admin') return 'co_teacher_admin'
  if (permission === 'manage') return 'co_teacher_manage'
  if (permission === 'view') return 'co_teacher_view'
  return 'none'
}

function safePracticeBankQuestion(row: PracticeBankRow): BankQuestion {
  const shaped = withQuestionPoints(row)
  // The support decision needs the answer formula, but no answer-bearing field
  // crosses the server-component boundary into the picker.
  const {
    answer_formula: _answerFormula,
    logic_rules: _logicRules,
    created_by: _createdBy,
    ...safe
  } = shaped
  return safe
}

function isSupportedPracticeQuestion(row: PracticeQuestionShape): boolean {
  return practiceQuestionSupport(row).supported
}

/**
 * Reads only the exact membership of one managed library. The database RPC is
 * service-only and rechecks the actor's owner/admin/manage relationship before
 * returning answer-bearing shapes, so owner-private questions never become a
 * general co-teacher bank read.
 */
export async function loadManagedPracticeQuestionRows(
  userId: string,
  libraryId: string,
): Promise<{ rows: ManagedPracticeQuestionRow[]; error: string | null }> {
  try {
    const admin = createAdminClient()
    const result = await admin.rpc(GET_PRACTICE_LIBRARY_QUESTIONS_FOR_MANAGER_RPC, {
      p_actor_id: userId,
      p_library_id: libraryId,
    })
    if (result.error || !Array.isArray(result.data)) {
      return { rows: [], error: 'โหลดรายละเอียดโจทย์เดิมไม่สำเร็จ' }
    }
    const rows: ManagedPracticeQuestionRow[] = []
    for (const raw of result.data as Array<Record<string, unknown>>) {
      if (typeof raw.question_id !== 'string'
        || !Number.isInteger(raw.position)
        || typeof raw.created_by !== 'string'
        || (raw.org_id !== null && typeof raw.org_id !== 'string')
        || typeof raw.title !== 'string'
        || typeof raw.question_text !== 'string'
        || typeof raw.question_type !== 'string'
        || !['easy', 'medium', 'hard', 'analytical'].includes(String(raw.difficulty))
        || (raw.subject !== null && typeof raw.subject !== 'string')
        || !Array.isArray(raw.variables)
        || !Array.isArray(raw.logic_rules)
        || typeof raw.answer_formula !== 'string'
        || (raw.answer_unit !== null && typeof raw.answer_unit !== 'string')
        || typeof raw.answer_tolerance !== 'number'
        || (raw.answer_parts !== null && !Array.isArray(raw.answer_parts))
        || (raw.mcq_options !== null && !Array.isArray(raw.mcq_options))
        || !Array.isArray(raw.tags) || raw.tags.some(tag => typeof tag !== 'string')
        || !Array.isArray(raw.image_urls) || raw.image_urls.some(url => typeof url !== 'string')
        || !raw.extra_data || typeof raw.extra_data !== 'object' || Array.isArray(raw.extra_data)
        || typeof raw.is_random !== 'boolean'
        || raw.is_research_snapshot !== false) {
        return { rows: [], error: 'รูปแบบรายละเอียดโจทย์เดิมไม่ถูกต้อง' }
      }
      rows.push({
        ...raw,
        id: raw.question_id,
      } as unknown as ManagedPracticeQuestionRow)
    }
    rows.sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    return { rows, error: null }
  } catch {
    return { rows: [], error: 'โหลดรายละเอียดโจทย์เดิมไม่สำเร็จ' }
  }
}

export async function loadSupportedPracticeBankQuestions(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<{ questions: BankQuestion[]; error: string | null }> {
  const { rows, error } = await fetchAllRows<PracticeBankRow>((from, to) => supabase
    .from('questions')
    .select(PRACTICE_BANK_FIELDS)
    .eq('created_by', userId)
    .eq('is_research_snapshot', false)
    .neq('visibility', 'pending')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to))
  if (error) return { questions: [], error: 'โหลดคลังโจทย์ไม่สำเร็จ' }
  return {
    questions: rows.filter(isSupportedPracticeQuestion).map(safePracticeBankQuestion),
    error: null,
  }
}

/**
 * The editable bank stays actor-scoped, while stable library references are
 * merged in for display. A co-teacher therefore never receives the owner's
 * whole bank, and answer-bearing fields are stripped before returning.
 */
export async function loadPracticeEditorQuestions(
  supabase: SupabaseServerClient,
  userId: string,
  libraryId: string,
  existingIds: string[],
): Promise<{
  questions: BankQuestion[]
  missingIds: string[]
  unsupportedIds: string[]
  editableQuestionIds: string[]
  error: string | null
}> {
  const bank = await loadSupportedPracticeBankQuestions(supabase, userId)
  if (bank.error || existingIds.length === 0) {
    return {
      ...bank,
      missingIds: existingIds.length === 0 ? [] : existingIds,
      unsupportedIds: [],
      editableQuestionIds: bank.questions.map(question => question.id),
    }
  }

  const bankById = new Map(bank.questions.map(question => [question.id, question]))
  const missingFromBank = existingIds.filter(id => !bankById.has(id))
  if (missingFromBank.length === 0) {
    return {
      questions: bank.questions,
      missingIds: [],
      unsupportedIds: [],
      editableQuestionIds: bank.questions.map(question => question.id),
      error: null,
    }
  }

  const managed = await loadManagedPracticeQuestionRows(userId, libraryId)
  const rows = managed.rows.filter(row => missingFromBank.includes(row.id))
  for (const row of rows) bankById.set(row.id, safePracticeBankQuestion(row))

  const found = new Set(rows.map(row => row.id))
  const missingIds = missingFromBank.filter(id => !found.has(id))
  const unsupportedIds = rows
    .filter(row => !isSupportedPracticeQuestion(row))
    .map(row => row.id)
  return {
    questions: [...bankById.values()],
    missingIds,
    unsupportedIds,
    editableQuestionIds: [...new Set([
      ...bank.questions.map(question => question.id),
      ...rows.filter(row => row.created_by === userId).map(row => row.id),
    ])],
    error: managed.error,
  }
}

/** Source management is checked by the caller; new references still require ordinary question RLS. */
export async function loadPracticeCopyQuestions(
  supabase: SupabaseServerClient,
  userId: string,
  sourceIds: string[],
  initialBank?: Awaited<ReturnType<typeof loadSupportedPracticeBankQuestions>>,
) {
  const bank = initialBank ?? await loadSupportedPracticeBankQuestions(supabase, userId)
  if (bank.error) return { ...bank, missingIds: sourceIds, unsupportedIds: [] as string[] }
  const byId = new Map(bank.questions.map(question => [question.id, question]))
  const unread = sourceIds.filter(id => !byId.has(id))
  const extra = await fetchRowsInChunks<PracticeBankRow, string>(unread, ids => supabase
    .from('questions').select(PRACTICE_BANK_FIELDS).in('id', ids)
    .eq('is_research_snapshot', false).neq('visibility', 'pending'))
  if (extra.error) return { questions: bank.questions, missingIds: unread, unsupportedIds: [] as string[], error: 'โหลดโจทย์ต้นฉบับไม่สำเร็จ กรุณาโหลดหน้าใหม่' }
  const found = new Set([...byId.keys(), ...extra.rows.map(question => question.id)])
  for (const row of extra.rows) if (isSupportedPracticeQuestion(row)) byId.set(row.id, safePracticeBankQuestion(row))
  return {
    questions: [...byId.values()],
    missingIds: sourceIds.filter(id => !found.has(id)),
    unsupportedIds: extra.rows.filter(row => !isSupportedPracticeQuestion(row)).map(row => row.id),
    error: null,
  }
}

export async function authenticatePracticeTeacher(supabase: SupabaseServerClient): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string; unauthenticated?: boolean }
> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'ไม่ได้เข้าสู่ระบบ', unauthenticated: true }

  const { data: profile, error } = await supabase
    .from('users')
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle()
  if (error) return { ok: false, error: 'ตรวจสิทธิ์ผู้ใช้ไม่สำเร็จ' }
  if (profile?.status !== 'active') {
    return { ok: false, error: 'บัญชีนี้ไม่พร้อมใช้งาน' }
  }
  if (profile?.role !== 'teacher' && profile?.role !== 'admin') {
    return { ok: false, error: 'เฉพาะครูเท่านั้นที่จัดการคลังฝึกได้' }
  }
  return { ok: true, userId: user.id }
}

/**
 * Reads the actor's classroom relationship through the session client so RLS
 * remains the first boundary. The caller still applies the pure permission
 * contract before any write.
 */
export async function loadPracticeClassroomAccess(
  supabase: SupabaseServerClient,
  userId: string,
  classroomId: string,
): Promise<PracticeClassroomAccessRow | null> {
  const { data: classroom } = await supabase
    .from('classrooms')
    .select('id, org_id, teacher_id, name, description, status, classroom_type')
    .eq('id', classroomId)
    .maybeSingle()
  if (!classroom) return null

  if (classroom.teacher_id === userId) {
    return { ...(classroom as ClassroomRow), access: 'classroom_owner' }
  }

  const { data: relation } = await supabase
    .from('classroom_co_teachers')
    .select('permission')
    .eq('classroom_id', classroomId)
    .eq('user_id', userId)
    .maybeSingle()

  return {
    ...(classroom as ClassroomRow),
    access: accessForPermission((relation?.permission ?? null) as ClassroomCoTeacherPermission),
  }
}

export async function loadManageablePracticeClassrooms(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<{ classrooms: PracticeClassroomOption[]; error: string | null }> {
  const [{ data: owned, error: ownedError }, { data: coTeaching, error: coError }] = await Promise.all([
    supabase
      .from('classrooms')
      .select('id, org_id, teacher_id, name, description, status, classroom_type')
      .eq('teacher_id', userId)
      .eq('status', 'active')
      .neq('classroom_type', 'homeroom')
      .order('created_at', { ascending: false }),
    supabase
      .from('classroom_co_teachers')
      .select('classroom_id, permission, classrooms(id, org_id, teacher_id, name, description, status, classroom_type)')
      .eq('user_id', userId)
      .in('permission', ['admin', 'manage']),
  ])

  if (ownedError || coError) {
    return { classrooms: [], error: 'โหลดรายการห้องเรียนไม่สำเร็จ' }
  }

  const rows = new Map<string, PracticeClassroomOption>()
  for (const classroom of (owned ?? []) as ClassroomRow[]) {
    rows.set(classroom.id, {
      id: classroom.id,
      orgId: classroom.org_id,
      name: classroom.name,
      description: classroom.description,
    })
  }
  for (const relation of (coTeaching ?? []) as unknown as CoTeacherRow[]) {
    const classroom = oneClassroom(relation.classrooms)
    if (!classroom || classroom.status !== 'active' || classroom.classroom_type === 'homeroom') continue
    if (!canManagePracticeLibrary(accessForPermission(relation.permission))) continue
    rows.set(classroom.id, {
      id: classroom.id,
      orgId: classroom.org_id,
      name: classroom.name,
      description: classroom.description,
    })
  }

  return {
    classrooms: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'th')),
    error: null,
  }
}

export async function loadPracticeLibraryForTeacher(
  supabase: SupabaseServerClient,
  userId: string,
  libraryId: string,
): Promise<{
  library: PracticeLibraryRow
  classroom: PracticeClassroomAccessRow
  canManage: boolean
} | null> {
  const { data: library } = await supabase
    .from('practice_libraries')
    .select(PRACTICE_LIBRARY_COLUMNS.join(', '))
    .eq('id', libraryId)
    .maybeSingle()
  if (!library) return null
  const libraryRow = library as unknown as PracticeLibraryRow

  const classroom = await loadPracticeClassroomAccess(
    supabase,
    userId,
    libraryRow.classroom_id,
  )
  if (!classroom || classroom.org_id !== libraryRow.org_id) return null
  return {
    library: libraryRow,
    classroom,
    canManage: canManagePracticeLibrary(classroom.access),
  }
}

export async function loadPracticeLibraryQuestionIds(
  supabase: SupabaseServerClient,
  libraryId: string,
): Promise<{ ids: string[]; error: string | null }> {
  const { data, error } = await supabase
    .from('practice_library_questions')
    .select('question_id, position')
    .eq('library_id', libraryId)
    .order('position')
  if (error) return { ids: [], error: 'โหลดรายการโจทย์ไม่สำเร็จ' }
  return {
    ids: (data ?? []).map((row: { question_id: string }) => row.question_id),
    error: null,
  }
}

export async function loadTeacherPracticeLibraries(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<{ items: TeacherPracticeLibraryListItem[]; error: string | null }> {
  const { rows, error: libraryError } = await fetchAllRows<PracticeLibraryRow>(async (from, to) => {
    const { data, error } = await supabase
      .from('practice_libraries')
      .select(PRACTICE_LIBRARY_COLUMNS.join(', '))
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
    return { data: data as unknown as PracticeLibraryRow[] | null, error }
  })
  if (libraryError) {
    return { items: [], error: 'โหลดคลังฝึกไม่สำเร็จ' }
  }

  if (rows.length === 0) return { items: [], error: null }
  const classroomIds = [...new Set(rows.map(row => row.classroom_id))]
  const libraryIds = rows.map(row => row.id)
  const [
    { data: classroomRows, error: classroomError },
    { data: coTeacherRows, error: relationError },
    questionResult,
  ] = await Promise.all([
    supabase
      .from('classrooms')
      .select('id, org_id, teacher_id, name, status, classroom_type')
      .in('id', classroomIds),
    supabase
      .from('classroom_co_teachers')
      .select('classroom_id, permission')
      .eq('user_id', userId)
      .in('classroom_id', classroomIds),
    fetchAllRows<{ library_id: string }>((from, to) => supabase
      .from('practice_library_questions')
      .select('library_id')
      .in('library_id', libraryIds)
      .order('library_id')
      .range(from, to)),
  ])
  if (classroomError || relationError || questionResult.error) {
    return { items: [], error: 'โหลดรายละเอียดคลังฝึกไม่สำเร็จ' }
  }

  const classrooms = new Map(
    ((classroomRows ?? []) as ClassroomRow[]).map(classroom => [classroom.id, classroom]),
  )
  const permissionByClassroom = new Map(
    ((coTeacherRows ?? []) as Array<{ classroom_id: string; permission: ClassroomCoTeacherPermission }>)
      .map(relation => [relation.classroom_id, relation.permission]),
  )
  const questionCountByLibrary = new Map<string, number>()
  for (const relation of questionResult.rows) {
    questionCountByLibrary.set(
      relation.library_id,
      (questionCountByLibrary.get(relation.library_id) ?? 0) + 1,
    )
  }

  const items: TeacherPracticeLibraryListItem[] = []
  for (const library of rows) {
    const classroom = classrooms.get(library.classroom_id)
    if (!classroom || classroom.org_id !== library.org_id) continue
    const access: PracticeClassroomAccess = classroom.teacher_id === userId
      ? 'classroom_owner'
      : accessForPermission(permissionByClassroom.get(classroom.id) ?? null)
    if (access === 'none') continue
    items.push({
      library,
      classroomName: classroom.name,
      access,
      canManage: canManagePracticeLibrary(access),
      questionCount: questionCountByLibrary.get(library.id) ?? 0,
    })
  }

  return { items, error: null }
}
