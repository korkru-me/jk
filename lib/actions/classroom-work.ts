'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'
import { isUuid, canManagePracticeLibrary } from '@/lib/practice-library-contracts'
import { authenticatePracticeTeacher, loadPracticeClassroomAccess } from '@/app/(app)/practice/_lib/teacher-data'

const STALE = 'รายการงานเปลี่ยนแปลง กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง'
const FORBIDDEN = 'ไม่มีสิทธิ์จัดกลุ่มงานในห้องเรียนนี้'

async function context(classroomId: string) {
  if (!isPracticeLibraryEnabled(process.env) || !isUuid(classroomId)) return { error: FORBIDDEN } as const
  const supabase = await createClient()
  const actor = await authenticatePracticeTeacher(supabase)
  if (!actor.ok) return { error: actor.error } as const
  const room = await loadPracticeClassroomAccess(supabase, actor.userId, classroomId)
  if (!room || room.status !== 'active' || room.classroom_type !== 'subject' || !canManagePracticeLibrary(room.access)) {
    return { error: FORBIDDEN } as const
  }
  return { supabase, userId: actor.userId } as const
}

export async function setPracticeLibraryCategory(classroomId: string, libraryId: string, categoryId: string | null) {
  if (!isUuid(libraryId) || (categoryId !== null && !isUuid(categoryId))) return { ok: false, error: STALE }
  const ctx = await context(classroomId)
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (categoryId !== null) {
    const { data, error } = await ctx.supabase.from('classroom_assignment_categories')
      .select('id').eq('id', categoryId).eq('classroom_id', classroomId).maybeSingle()
    if (error || !data) return { ok: false, error: STALE }
  }
  // Session RLS and the same-classroom trigger are both enforced on this write.
  const { data, error } = await ctx.supabase.from('practice_libraries')
    .update({ category_id: categoryId }).eq('id', libraryId).eq('classroom_id', classroomId)
    .select('id').maybeSingle()
  if (error || !data) return { ok: false, error: error?.code === '42501' ? FORBIDDEN : STALE }
  revalidatePath(`/classrooms/${classroomId}`)
  return { ok: true }
}

export async function reorderClassroomWork(classroomId: string, orderedIds: string[]) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0 || orderedIds.length > 1000
    || new Set(orderedIds).size !== orderedIds.length
    || orderedIds.some(id => typeof id !== 'string' || !isUuid(id.startsWith('practice:') ? id.slice(9) : id))) {
    return { error: STALE }
  }
  const ctx = await context(classroomId)
  if ('error' in ctx) return { error: ctx.error }
  // Exact actor/room authorization is repeated inside the service-only RPC.
  // Assignment links and practice rows change together, or neither changes.
  const { error } = await createAdminClient().rpc('reorder_classroom_work', {
    p_actor_id: ctx.userId, p_classroom_id: classroomId, p_work_ids: orderedIds,
  })
  if (error) return { error: error.code === '42501' ? FORBIDDEN : STALE }
  revalidatePath(`/classrooms/${classroomId}`)
  return {}
}
