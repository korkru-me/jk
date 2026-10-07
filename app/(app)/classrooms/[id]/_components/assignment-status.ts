import { completionChoiceFor, findPassingCompletion } from '@/lib/assignment-completion'

export interface StudentAssignmentRow {
  id: string
  title: string
  question_ids: string[]
  random_question_count: number | null
  completion_rule?: string | null
  streak_target?: number | null
  end_at: string | null
  duration_minutes: number | null
  type: string
  max_attempts: number | null
  completion_reached?: boolean
  retry_scope: 'all' | 'wrong_only'
  passing_type: 'score' | 'percent' | null
  passing_value: number | null
  show_results: 'immediate' | 'score_only' | 'after_due' | 'never'
  category_id?: string | null
  attempts_used: number
  // Whether the student's most recent attempt is still unfinished — kept
  // separate from `submission` (which reflects the best/official-strategy
  // attempt for score display) since those can be two different attempts.
  has_in_progress: boolean
  submission: { id: string; status: string; total_score: number | null; max_score: number; streak_reached?: boolean } | null
}

// Mastery assignments (exercises and exams alike) are complete only after a
// passing finished run. The server flag includes all runs, independently of
// score visibility/strategy; the fallback serves older local fixtures only.
// Plain function, deliberately kept out of any 'use client' file so both the
// server-rendered classroom page and the client-side filter tabs can call it
// directly (a function exported from a client module can't be invoked from
// server code — only rendered as a component).
export function isCompleted(a: StudentAssignmentRow): boolean {
  const submitted = a.submission?.status === 'submitted' || a.submission?.status === 'graded'
  if (!submitted) return false
  if (completionChoiceFor(a) !== 'complete') return a.completion_reached
    ?? findPassingCompletion({ ...a, type: a.type === 'exam' ? 'exam' : 'exercise' }, a.submission ? [a.submission] : []) != null
  return true
}
