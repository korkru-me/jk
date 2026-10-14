import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUuid } from '@/lib/practice-library-contracts'
import { practiceExerciseDtoSchema, type PracticeExercise } from '@/lib/practice-exercises'

/** Caller has verified its session and library access; RPC repeats resource authorization. */
export async function loadPracticeExercises(actorId: string, libraryId: string): Promise<
  { ready: true; exercises: PracticeExercise[] } | { ready: false }
> {
  if (!isUuid(actorId) || !isUuid(libraryId)) return { ready: false }
  try {
    const { data, error } = await createAdminClient().rpc('list_student_practice_exercises', {
      p_actor_id: actorId, p_library_id: libraryId,
    })
    if (error || !Array.isArray(data)) return { ready: false }
    const exercises: PracticeExercise[] = []
    for (const row of data) {
      const parsed = practiceExerciseDtoSchema.safeParse({
        id: row.id, title: row.title, questionIds: row.question_ids,
        attemptedCount: Number(row.attempted_count), revision: row.revision, questionTitles: row.question_titles,
      })
      if (!parsed.success) return { ready: false }
      exercises.push(parsed.data)
    }
    return { ready: true, exercises }
  } catch { return { ready: false } }
}


export async function loadPracticeReviewPins(actorId: string, libraryId: string): Promise<
  { ready: true; questionIds: string[] } | { ready: false }
> {
  if (!isUuid(actorId) || !isUuid(libraryId)) return { ready: false }
  try {
    const { data, error } = await createAdminClient().rpc('list_student_practice_review_pins', {
      p_actor_id: actorId, p_library_id: libraryId,
    })
    if (error || !Array.isArray(data) || data.some(row => !isUuid(row.question_id))) return { ready: false }
    return { ready: true, questionIds: data.map(row => row.question_id) }
  } catch { return { ready: false } }
}
