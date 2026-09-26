import { isSubmittedStatus } from '@/lib/classroom-progress'
import { officialSubmissionsByStudent, type AttemptRow } from '@/lib/scoring'
import { compareStudents, type SortableStudentProfile, type StudentSortDir } from '@/lib/student-sort'
import type { ScoreStrategy } from '@/lib/types'

/**
 * The numbers behind the classroom "ศักยภาพผู้เรียน" tab: for each student,
 * what share of each chosen งาน's full marks they reached.
 *
 * A percentage, not the raw score, so a 10-point quiz and a 40-point exam sit
 * on one scale. Every figure comes from the student's *official* attempt (the
 * งาน's own `score_strategy`), the same one the คะแนนและการส่งงาน tab shows.
 * Work that is not handed in has no percentage at all — it is reported as
 * missing and left out of every average, never counted as 0%.
 */

export interface AbilityAssignment {
  id: string
  created_at: string
  display_order?: number | null
  score_strategy: ScoreStrategy
}

export interface AbilitySubmission extends AttemptRow {
  id: string
  assignment_id: string
  student_id: string
}

export type AbilityCellState = 'done' | 'in_progress' | 'missing'

export interface AbilityCell {
  assignmentId: string
  state: AbilityCellState
  /** 0–100. Null unless the work is handed in and the งาน has full marks to divide by. */
  percent: number | null
  score: number | null
  maxScore: number | null
  /** The official attempt, for linking to what the student handed in. */
  submissionId: string | null
}

export interface StudentAbility {
  studentId: string
  /** One per chosen งาน, in the order they were passed in. */
  cells: AbilityCell[]
  /** Mean of the handed-in percentages; null when nothing is handed in. */
  average: number | null
  submittedCount: number
}

export interface AssignmentAverage {
  /** Mean percentage of the students who handed it in; null when nobody has. */
  average: number | null
  submittedCount: number
}

/**
 * The order งาน are shown across a classroom: a teacher-set display_order
 * first, then oldest-assigned first. Shared with the คะแนนและการส่งงาน tab so
 * the งาน run in the same order on both.
 */
export function compareAssignmentsForDisplay(
  x: Pick<AbilityAssignment, 'created_at' | 'display_order'>,
  y: Pick<AbilityAssignment, 'created_at' | 'display_order'>,
): number {
  const ox = x.display_order ?? Infinity
  const oy = y.display_order ?? Infinity
  if (ox !== oy) return ox - oy
  return new Date(x.created_at).getTime() - new Date(y.created_at).getTime()
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export function buildStudentAbilities(
  studentIds: string[],
  assignments: AbilityAssignment[],
  submissions: AbilitySubmission[],
): Map<string, StudentAbility> {
  const rowsByAssignment = new Map<string, AbilitySubmission[]>()
  for (const row of submissions) {
    const rows = rowsByAssignment.get(row.assignment_id)
    if (rows) rows.push(row)
    else rowsByAssignment.set(row.assignment_id, [row])
  }

  const cellsByAssignment = new Map<string, Map<string, AbilityCell>>()
  for (const assignment of assignments) {
    const official = officialSubmissionsByStudent(rowsByAssignment.get(assignment.id) ?? [], assignment.score_strategy)
    const cells = new Map<string, AbilityCell>()
    for (const [studentId, result] of official) {
      const handedIn = isSubmittedStatus(result.representative.status)
      if (!handedIn) {
        cells.set(studentId, {
          assignmentId: assignment.id,
          state: result.representative.status === 'in_progress' ? 'in_progress' : 'missing',
          percent: null,
          score: null,
          maxScore: null,
          submissionId: null,
        })
        continue
      }
      // A handed-in attempt with no total yet reads as 0, as it does in the
      // scores table — it was handed in, so it is not "missing".
      const score = result.total_score ?? 0
      const maxScore = result.max_score
      cells.set(studentId, {
        assignmentId: assignment.id,
        state: 'done',
        percent: maxScore > 0 ? Math.min(100, Math.max(0, (score / maxScore) * 100)) : null,
        score,
        maxScore,
        submissionId: result.representative.id,
      })
    }
    cellsByAssignment.set(assignment.id, cells)
  }

  const result = new Map<string, StudentAbility>()
  for (const studentId of studentIds) {
    const cells = assignments.map(assignment => cellsByAssignment.get(assignment.id)?.get(studentId) ?? {
      assignmentId: assignment.id,
      state: 'missing' as const,
      percent: null,
      score: null,
      maxScore: null,
      submissionId: null,
    })
    const percents = cells.flatMap(cell => (cell.percent === null ? [] : [cell.percent]))
    result.set(studentId, {
      studentId,
      cells,
      average: mean(percents),
      submittedCount: cells.filter(cell => cell.state === 'done').length,
    })
  }
  return result
}

/** Per-งาน class mean, over the students who handed that งาน in. */
export function assignmentAverages(
  abilities: Iterable<StudentAbility>,
  assignmentIds: string[],
): Map<string, AssignmentAverage> {
  const percents = new Map<string, number[]>(assignmentIds.map(id => [id, []]))
  const submitted = new Map<string, number>(assignmentIds.map(id => [id, 0]))
  for (const ability of abilities) {
    for (const cell of ability.cells) {
      if (cell.state !== 'done') continue
      submitted.set(cell.assignmentId, (submitted.get(cell.assignmentId) ?? 0) + 1)
      if (cell.percent !== null) percents.get(cell.assignmentId)?.push(cell.percent)
    }
  }
  return new Map(assignmentIds.map(id => [id, {
    average: mean(percents.get(id) ?? []),
    submittedCount: submitted.get(id) ?? 0,
  }]))
}

/**
 * How a student sits against the room, on the same งาน only: their mean
 * minus the class mean of exactly the งาน they handed in. Comparing against
 * the class mean of every งาน would reward skipping the hard ones.
 */
export function differenceFromClass(
  ability: StudentAbility,
  averages: Map<string, AssignmentAverage>,
): number | null {
  if (ability.average === null) return null
  const classMeans = ability.cells.flatMap(cell => {
    if (cell.percent === null) return []
    const classMean = averages.get(cell.assignmentId)?.average
    return classMean == null ? [] : [classMean]
  })
  const classMean = mean(classMeans)
  return classMean === null ? null : ability.average - classMean
}

export type AbilitySortKey = 'number' | 'name' | 'code' | 'score'

export const ABILITY_SORT_LABEL: Record<AbilitySortKey, string> = {
  number: 'เลขที่',
  name: 'ชื่อ (ก-ฮ)',
  code: 'รหัสนักเรียน',
  score: 'คะแนนเฉลี่ย',
}

export function sortByAbility<T extends { id: string; full_name: string }>(
  students: T[],
  profiles: Record<string, SortableStudentProfile>,
  abilities: Map<string, StudentAbility>,
  sortKey: AbilitySortKey,
  sortDir: StudentSortDir,
): T[] {
  if (sortKey !== 'score') {
    return students.slice().sort((a, b) => compareStudents(a, b, profiles, sortKey, sortDir))
  }
  return students.slice().sort((a, b) => {
    const av = abilities.get(a.id)?.average ?? null
    const bv = abilities.get(b.id)?.average ?? null
    // Students with nothing handed in stay at the bottom whichever way the
    // list runs — they have no score to rank.
    if (av === null && bv === null) return a.full_name.localeCompare(b.full_name, 'th')
    if (av === null) return 1
    if (bv === null) return -1
    const cmp = sortDir === 'asc' ? av - bv : bv - av
    return cmp !== 0 ? cmp : a.full_name.localeCompare(b.full_name, 'th')
  })
}

function normalise(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase('th').replace(/\s+/g, ' ').trim()
}

/** Name or รหัสนักเรียน contains the query; a bare number also matches เลขที่ exactly. */
export function matchesStudentQuery(
  student: { full_name: string },
  profile: SortableStudentProfile | undefined,
  query: string,
): boolean {
  const q = normalise(query)
  if (!q) return true
  if (normalise(student.full_name).includes(q)) return true
  if (profile?.student_code && normalise(profile.student_code).includes(q)) return true
  return /^\d+$/.test(q) && profile?.class_number === Number(q)
}

/** Whole percent for display: 72.5 → "73%", null → "–". */
export function formatPercent(value: number | null): string {
  return value === null ? '–' : `${Math.round(value)}%`
}
