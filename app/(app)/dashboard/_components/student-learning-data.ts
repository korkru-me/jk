import type { Assignment, Submission } from '@/lib/types'
import { assignmentReachesStudent, linkReachesGroup, type AssignmentLinkReach } from '@/lib/classroom-groups'
import { computePassed } from '@/lib/grading'
import { rescaleToDisplayMax, selectOfficialAttempt } from '@/lib/scoring'
import { canStudentReviewAnswers, canStudentViewScore } from '@/lib/result-visibility'
import type { StudentClassroom } from '../../classrooms/_components/student-view'
import type { CalendarEvent } from './assignment-calendar'
import type { StudentPracticeLibraryListItem } from '../../practice/_lib/student-landing-contract'

type WorkSettings = Pick<Assignment,
  'id' | 'classroom_id' | 'title' | 'type' | 'end_at' | 'duration_minutes' |
  'passing_type' | 'passing_value' | 'score_strategy' | 'display_max_score' | 'show_results'
>
export type LearningAssignment = WorkSettings & { created_at?: string; assignment_classrooms: AssignmentLinkReach[] }
export type LearningSubmission = Pick<Submission,
  'id' | 'assignment_id' | 'total_score' | 'max_score' | 'score_adjustment' |
  'status' | 'attempt_number' | 'created_at'
> & { assignments: (WorkSettings & { classrooms: { name: string } | null }) | null }

export type StudentWorkItem = {
  id: string
  title: string
  classroom: Pick<StudentClassroom, 'id' | 'name' | 'description'> | null
  otherClassroomNames: string[]
  endAt: string | null
  assignedAt: string | null
  durationMinutes: number | null
  inProgress: boolean
  completed: boolean
  submissionId: string | null
  hasPreviousAttempt: boolean
  previousScore: { total: number | null; max: number } | null
}
export type StudentWorkHistory = {
  id: string
  title: string
  classroomName: string
  createdAt: string
  score: { total: number | null; max: number } | null
  reviewLabel: string
}
export type StudentPracticeWorkItem = {
  kind: 'practice'
  id: string
  title: string
  classroom: Pick<StudentClassroom, 'id' | 'name' | 'description'>
  otherClassroomNames: string[]
  endAt: null
  assignedAt: string | null
  completed: false
  questionCount: number
}
export type StudentSummaryItem = ({ kind: 'assignment' } & StudentWorkItem) | StudentPracticeWorkItem
export type StudentLearningData = {
  classrooms: StudentClassroom[]
  pendingCountMap: Record<string, number>
  pendingWork: StudentWorkItem[]
  completedWork: StudentWorkItem[]
  practiceWork: StudentPracticeWorkItem[]
  practiceError: string | null
  urgentCount: number
  doneCount: number
  history: StudentWorkHistory[]
  calendarEvents: CalendarEvent[]
}

/** Server-side projection: one completion rule for cards, summary and calendar.
 * Input rows must already be scoped to the authenticated student's memberships
 * and own submissions. Hidden scores are removed before rendering any props. */
export function buildStudentLearningData({ classrooms, assignments, submissions, practiceLibraries = [], practiceError = null, groupOf = new Map(), now = Date.now() }: {
  classrooms: StudentClassroom[]
  assignments: LearningAssignment[]
  submissions: LearningSubmission[]
  practiceLibraries?: StudentPracticeLibraryListItem[]
  practiceError?: string | null
  groupOf?: ReadonlyMap<string, string>
  now?: number
}): StudentLearningData {
  const classroomById = new Map(classrooms.map(c => [c.id, c]))
  const enrolled = new Set(classroomById.keys())
  const all = rescaleToDisplayMax(submissions, s => s.assignments?.display_max_score ?? null)
  const completed = all.filter(s => s.status === 'submitted' || s.status === 'graded')
  const submittedIds = new Set(all.map(s => s.assignment_id))
  const inProgressIds = new Set(all.filter(s => s.status === 'in_progress').map(s => s.assignment_id))
  const attemptsByAssignment = new Map<string, LearningSubmission[]>()
  for (const submission of completed) {
    const attempts = attemptsByAssignment.get(submission.assignment_id) ?? []
    attempts.push(submission)
    attemptsByAssignment.set(submission.assignment_id, attempts)
  }
  const officialByAssignment = new Map<string, LearningSubmission>()
  const doneIds = new Set<string>()
  for (const [id, attempts] of attemptsByAssignment) {
    const official = selectOfficialAttempt(attempts, attempts[0].assignments?.score_strategy ?? 'best')
    if (!official) continue
    const submission = { ...official.representative, total_score: official.total_score, max_score: official.max_score }
    officialByAssignment.set(id, submission)
    const settings = submission.assignments
    if (settings?.type === 'exercise' && computePassed(submission.total_score, submission.max_score, settings.passing_type, settings.passing_value) === false) continue
    doneIds.add(id)
  }

  const visibleAssignments = [...new Map(assignments.map(a => [a.id, a])).values()].filter(a =>
    assignmentReachesStudent(a.assignment_classrooms, enrolled, groupOf, submittedIds.has(a.id)),
  )
  function roomsFor(a: LearningAssignment) {
    const links = a.assignment_classrooms.filter(l => enrolled.has(l.classroom_id))
    const targeted = links.filter(l => linkReachesGroup(l.group_ids, groupOf.get(l.classroom_id)))
    // An existing attempt stays available after a student changes groups.
    const rooms = (targeted.length ? targeted : links).map(l => classroomById.get(l.classroom_id)!)
    return [...new Map(rooms.map(c => [c.id, c])).values()].sort((left, right) =>
      Number(right.id === a.classroom_id) - Number(left.id === a.classroom_id),
    )
  }
  const pendingCountMap: Record<string, number> = {}
  const work = visibleAssignments.map(a => {
    const rooms = roomsFor(a)
    if (!doneIds.has(a.id)) for (const room of rooms) pendingCountMap[room.id] = (pendingCountMap[room.id] ?? 0) + 1
    const previous = officialByAssignment.get(a.id)
    return {
      id: a.id, title: a.title, classroom: rooms[0] ?? null,
      otherClassroomNames: rooms.slice(1).map(c => c.name),
      endAt: a.end_at, assignedAt: a.created_at ?? null, durationMinutes: a.duration_minutes,
      inProgress: !doneIds.has(a.id) && inProgressIds.has(a.id), completed: doneIds.has(a.id), submissionId: previous?.id ?? null, hasPreviousAttempt: !!previous,
      previousScore: previous && canStudentViewScore(previous.assignments?.show_results, previous.assignments?.end_at, now)
        ? { total: previous.total_score, max: previous.max_score } : null,
    }
  }).sort((a, b) => (a.endAt ? Date.parse(a.endAt) : Infinity) - (b.endAt ? Date.parse(b.endAt) : Infinity))

  const pendingWork = work.filter(item => !item.completed)
  const completedWork = work.filter(item => item.completed)
  const practiceWork: StudentPracticeWorkItem[] = [...new Map(practiceLibraries.map(library => [library.id, library])).values()].flatMap(library => {
    const classroom = classroomById.get(library.classroomId)
    if (!classroom || classroom.status !== 'active' || classroom.classroom_type !== 'subject') return []
    return [{
      kind: 'practice', id: library.id, title: library.title,
      classroom: { id: classroom.id, name: classroom.name, description: classroom.description },
      otherClassroomNames: [], endAt: null, assignedAt: library.publishedAt ?? library.createdAt,
      completed: false, questionCount: library.questionCount,
    }]
  })

  return {
    classrooms: classrooms.filter(c => c.status === 'active'), pendingCountMap, pendingWork, completedWork, practiceWork, practiceError,
    urgentCount: pendingWork.filter(a => a.endAt && Date.parse(a.endAt) - now <= 3 * 86400000).length,
    doneCount: doneIds.size,
    calendarEvents: visibleAssignments.filter(a => a.end_at).map(a => ({
      id: a.id, title: a.title, classroomName: roomsFor(a).map(c => c.name).join(' · '),
      endAt: a.end_at!, done: doneIds.has(a.id), submissionId: officialByAssignment.get(a.id)?.id ?? null,
    })),
    history: completed.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).map(s => {
      const canShow = canStudentViewScore(s.assignments?.show_results, s.assignments?.end_at, now)
      return {
        id: s.id, title: s.assignments?.title ?? 'งานเดิม',
        classroomName: s.assignments?.classrooms?.name ?? '', createdAt: s.created_at,
        score: canShow ? { total: s.total_score, max: s.max_score } : null,
        reviewLabel: canStudentReviewAnswers(s.assignments?.show_results, s.assignments?.end_at, now)
          ? 'ดูเฉลย' : canShow ? 'ดูคะแนน' : 'ดูสถานะ',
      }
    }),
  }
}
