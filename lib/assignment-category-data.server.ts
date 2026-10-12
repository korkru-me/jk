import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import {
  isMissingAssignmentCategorySchema,
  type AssignmentCategory,
} from '@/lib/assignment-categories'

type AdminClient = ReturnType<typeof createAdminClient>

export type AssignmentClassroomLinkRow = {
  assignment_id: string
  display_order: number | null
  group_ids: string[] | null
  category_id: string | null
}

export async function getAssignmentClassroomLinks(
  admin: AdminClient,
  classroomId: string,
): Promise<AssignmentClassroomLinkRow[]> {
  const categorized = await admin
    .from('assignment_classrooms')
    .select('assignment_id, display_order, group_ids, category_id')
    .eq('classroom_id', classroomId)

  if (!categorized.error) return (categorized.data ?? []) as AssignmentClassroomLinkRow[]
  if (!isMissingAssignmentCategorySchema(categorized.error)) throw categorized.error

  // A code deploy can briefly lead its schema rollout. Keep existing work
  // visible in that window instead of silently turning a query error into
  // "0 assignments"; categories remain null until the migration catches up.
  const legacy = await admin
    .from('assignment_classrooms')
    .select('assignment_id, display_order, group_ids')
    .eq('classroom_id', classroomId)

  if (legacy.error) throw legacy.error
  return (legacy.data ?? []).map(link => ({ ...link, category_id: null })) as AssignmentClassroomLinkRow[]
}

export async function getAssignmentCategories(
  admin: AdminClient,
  classroomId: string,
): Promise<AssignmentCategory[]> {
  const result = await admin
    .from('classroom_assignment_categories')
    .select('id, classroom_id, name, color, position')
    .eq('classroom_id', classroomId)
    .order('position')
    .order('created_at')

  if (!result.error) return (result.data ?? []) as AssignmentCategory[]
  if (isMissingAssignmentCategorySchema(result.error)) return []
  throw result.error
}
