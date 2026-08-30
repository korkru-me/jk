import 'server-only'

import { createClient } from '@/lib/supabase/server'

export interface ManagedProctorReportAssignment {
  id: string
  title: string
  created_by: string
  status: string
  mode: string
  type: string
  proctoring_enabled: boolean
  classrooms: { name: string } | { name: string }[] | null
}

type SessionSupabaseClient = Awaited<ReturnType<typeof createClient>>

/**
 * Resolve an assignment only when the current session can manage it.
 *
 * Assignment SELECT policies have changed over time and have previously also
 * exposed published rows to enrolled students. A readable assignment row is
 * therefore only the first non-disclosure boundary; the owner/co-teacher/
 * super-admin check below is deliberately explicit before any admin lookup.
 */
export async function getManagedProctorReportAssignment(
  supabase: SessionSupabaseClient,
  userId: string,
  assignmentId: string,
): Promise<ManagedProctorReportAssignment | null> {
  const normalizedAssignmentId = assignmentId.toLowerCase()
  const { data: assignment, error: assignmentError } = await supabase
    .from('assignments')
    .select('id, title, created_by, status, mode, type, proctoring_enabled, classrooms(name)')
    .eq('id', normalizedAssignmentId)
    .maybeSingle()

  if (assignmentError || !assignment) return null
  if (assignment.created_by === userId) {
    return assignment as ManagedProctorReportAssignment
  }

  const [coTeachingResult, superAdminResult] = await Promise.all([
    supabase.rpc('get_my_co_teaching_assignment_ids'),
    supabase.rpc('is_super_admin'),
  ])
  if (coTeachingResult.error || superAdminResult.error) return null

  const coTeachingAssignmentIds = Array.isArray(coTeachingResult.data)
    ? coTeachingResult.data.filter((value): value is string => typeof value === 'string')
    : []
  const canManage = superAdminResult.data === true
    || coTeachingAssignmentIds.includes(normalizedAssignmentId)

  return canManage ? assignment as ManagedProctorReportAssignment : null
}
