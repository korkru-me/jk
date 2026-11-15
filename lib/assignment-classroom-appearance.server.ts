import 'server-only'

import { parseDescription } from '@/app/(app)/classrooms/_components/classroom-meta'
import { createClient } from '@/lib/supabase/server'

/** Call after the route authorizes the assignment. The session-bound client
 * only sees classroom links and room metadata the current viewer can read. */
export async function readAssignmentClassroomCover(assignmentId: string, primaryClassroomId?: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('assignment_classrooms')
    .select('classroom_id, classrooms!inner(description)')
    .eq('assignment_id', assignmentId)
    .eq('classrooms.status', 'active')
    .is('classrooms.deleted_at', null)
    .order('classroom_id')
    .returns<{ classroom_id: string; classrooms: { description: string | null } }[]>()

  if (error || !data?.length) return ''
  const room = data.find(link => link.classroom_id === primaryClassroomId) ?? data[0]
  return parseDescription(room.classrooms.description).cover
}
