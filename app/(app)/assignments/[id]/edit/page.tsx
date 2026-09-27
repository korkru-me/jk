import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { fetchBankQuestions, withQuestionPoints, QUESTION_POINT_FIELDS } from '@/lib/question-bank'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { EditAssignmentForm } from '@/components/assignments/edit-assignment-form'
import type { EditableAssignment, EditableAssignmentQuestion } from '@/components/assignments/edit-assignment-form'
import type { CountableQuestion } from '@/lib/question-parts'
import { createAdminClient } from '@/lib/supabase/admin'
import { manageableClassroomIds } from '@/lib/classroom-groups-server'
import { AssignmentGroupTargetsCard } from '@/components/assignments/assignment-group-targets-card'
import type { AssignmentGroupOption, GroupTargets } from '@/components/assignments/group-target-picker'

export const metadata = { title: 'แก้ไขชุดข้อสอบ — KorKru' }

/** One assignment question as read here: what the form lists, plus what its
 *  default คะแนน is counted from. */
type QuestionPointRow = Pick<EditableAssignmentQuestion, 'id' | 'title' | 'question_text'> & CountableQuestion

export default async function EditAssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // No explicit ownership check — RLS (assignments_org_teacher_all /
  // assignments_co_teacher_all) already scopes this; a null result means
  // unauthorized and is handled by notFound() below.
  const assignmentQuery = supabase
    .from('assignments')
    .select('id, title, description, question_ids, question_points, display_max_score, start_at, end_at, duration_minutes, max_attempts, mode, type, score_strategy, retry_scope, questions_per_page, instant_check, instant_check_answer_key, completion_rule, streak_target, streak_question_cap, streak_recycle_pool, passing_type, passing_value, show_results, show_solutions, sections, show_sections, proctoring_enabled, fullscreen_required, block_clipboard, random_question_count, shared_random_seed, exam_watermark_enabled, require_work_image, calculator_enabled, scratchpad_enabled, secure_browser_mode, android_exam_mode')
    .eq('id', id)
    .maybeSingle()

  const [user, { data: assignment }] = await Promise.all([
    getAuthUser(),
    assignmentQuery,
  ])
  if (!user) redirect('/login')

  if (!assignment) notFound()
  const a = assignment as EditableAssignment

  // The bank doubles as the lookup for the questions already in this
  // assignment, so one read serves both the list and the "เพิ่มโจทย์" picker.
  // A question shared by a teammate can be in the assignment without being in
  // this teacher's own bank, so those are still read by id.
  const [bank, { data: questionRows }, { data: startedSubmission }, groupTargeting] = await Promise.all([
    fetchBankQuestions(supabase, user.id),
    supabase
      .from('questions')
      .select(`id, title, question_text, ${QUESTION_POINT_FIELDS}`)
      .in('id', a.question_ids),
    // One row is enough: the question set is frozen into every attempt as it
    // starts, so once anyone has begun, changing it would hand later students
    // a different paper — and a different คะแนนเต็ม — from the same งาน.
    supabase
      .from('submissions')
      .select('id')
      .eq('assignment_id', id)
      .limit(1)
      .maybeSingle(),
    loadGroupTargeting(supabase, id, user.id),
  ])

  // Preserve the assignment's own question order rather than whatever the
  // `in` query happens to return. withQuestionPoints turns each row's
  // structure into the คะแนน it is worth by default, and drops the jsonb it
  // read that from.
  const questionsById = new Map(
    ((questionRows ?? []) as unknown as QuestionPointRow[])
      .map(q => [q.id, withQuestionPoints(q)] as const)
  )
  const questions = a.question_ids
    .map(id => questionsById.get(id))
    .filter((q): q is NonNullable<typeof q> => !!q)

  return (
    <div className="max-w-2xl space-y-6">
      <Link href={`/assignments/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-muted-foreground transition-colors">
        <ChevronLeft className="w-4 h-4" /> กลับไปหน้าชุดข้อสอบ
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">แก้ไขชุดข้อสอบ</h1>
        <p className="text-sm text-muted-foreground mt-1">{a.title}</p>
      </div>

      {groupTargeting.classrooms.length > 0 && (
        <AssignmentGroupTargetsCard
          assignmentId={a.id}
          classrooms={groupTargeting.classrooms}
          groupsByClassroom={groupTargeting.groupsByClassroom}
          initial={groupTargeting.targets}
        />
      )}

      <EditAssignmentForm
        assignment={a}
        questions={questions}
        bank={bank}
        hasSubmissions={!!startedSubmission}
      />
    </div>
  )
}

/**
 * "มอบหมายให้" for this งาน: every linked room this teacher manages that has
 * กลุ่มย่อย, its groups (with head counts), and what is chosen now. Rooms
 * without groups have nothing to choose — the whole room gets the งาน.
 */
async function loadGroupTargeting(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assignmentId: string,
  userId: string,
): Promise<{ classrooms: { id: string; name: string }[]; groupsByClassroom: Record<string, AssignmentGroupOption[]>; targets: GroupTargets }> {
  const empty = { classrooms: [], groupsByClassroom: {}, targets: {} }
  const { data: links } = await supabase
    .from('assignment_classrooms')
    .select('classroom_id, group_ids, classrooms(name)')
    .eq('assignment_id', assignmentId)
  const rows = (links ?? []) as unknown as { classroom_id: string; group_ids: string[] | null; classrooms: { name: string } | null }[]
  if (rows.length === 0) return empty

  const manageable = await manageableClassroomIds(createAdminClient(), userId, rows.map(r => r.classroom_id))
  const ids = rows.map(r => r.classroom_id).filter(cid => manageable.has(cid))
  if (ids.length === 0) return empty

  const [{ data: groupRows }, { data: memberRows }] = await Promise.all([
    supabase
      .from('classroom_groups')
      .select('id, classroom_id, name, color')
      .in('classroom_id', ids)
      .order('position')
      .order('created_at'),
    supabase
      .from('classroom_group_members')
      .select('group_id')
      .in('classroom_id', ids),
  ])
  const memberCount = new Map<string, number>()
  for (const m of (memberRows ?? []) as { group_id: string }[]) {
    memberCount.set(m.group_id, (memberCount.get(m.group_id) ?? 0) + 1)
  }
  const groupsByClassroom: Record<string, AssignmentGroupOption[]> = {}
  for (const g of (groupRows ?? []) as { id: string; classroom_id: string; name: string; color: string }[]) {
    ;(groupsByClassroom[g.classroom_id] ??= []).push({
      id: g.id, name: g.name, color: g.color, memberCount: memberCount.get(g.id) ?? 0,
    })
  }

  // Rooms with groups, plus any still limited to groups deleted since — that
  // งาน reaches nobody there until it is opened back up to the whole room.
  const withGroups = rows.filter(r => ids.includes(r.classroom_id)
    && ((groupsByClassroom[r.classroom_id]?.length ?? 0) > 0 || r.group_ids !== null))
  return {
    classrooms: withGroups.map(r => ({ id: r.classroom_id, name: r.classrooms?.name ?? 'ห้องเรียน' })),
    groupsByClassroom,
    targets: Object.fromEntries(withGroups.map(r => [
      r.classroom_id,
      // A group deleted since is simply no longer offered.
      r.group_ids === null ? null : r.group_ids.filter(g => (groupsByClassroom[r.classroom_id] ?? []).some(opt => opt.id === g)),
    ])),
  }
}
