import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSolutionWatermark } from './solution-watermark'

/** Call only after exact submission ownership/assignment management has been
 * authorized. Read only the authorized student's identity, never a roster. */
export async function loadStudentSolutionWatermark(reader: SupabaseClient, studentId: string) {
  const [name, profile] = await Promise.all([
    reader.from('users').select('full_name, prefix, first_name, last_name').eq('id', studentId).maybeSingle(),
    reader.from('student_profiles').select('student_code, grade_level, section_number, class_number').eq('student_id', studentId).maybeSingle(),
  ])
  if (name.error || profile.error || !name.data) return null
  return buildSolutionWatermark(name.data, profile.data, new Date().toISOString())
}
