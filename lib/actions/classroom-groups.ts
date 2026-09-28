'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  MAX_GROUPS_PER_CLASSROOM,
  defaultGroupName,
  isGroupColorId,
  nextGroupColor,
  normalizeGroupName,
  splitIntoGroups,
  type ClassroomGroup,
} from '@/lib/classroom-groups'

// กลุ่มย่อยของห้องเรียน. Every action authorizes the exact classroom first
// (owner, or co-teacher admin/manage — the same rule as the tab's other
// management buttons) and then writes through the session client, so the RLS
// policies of migration 20260926232639 still stand behind it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_PERMISSION = 'ไม่มีสิทธิ์จัดกลุ่มในห้องเรียนนี้'
const STALE = 'ข้อมูลบนหน้าไม่ตรงกับล่าสุด กรุณารีเฟรชหน้าแล้วลองอีกครั้ง'
const GROUP_COLUMNS = 'id, classroom_id, name, color, position'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

async function authorize(classroomId: string): Promise<{ userId: string } | { error: string }> {
  if (!UUID.test(classroomId)) return { error: STALE }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const admin = createAdminClient()
  const { data: classroom } = await admin
    .from('classrooms').select('teacher_id').eq('id', classroomId).maybeSingle()
  if (!classroom) return { error: NO_PERMISSION }
  if (classroom.teacher_id === user.id) return { userId: user.id }
  const { data: coTeacher } = await admin
    .from('classroom_co_teachers')
    .select('permission')
    .eq('classroom_id', classroomId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (coTeacher?.permission === 'admin' || coTeacher?.permission === 'manage') return { userId: user.id }
  return { error: NO_PERMISSION }
}

function writeError(error: { code?: string } | null): string {
  if (error?.code === '42501') return NO_PERMISSION
  // FK: the student left the room, or the group was deleted in another tab.
  if (error?.code === '23503') return STALE
  return 'บันทึกกลุ่มไม่สำเร็จ กรุณาลองใหม่'
}

async function groupsOf(classroomId: string): Promise<ClassroomGroup[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('classroom_groups')
    .select(GROUP_COLUMNS)
    .eq('classroom_id', classroomId)
    .order('position')
    .order('created_at')
  return (data ?? []) as ClassroomGroup[]
}

// ── Groups ─────────────────────────────────────────────────────────────────

export async function createClassroomGroup(
  classroomId: string,
  input: { name: string; color: string },
): Promise<Result<{ group: ClassroomGroup }>> {
  const auth = await authorize(classroomId)
  if ('error' in auth) return { ok: false, error: auth.error }

  const name = normalizeGroupName(input.name)
  if (!name) return { ok: false, error: 'กรุณาตั้งชื่อกลุ่ม (ไม่เกิน 60 ตัวอักษร)' }
  if (!isGroupColorId(input.color)) return { ok: false, error: 'สีกลุ่มไม่ถูกต้อง' }

  const existing = await groupsOf(classroomId)
  if (existing.length >= MAX_GROUPS_PER_CLASSROOM) {
    return { ok: false, error: `ห้องหนึ่งมีได้ไม่เกิน ${MAX_GROUPS_PER_CLASSROOM} กลุ่ม` }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('classroom_groups')
    .insert({
      classroom_id: classroomId,
      name,
      color: input.color,
      position: existing.reduce((max, g) => Math.max(max, g.position), -1) + 1,
      created_by: auth.userId,
    })
    .select(GROUP_COLUMNS)
    .single()
  if (error || !data) return { ok: false, error: writeError(error) }
  return { ok: true, group: data as ClassroomGroup }
}

export async function updateClassroomGroup(
  classroomId: string,
  groupId: string,
  patch: { name?: string; color?: string },
): Promise<Result<{ group: ClassroomGroup }>> {
  const auth = await authorize(classroomId)
  if ('error' in auth) return { ok: false, error: auth.error }
  if (!UUID.test(groupId)) return { ok: false, error: STALE }

  const update: { name?: string; color?: string } = {}
  if (patch.name !== undefined) {
    const name = normalizeGroupName(patch.name)
    if (!name) return { ok: false, error: 'กรุณาตั้งชื่อกลุ่ม (ไม่เกิน 60 ตัวอักษร)' }
    update.name = name
  }
  if (patch.color !== undefined) {
    if (!isGroupColorId(patch.color)) return { ok: false, error: 'สีกลุ่มไม่ถูกต้อง' }
    update.color = patch.color
  }
  if (Object.keys(update).length === 0) return { ok: false, error: STALE }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('classroom_groups')
    .update(update)
    .eq('id', groupId)
    .eq('classroom_id', classroomId)
    .select(GROUP_COLUMNS)
    .maybeSingle()
  if (error) return { ok: false, error: writeError(error) }
  if (!data) return { ok: false, error: STALE }
  return { ok: true, group: data as ClassroomGroup }
}

/**
 * Deleting a group puts its students back in "ยังไม่ได้จัดกลุ่ม" (the member
 * rows cascade) and takes the group out of every งาน it was chosen for. A งาน
 * whose only group this was then reaches nobody in that room — never, by
 * accident, the whole room.
 */
export async function deleteClassroomGroup(classroomId: string, groupId: string): Promise<Result> {
  const auth = await authorize(classroomId)
  if ('error' in auth) return { ok: false, error: auth.error }
  if (!UUID.test(groupId)) return { ok: false, error: STALE }

  const supabase = await createClient()
  const { data: deleted, error } = await supabase
    .from('classroom_groups')
    .delete()
    .eq('id', groupId)
    .eq('classroom_id', classroomId)
    .select('id')
  if (error) return { ok: false, error: writeError(error) }
  if (!deleted || deleted.length === 0) return { ok: false, error: STALE }

  // assignment_classrooms has no UPDATE policy for the browser role; the
  // teacher's right to this classroom was checked above, and the update is
  // pinned to this classroom's rows that name this exact group.
  const admin = createAdminClient()
  const { data: links } = await admin
    .from('assignment_classrooms')
    .select('id, group_ids')
    .eq('classroom_id', classroomId)
    .contains('group_ids', [groupId])
  await Promise.all(((links ?? []) as { id: string; group_ids: string[] }[]).map(link =>
    admin
      .from('assignment_classrooms')
      .update({ group_ids: link.group_ids.filter(id => id !== groupId) })
      .eq('id', link.id)
      .eq('classroom_id', classroomId),
  ))

  revalidatePath(`/classrooms/${classroomId}`)
  return { ok: true }
}

export async function reorderClassroomGroups(classroomId: string, orderedIds: string[]): Promise<Result> {
  const auth = await authorize(classroomId)
  if ('error' in auth) return { ok: false, error: auth.error }
  if (!Array.isArray(orderedIds) || orderedIds.some(id => typeof id !== 'string' || !UUID.test(id))) {
    return { ok: false, error: STALE }
  }

  const existing = await groupsOf(classroomId)
  const known = new Set(existing.map(g => g.id))
  if (orderedIds.length !== known.size || orderedIds.some(id => !known.has(id))) {
    return { ok: false, error: STALE }
  }

  const supabase = await createClient()
  const results = await Promise.all(orderedIds.map((id, position) =>
    supabase.from('classroom_groups').update({ position }).eq('id', id).eq('classroom_id', classroomId),
  ))
  const failed = results.find(r => r.error)
  if (failed) return { ok: false, error: writeError(failed.error) }
  return { ok: true }
}

// ── Members ────────────────────────────────────────────────────────────────

/**
 * Put these students into `groupId`, or back into "ยังไม่ได้จัดกลุ่ม" with
 * null. One call covers a single drag and a whole ticked list alike.
 */
export async function moveStudentsToGroup(
  classroomId: string,
  studentIds: string[],
  groupId: string | null,
): Promise<Result> {
  const auth = await authorize(classroomId)
  if ('error' in auth) return { ok: false, error: auth.error }
  if (!Array.isArray(studentIds) || studentIds.length === 0 || studentIds.length > 500) {
    return { ok: false, error: STALE }
  }
  if (studentIds.some(id => typeof id !== 'string' || !UUID.test(id))) return { ok: false, error: STALE }
  if (groupId !== null && !UUID.test(groupId)) return { ok: false, error: STALE }

  const supabase = await createClient()
  const { error } = groupId === null
    ? await supabase
        .from('classroom_group_members')
        .delete()
        .eq('classroom_id', classroomId)
        .in('student_id', studentIds)
    // Composite FKs make the database refuse a student who is not on this
    // room's roster, or a group of another room — no separate check needed.
    : await supabase
        .from('classroom_group_members')
        .upsert(
          studentIds.map(student_id => ({ classroom_id: classroomId, student_id, group_id: groupId })),
          { onConflict: 'classroom_id,student_id' },
        )
  if (error) return { ok: false, error: writeError(error) }
  return { ok: true }
}

/**
 * แบ่งกลุ่มสุ่ม: deal every student on the roster into the room's groups,
 * sizes differing by at most one. With no groups yet, `createCount` groups
 * are made first ("กลุ่มที่ 1" …). Replaces any arrangement already there —
 * the screen asks before calling this.
 */
export async function randomizeClassroomGroups(
  classroomId: string,
  createCount?: number,
): Promise<Result<{ groups: ClassroomGroup[]; members: Record<string, string> }>> {
  const auth = await authorize(classroomId)
  if ('error' in auth) return { ok: false, error: auth.error }

  let groups = await groupsOf(classroomId)
  const supabase = await createClient()

  if (groups.length === 0) {
    const count = Number(createCount)
    if (!Number.isInteger(count) || count < 2 || count > MAX_GROUPS_PER_CLASSROOM) {
      return { ok: false, error: `จำนวนกลุ่มต้องอยู่ระหว่าง 2–${MAX_GROUPS_PER_CLASSROOM}` }
    }
    const names: string[] = []
    const colors: string[] = []
    const rows = Array.from({ length: count }, (_, position) => {
      const name = defaultGroupName(names)
      const color = nextGroupColor(colors)
      names.push(name)
      colors.push(color)
      return { classroom_id: classroomId, name, color, position, created_by: auth.userId }
    })
    const { data, error } = await supabase.from('classroom_groups').insert(rows).select(GROUP_COLUMNS)
    if (error || !data) return { ok: false, error: writeError(error) }
    groups = (data as ClassroomGroup[]).sort((a, b) => a.position - b.position)
  }

  // Roster read with the service role, like the classroom page itself does —
  // this classroom was authorized above.
  const admin = createAdminClient()
  const { data: roster } = await admin
    .from('classroom_students')
    .select('student_id')
    .eq('classroom_id', classroomId)
  const studentIds = (roster ?? []).map((r: { student_id: string }) => r.student_id)

  const placement = splitIntoGroups(studentIds, groups.map(g => g.id))
  if (placement.size > 0) {
    const { error } = await supabase
      .from('classroom_group_members')
      .upsert(
        [...placement].map(([student_id, group_id]) => ({ classroom_id: classroomId, student_id, group_id })),
        { onConflict: 'classroom_id,student_id' },
      )
    if (error) return { ok: false, error: writeError(error) }
  }

  return { ok: true, groups, members: Object.fromEntries(placement) }
}
