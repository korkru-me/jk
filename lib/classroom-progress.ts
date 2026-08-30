import { computePassed, type PassingType } from '@/lib/grading'
import { officialSubmissionsByStudent, type AttemptRow } from '@/lib/scoring'
import type { ScoreStrategy } from '@/lib/types'

/**
 * How far a classroom has got with the work it was given.
 *
 * The classroom assignments tab, the homeroom matrix and the classroom
 * overview all answer the same three questions — how many students finished
 * this งาน, how much of their work each student has handed in, and how the
 * room is doing overall — and each used to compute it its own way. The rules
 * live here once, as plain functions, so a server component can call them too.
 *
 * Every count is reduced to each student's *official* attempt first (per the
 * งาน's own `score_strategy`), never to the raw attempt rows: a student with
 * three attempts is one student, not three.
 */

export interface ProgressAssignment {
  id: string
  end_at: string | null
  passing_type: PassingType | null
  passing_value: number | null
  score_strategy: ScoreStrategy
}

export interface ProgressSubmission extends AttemptRow {
  assignment_id: string
  student_id: string
}

export interface AssignmentProgress {
  /** Students with any attempt row at all, including one still in progress. */
  attempted: number
  /** Students whose official attempt is handed in — pass or fail. */
  submitted: number
  /** Handed in and not below the threshold (no threshold set = counted). */
  completed: number
  /** Handed in and above the threshold. 0 when the งาน has no threshold. */
  passed: number
  /** Roster students still working on it right now. */
  inProgress: number
  /** Roster students with nothing handed in yet. */
  missing: number
}

export interface StudentProgress {
  studentId: string
  /** Assignments already due that this student handed in. */
  submitted: number
  /** Assignments already due, i.e. what was expected of them by now. */
  total: number
  /** 0–100. A room with nothing due yet reads as 100 — nothing is late. */
  rate: number
}

export interface ClassroomProgressSummary {
  byAssignment: Map<string, AssignmentProgress>
  byStudent: Map<string, StudentProgress>
  /** Assignments whose deadline has passed (or that never had one). */
  dueAssignmentCount: number
  /** Hand-ins across due assignments, out of `expectedTotal`. */
  submittedTotal: number
  expectedTotal: number
  /** 0–100, or null when nothing is due yet — not 0, which would read as "nobody sent anything". */
  overallRate: number | null
}

export function isSubmittedStatus(status: string): boolean {
  return status === 'submitted' || status === 'graded'
}

/** A งาน is "due" once its deadline has passed. No deadline = always due. */
export function isDueBy(endAt: string | null, now: number = Date.now()): boolean {
  return !endAt || new Date(endAt).getTime() <= now
}

function groupByAssignment(submissions: ProgressSubmission[]): Map<string, ProgressSubmission[]> {
  const map = new Map<string, ProgressSubmission[]>()
  for (const s of submissions) {
    const arr = map.get(s.assignment_id) ?? []
    arr.push(s)
    map.set(s.assignment_id, arr)
  }
  return map
}

/**
 * One งาน's completion snapshot. `rosterIds` bounds every count to students
 * who are actually in the room now — someone who was moved out still owns
 * their submission rows, and counting them can push "ส่งแล้ว" above the
 * roster size. Pass `null` to count every submitter (what the assignments
 * tab has always shown).
 */
export function computeAssignmentProgress(
  assignment: ProgressAssignment,
  submissions: ProgressSubmission[],
  rosterIds: Set<string> | null = null,
): AssignmentProgress & { submitters: string[] } {
  const rows = submissions.filter(s => s.assignment_id === assignment.id)
  const official = officialSubmissionsByStudent(rows, assignment.score_strategy)

  let attempted = 0
  let submitted = 0
  let completed = 0
  let passed = 0
  let inProgress = 0
  const submitters: string[] = []

  for (const [studentId, score] of official) {
    if (rosterIds && !rosterIds.has(studentId)) continue
    attempted++
    if (!isSubmittedStatus(score.representative.status)) {
      if (score.representative.status === 'in_progress') inProgress++
      continue
    }
    submitted++
    submitters.push(studentId)
    const isPassed = computePassed(score.total_score, score.max_score, assignment.passing_type, assignment.passing_value)
    if (isPassed !== false) completed++
    if (isPassed === true) passed++
  }

  return {
    attempted,
    submitted,
    completed,
    passed,
    inProgress,
    missing: rosterIds ? Math.max(0, rosterIds.size - submitted) : 0,
    submitters,
  }
}

/**
 * The whole room at once: per งาน, per student, and one overall rate.
 *
 * `assignments` should already be limited to what students can actually see
 * (published), otherwise a draft counts against everyone's rate.
 */
export function summarizeClassroomProgress(
  studentIds: string[],
  assignments: ProgressAssignment[],
  submissions: ProgressSubmission[],
  now: number = Date.now(),
): ClassroomProgressSummary {
  const roster = new Set(studentIds)
  const grouped = groupByAssignment(submissions)

  const byAssignment = new Map<string, AssignmentProgress>()
  const submittedByStudent = new Map<string, number>()
  let dueAssignmentCount = 0
  let submittedTotal = 0

  for (const assignment of assignments) {
    const { submitters, ...progress } = computeAssignmentProgress(
      assignment,
      grouped.get(assignment.id) ?? [],
      roster,
    )
    byAssignment.set(assignment.id, progress)

    if (!isDueBy(assignment.end_at, now)) continue
    dueAssignmentCount++
    submittedTotal += progress.submitted
    for (const studentId of submitters) {
      submittedByStudent.set(studentId, (submittedByStudent.get(studentId) ?? 0) + 1)
    }
  }

  const byStudent = new Map<string, StudentProgress>()
  for (const studentId of studentIds) {
    const submitted = submittedByStudent.get(studentId) ?? 0
    byStudent.set(studentId, {
      studentId,
      submitted,
      total: dueAssignmentCount,
      rate: dueAssignmentCount > 0 ? Math.round((submitted / dueAssignmentCount) * 100) : 100,
    })
  }

  const expectedTotal = dueAssignmentCount * roster.size
  return {
    byAssignment,
    byStudent,
    dueAssignmentCount,
    submittedTotal,
    expectedTotal,
    overallRate: expectedTotal > 0 ? Math.round((submittedTotal / expectedTotal) * 100) : null,
  }
}
