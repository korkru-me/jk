import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { fetchBankQuestions, withQuestionPoints } from '@/lib/question-bank'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CreateAssignmentForm } from '@/components/assignments/create-assignment-form'
import type {
  AssignmentClassroomOption,
  AssignmentCopyPreset,
  AssignmentQuestionSetOption,
} from '@/components/assignments/create-assignment-form'
import type { AssignmentGroupOption, GroupTargets } from '@/components/assignments/group-target-picker'
import type { Assignment, Classroom } from '@/lib/types'
import { firstSearchParam, resolveAssignmentTypePreset } from '@/lib/assignment-creation'
import { classroomNavigationPath } from '@/lib/classroom-navigation'
import { filterSectionsToQuestions, parseSections, questionIdsForSections } from '@/lib/question-set-sections'
import { AssignmentClassroomSidebar } from './_components/assignment-classroom-sidebar'
import { AssignmentStartChoice, AssignmentTypeChoice } from './_components/assignment-start-choice'
import {
  ReuseAssignmentCard, type ReusableAssignmentOption,
} from './_components/reuse-assignment-card'
import { Button } from '@/components/ui/button'
import { canManageAssignment } from '@/lib/auth/assignment-access'
import { loadAssignmentQuestionsByProvenance } from '@/lib/assignment-question-access.server'

interface Props {
  searchParams: Promise<{
    classroom?: string | string[]
    set?: string | string[]
    sections?: string | string[]
    type?: string | string[]
    flow?: string | string[]
    copy?: string | string[]
  }>
}

export async function generateMetadata({ searchParams }: Props) {
  const { copy } = await searchParams
  return {
    title: firstSearchParam(copy) ? 'ทำสำเนา — KorKru' : 'สร้างงานที่มอบหมาย — KorKru',
  }
}

type AssignmentCopyRow = AssignmentCopyPreset & Pick<Assignment, 'created_by' | 'org_id'>

type AssignmentClassroomContextRow = Classroom & {
  classroom_students: Array<{ count: number }>
}

type ReusableAssignmentLinkRow = {
  classroom_id: string
  assignments: {
    id: string
    title: string
    type: ReusableAssignmentOption['type']
    status: ReusableAssignmentOption['status']
    created_at: string
  } | Array<{
    id: string
    title: string
    type: ReusableAssignmentOption['type']
    status: ReusableAssignmentOption['status']
    created_at: string
  }> | null
}

export default async function NewAssignmentPage({ searchParams }: Props) {
  const {
    classroom: classroomValue,
    set: setValue,
    sections: sectionsValue,
    type: typeParam,
    flow: flowValue,
    copy: copyValue,
  } = await searchParams
  const classroomParam = firstSearchParam(classroomValue)
  const setParam = firstSearchParam(setValue)
  const sectionsParam = firstSearchParam(sectionsValue)
  const requestedAssignmentType = resolveAssignmentTypePreset(typeParam)
  const requestedFlow = firstSearchParam(flowValue)
  const copyParam = firstSearchParam(copyValue)

  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const preselectedSetQuery = setParam
    ? supabase
        .from('question_sets')
        .select('id, title, description, question_ids, sections')
        .eq('id', setParam)
        .maybeSingle()
    : Promise.resolve({ data: null })

  const preselectedClassroomContextQuery = classroomParam
    ? supabase
        .from('classrooms')
        .select('id, org_id, teacher_id, name, description, class_code, status, classroom_type, pinned_at, display_order, deleted_at, created_at, updated_at, classroom_students(count)')
        .eq('id', classroomParam)
        .maybeSingle()
    : Promise.resolve({ data: null })

  const copySourceQuery = copyParam
    ? supabase
        .from('assignments')
        .select('id, org_id, created_by, title, description, question_ids, question_points, display_max_score, sections, show_sections, start_at, end_at, duration_minutes, type, shuffle_questions, shuffle_options, shared_random_seed, random_question_count, show_results, show_solutions, max_attempts, score_strategy, retry_scope, questions_per_page, instant_check, instant_check_answer_key, completion_rule, streak_target, streak_question_cap, streak_recycle_pool, access_code, passing_type, passing_value, require_work_image, calculator_enabled, scratchpad_enabled, proctoring_enabled, fullscreen_required, block_clipboard, exam_watermark_enabled, secure_browser_mode, android_exam_mode')
        .eq('id', copyParam)
        .maybeSingle()
    : Promise.resolve({ data: null })

  const [
    { data: profile },
    { data: ownedClassrooms },
    { data: coTeaching },
    bankQuestions,
    { data: questionSets },
    { data: preselectedSetRow },
    { data: preselectedClassroomContextRow },
    { data: copySourceRow },
  ] = await Promise.all([
    supabase.from('users').select('role').eq('id', user.id).single(),
    supabase
      .from('classrooms')
      .select('id, name, description, status, classroom_type')
      .eq('teacher_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    supabase
      .from('classroom_co_teachers')
      .select('classrooms(id, name, description, status, classroom_type)')
      .eq('user_id', user.id)
      .in('permission', ['admin', 'manage']),
    fetchBankQuestions(supabase, user.id),
    supabase
      .from('question_sets')
      .select('id, title, description, question_ids, sections')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false }),
    preselectedSetQuery,
    preselectedClassroomContextQuery,
    copySourceQuery,
  ])

  if (profile?.role !== 'teacher' && profile?.role !== 'admin') redirect('/dashboard')

  // Home Room classrooms are for the homeroom teacher's pastoral oversight,
  // not subject content — assignments (exams/exercises) only ever belong to
  // subject classrooms, so Home Room is excluded from this picker entirely.
  const seen = new Set<string>()
  const classrooms: AssignmentClassroomOption[] = []
  for (const c of [...(ownedClassrooms ?? []), ...((coTeaching ?? []).map((r: any) => r.classrooms).filter(Boolean))]) {
    if (c.status === 'active' && c.classroom_type !== 'homeroom' && !seen.has(c.id)) {
      seen.add(c.id)
      classrooms.push({ id: c.id, name: c.name, description: c.description })
    }
  }

  const preselectedClassroomId = classroomParam && seen.has(classroomParam) ? classroomParam : undefined
  const contextRow = preselectedClassroomContextRow as AssignmentClassroomContextRow | null
  let contextualClassroom: Classroom | undefined
  let contextualStudentCount = 0
  if (preselectedClassroomId && contextRow?.id === preselectedClassroomId) {
    const { classroom_students: studentCounts, ...classroom } = contextRow
    contextualClassroom = classroom
    contextualStudentCount = studentCounts?.[0]?.count ?? 0
  }

  let copySource: AssignmentCopyRow | undefined
  let copySourceLinks: Array<{ classroom_id: string; group_ids: string[] | null }> = []
  let questions = bankQuestions
  if (copyParam) {
    if (!preselectedClassroomId || !copySourceRow || !await canManageAssignment(copyParam, user.id)) {
      notFound()
    }
    copySource = copySourceRow as AssignmentCopyRow
    const [questionResult, { data: sourceLinks }] = await Promise.all([
      loadAssignmentQuestionsByProvenance(copySource),
      supabase
        .from('assignment_classrooms')
        .select('classroom_id, group_ids')
        .eq('assignment_id', copyParam),
    ])
    if ('error' in questionResult) throw new Error(questionResult.error)

    const questionsById = new Map(bankQuestions.map(question => [question.id, question]))
    for (const question of questionResult.questions) {
      const counted = withQuestionPoints(question)
      questionsById.set(question.id, {
        id: question.id,
        title: question.title,
        question_text: question.question_text,
        difficulty: question.difficulty,
        question_type: question.question_type,
        tags: question.tags,
        sub_question_count: counted.sub_question_count,
        default_points: counted.default_points,
        has_random_values: counted.has_random_values,
      })
    }
    questions = [...questionsById.values()]
    copySourceLinks = (sourceLinks ?? []) as Array<{ classroom_id: string; group_ids: string[] | null }>
  }

  const preselectedAssignmentType = copySource?.type ?? requestedAssignmentType

  // กลุ่มย่อย of those rooms, for "มอบหมายให้". Read under RLS: the owner and
  // any co-teacher of a room can see its groups.
  const classroomIdList = classrooms.map(c => c.id)
  const [{ data: groupRows }, { data: memberRows }, { data: reusableAssignmentRows }] = classroomIdList.length > 0
    ? await Promise.all([
        supabase
          .from('classroom_groups')
          .select('id, classroom_id, name, color, position')
          .in('classroom_id', classroomIdList)
          .order('position')
          .order('created_at'),
        supabase
          .from('classroom_group_members')
          .select('group_id')
          .in('classroom_id', classroomIdList),
        supabase
          .from('assignment_classrooms')
          .select('classroom_id, assignments!inner(id, title, type, status, created_at)')
          .in('classroom_id', classroomIdList),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]
  const memberCount = new Map<string, number>()
  for (const row of (memberRows ?? []) as { group_id: string }[]) {
    memberCount.set(row.group_id, (memberCount.get(row.group_id) ?? 0) + 1)
  }
  const groupsByClassroom: Record<string, AssignmentGroupOption[]> = {}
  for (const g of (groupRows ?? []) as { id: string; classroom_id: string; name: string; color: string }[]) {
    ;(groupsByClassroom[g.classroom_id] ??= []).push({
      id: g.id, name: g.name, color: g.color, memberCount: memberCount.get(g.id) ?? 0,
    })
  }
  const initialGroupTargets: GroupTargets = {}
  if (copySource && preselectedClassroomId) {
    const sourceLink = copySourceLinks.find(link => link.classroom_id === preselectedClassroomId)
    if (sourceLink) {
      initialGroupTargets[preselectedClassroomId] = sourceLink.group_ids === null
        ? null
        : sourceLink.group_ids.filter(groupId => (
            groupsByClassroom[preselectedClassroomId]?.some(group => group.id === groupId) ?? false
          ))
    }
  }
  const reusableAssignments: ReusableAssignmentOption[] = []
  for (const row of (reusableAssignmentRows ?? []) as unknown as ReusableAssignmentLinkRow[]) {
    const assignment = Array.isArray(row.assignments) ? row.assignments[0] : row.assignments
    if (!assignment) continue
    reusableAssignments.push({
      id: assignment.id,
      classroomId: row.classroom_id,
      title: assignment.title,
      type: assignment.type,
      status: assignment.status,
      createdAt: assignment.created_at,
    })
  }
  let preselectedSet = copySource
    ? undefined
    : (preselectedSetRow ?? undefined) as AssignmentQuestionSetOption | undefined

  // ?sections=... — assigning only part of a แฟ้ม ("this week, projectiles
  // only"). Narrowed here rather than in the client so an unknown section id
  // simply selects nothing instead of quietly falling back to the whole แฟ้ม.
  if (preselectedSet && sectionsParam) {
    const wanted = sectionsParam.split(',').map(id => id.trim()).filter(Boolean)
    const allSections = parseSections(preselectedSet.sections)
    const chosen = allSections.filter(section => wanted.includes(section.id))
    if (chosen.length > 0) {
      // Ordered by the แฟ้ม and deduped: a question two of the chosen
      // แฟ้มย่อย both hold must be assigned once.
      const questionIds = questionIdsForSections(allSections, wanted, preselectedSet.question_ids)
      preselectedSet = {
        ...preselectedSet,
        // One แฟ้มย่อย names the งาน; several keep the แฟ้ม's own name.
        title: chosen.length === 1 && chosen[0].title
          ? `${preselectedSet.title} — ${chosen[0].title}`
          : preselectedSet.title,
        question_ids: questionIds,
        sections: filterSectionsToQuestions(chosen, questionIds),
      }
    }
  }

  const baseSearchParams = new URLSearchParams()
  if (preselectedClassroomId) baseSearchParams.set('classroom', preselectedClassroomId)
  if (setParam) baseSearchParams.set('set', setParam)
  if (sectionsParam) baseSearchParams.set('sections', sectionsParam)
  const flowHref = ({ flow, type }: { flow?: 'create' | 'reuse'; type?: 'exercise' | 'exam' }) => {
    const params = new URLSearchParams(baseSearchParams)
    if (flow) params.set('flow', flow)
    if (type) params.set('type', type)
    const query = params.toString()
    return query ? `/assignments/new?${query}` : '/assignments/new'
  }

  const assignmentSidebar = contextualClassroom ? (
    <AssignmentClassroomSidebar
      classroom={contextualClassroom}
      switchableClassrooms={classrooms}
      studentCount={contextualStudentCount}
      isOwner={contextualClassroom.teacher_id === user.id}
    />
  ) : null

  const hasReusableSource = preselectedClassroomId !== undefined
    && reusableAssignments.some(assignment => assignment.classroomId !== preselectedClassroomId)

  if (!preselectedAssignmentType && requestedFlow === 'create') {
    return (
      <>
        {assignmentSidebar}
        <AssignmentTypeChoice
          backHref={flowHref({})}
          exerciseHref={flowHref({ type: 'exercise' })}
          examHref={flowHref({ type: 'exam' })}
        />
      </>
    )
  }

  if (!preselectedAssignmentType && requestedFlow === 'reuse' && preselectedClassroomId) {
    return (
      <>
        {assignmentSidebar}
        <div className="flex max-w-3xl flex-col gap-6">
          <Button
            variant="ghost"
            className="w-fit"
            render={<Link href={classroomNavigationPath(preselectedClassroomId, 'assignments')} />}
          >
            <ArrowLeft data-icon="inline-start" /> กลับไปงานที่มอบหมาย
          </Button>
          <ReuseAssignmentCard
            targetClassroomId={preselectedClassroomId}
            classrooms={classrooms}
            assignments={reusableAssignments}
          />
        </div>
      </>
    )
  }

  if (!preselectedAssignmentType) {
    return (
      <>
        {assignmentSidebar}
        <AssignmentStartChoice
          createHref={flowHref({ flow: 'create' })}
          reuseHref={hasReusableSource ? flowHref({ flow: 'reuse' }) : undefined}
        />
      </>
    )
  }

  return (
    <>
      {assignmentSidebar}

      <div className="max-w-2xl space-y-6">
        <CreateAssignmentForm
          classrooms={classrooms}
          groupsByClassroom={groupsByClassroom}
          questions={questions}
          questionSets={(questionSets ?? []) as AssignmentQuestionSetOption[]}
          preselectedClassroomId={preselectedClassroomId}
          preselectedSet={preselectedSet}
          preselectedAssignmentType={preselectedAssignmentType}
          copySource={copySource}
          initialGroupTargets={initialGroupTargets}
        />
      </div>
    </>
  )
}
