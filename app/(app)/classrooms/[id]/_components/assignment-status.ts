import { computePassed } from '@/lib/grading'

export interface StudentAssignmentRow {
  id: string
  title: string
  question_ids: string[]
  end_at: string | null
  duration_minutes: number | null
  type: string
  max_attempts: number | null
  passing_type: 'score' | 'percent' | null
  passing_value: number | null
  show_results: 'immediate' | 'after_due' | 'never'
  attempts_used: number
  // Whether the student's most recent attempt is still unfinished — kept
  // separate from `submission` (which reflects the best/official-strategy
  // attempt for score display) since those can be two different attempts.
  has_in_progress: boolean
  submission: { id: string; status: string; total_score: number | null; max_score: number } | null
}

// A submitted exercise that hasn't cleared its passing threshold isn't
// "done" yet — the student is expected to retry until they pass. Exams can
// also be multi-attempt now (max_attempts), so a submitted exam always
// counts regardless of score.
// Plain function, deliberately kept out of any 'use client' file so both the
// server-rendered classroom page and the client-side filter tabs can call it
// directly (a function exported from a client module can't be invoked from
// server code — only rendered as a component).
export function isCompleted(a: StudentAssignmentRow): boolean {
  const submitted = a.submission?.status === 'submitted' || a.submission?.status === 'graded'
  if (!submitted) return false
  if (a.type === 'exercise') {
    const passed = computePassed(a.submission?.total_score ?? null, a.submission?.max_score ?? 0, a.passing_type, a.passing_value)
    if (passed === false) return false
  }
  return true
}
