import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUuid } from '@/lib/practice-library-contracts'
import type { PracticeExercise } from '@/lib/practice-exercises'

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
      const count = Number(row.attempted_count)
      if (!isUuid(row.id) || typeof row.title !== 'string'
        || !Array.isArray(row.question_ids) || !row.question_ids.every(isUuid)
        || !Number.isSafeInteger(count) || count < 0 || count > row.question_ids.length) return { ready: false }
      exercises.push({ id: row.id, title: row.title, questionIds: row.question_ids, attemptedCount: count })
    }
    return { ready: true, exercises }
  } catch { return { ready: false } }
}
