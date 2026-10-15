import { groupAssignmentsByCategory, type AssignmentCategory } from './assignment-categories'
import { isCompleted, type StudentAssignmentRow } from '@/app/(app)/classrooms/[id]/_components/assignment-status'
import type { CalendarEvent } from '@/app/(app)/dashboard/_components/assignment-calendar'
import { studentWorkSeverity } from './student-work-status'

/** Tab reminders concern missing submissions, independently of mastery/score
 * completion. Opening a task or saving an in-progress draft never dismisses one. */
export function classroomOverdueWork(assignments: readonly StudentAssignmentRow[], now: number): StudentAssignmentRow[] {
  const seen = new Set<string>()
  return assignments.filter(assignment => {
    const submitted = assignment.submission?.status === 'submitted' || assignment.submission?.status === 'graded'
    if (submitted || studentWorkSeverity(assignment.end_at, false, now) !== 'overdue' || seen.has(assignment.id)) return false
    seen.add(assignment.id)
    return true
  })
}

/** Count whole-classroom overdue submissions before presentation filters. */
export function classroomWorkAlertCount(assignments: readonly StudentAssignmentRow[], now: number): number {
  return classroomOverdueWork(assignments, now).length
}

export function classroomCalendarEvents(assignments: readonly StudentAssignmentRow[], classroomName: string): CalendarEvent[] {
  return assignments.filter(a => a.end_at && Number.isFinite(Date.parse(a.end_at))).map(a => ({
    id: a.id, title: a.title, classroomName, endAt: a.end_at!,
    done: isCompleted(a), submissionId: a.submission?.id ?? null,
  }))
}

/** Stable partition: preserve teacher order within unfinished/finished work.
 * Determine a whole group's completion from all work, before UI filters. */
export function orderStudentClassroomWork(visible: StudentAssignmentRow[], all: StudentAssignmentRow[], categories: AssignmentCategory[]) {
  const completeGroups = new Set(groupAssignmentsByCategory(all, categories)
    .filter(section => section.assignments.every(isCompleted))
    .map(section => section.category?.id ?? null))
  return groupAssignmentsByCategory(visible, categories)
    .map(section => ({ ...section, assignments: [...section.assignments].sort((a, b) => Number(isCompleted(a)) - Number(isCompleted(b))) }))
    .sort((a, b) => Number(completeGroups.has(a.category?.id ?? null)) - Number(completeGroups.has(b.category?.id ?? null)))
}
