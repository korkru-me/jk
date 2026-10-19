'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canManageAssignment } from '@/lib/auth/assignment-access'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import {
  assignmentDeadlineExtensionInputSchema,
  assignmentDeadlineExtensionReceiptSchema,
  assignmentDeadlineExtensionRowSchema,
  assignmentDeadlineExtensionIdSchema,
  assignmentDeadlineExtensionEligibility,
  validateAssignmentDeadlineExtension,
  type AssignmentDeadlineExtensionSnapshot,
  type ExtendAssignmentDeadlineInput,
} from '@/lib/assignment-deadline-extension'

const READ_ERROR = 'โหลดเวลาปิดรับไม่สำเร็จ กรุณาลองใหม่'
const SAVE_ERROR = 'ขยายเวลาไม่สำเร็จ กรุณาลองใหม่'
const STALE_ERROR = 'เวลาปิดรับหรือการตั้งค่างานเปลี่ยนแล้ว กรุณาเปิดหน้าต่างขยายเวลาใหม่'
const UNAVAILABLE_ERROR = 'ระบบขยายเวลายังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง'
const ROW_FIELDS = 'id, title, classroom_id, type, mode, status, start_at, due_at, late_bands, end_at, duration_minutes, updated_at'

async function extensionSession(assignmentId: string) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { error: 'กรุณาเข้าสู่ระบบก่อนขยายเวลา' } as const
  const { data: profile, error: profileError } = await supabase.from('users')
    .select('status, role').eq('id', user.id).maybeSingle()
  if (profileError || !profile || profile.status !== 'active') {
    return { error: 'บัญชีนี้ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ' } as const
  }
  if (profile.role !== 'teacher' && profile.role !== 'admin') {
    const { data: superAdmin, error: superAdminError } = await supabase.from('super_admins')
      .select('user_id').eq('user_id', user.id).maybeSingle()
    if (superAdminError || !superAdmin) return { error: 'เฉพาะผู้สอนที่มีสิทธิ์จัดการงานนี้เท่านั้นที่ขยายเวลาได้' } as const
  }
  if (!await canManageAssignment(assignmentId, user.id)) {
    return { error: 'ไม่พบงานนี้ หรือคุณไม่มีสิทธิ์ขยายเวลา' } as const
  }
  return { supabase } as const
}

type ExtensionSession = Exclude<Awaited<ReturnType<typeof extensionSession>>, { error: string }>

async function readExtensionContext(session: ExtensionSession, assignmentId: string) {
  // These metadata reads remain under the authenticated session's RLS. The
  // access helper above does not grant service-role reads of other rooms.
  const { data, error } = await session.supabase.from('assignments')
    .select(ROW_FIELDS).eq('id', assignmentId).maybeSingle()
  const parsed = assignmentDeadlineExtensionRowSchema.safeParse(data)
  if (error || !parsed.success || parsed.data.id !== assignmentId) return { error: READ_ERROR } as const
  const eligibilityError = assignmentDeadlineExtensionEligibility(parsed.data)
  if (eligibilityError) return { error: eligibilityError } as const

  const links = await fetchAllRows<{ classroom_id: string }>((from, to) => session.supabase
    .from('assignment_classrooms').select('classroom_id').eq('assignment_id', assignmentId)
    .order('classroom_id').range(from, to))
  if (links.error) return { error: READ_ERROR } as const
  const classroomIds = new Set(links.rows.map(link => link.classroom_id))
  const linkedClassroomCount = classroomIds.size || (parsed.data.classroom_id ? 1 : 0)
  if (parsed.data.classroom_id) classroomIds.add(parsed.data.classroom_id)
  if ([...classroomIds].some(id => !assignmentDeadlineExtensionIdSchema.safeParse(id).success)) {
    return { error: READ_ERROR } as const
  }
  return { assignment: parsed.data, classroomIds: [...classroomIds], linkedClassroomCount } as const
}

/** Fresh, authorized metadata for the assignment-wide dialog. No student,
 * answer, access-code, or personal-extension record reaches the browser. */
export async function getAssignmentDeadlineExtension(assignmentId: string): Promise<
  { snapshot: AssignmentDeadlineExtensionSnapshot } | { error: string }
> {
  if (!assignmentDeadlineExtensionIdSchema.safeParse(assignmentId).success) return { error: READ_ERROR }
  try {
    const session = await extensionSession(assignmentId)
    if ('error' in session) return { error: session.error ?? READ_ERROR }
    const context = await readExtensionContext(session, assignmentId)
    if ('error' in context) return { error: context.error ?? READ_ERROR }
    const { assignment, linkedClassroomCount } = context
    return { snapshot: {
      id: assignment.id,
      title: assignment.title,
      endAt: assignment.end_at!,
      updatedAt: assignment.updated_at,
      startAt: assignment.start_at,
      dueAt: assignment.due_at,
      durationMinutes: assignment.duration_minutes,
      linkedClassroomCount,
    } }
  } catch { return { error: READ_ERROR } }
}

/** The database RPC repeats authorization and CAS under the assignment lock,
 * extends the shared close and compatible legacy personal closes atomically,
 * and preserves due dates, late bands, timers, attempts, and scores. There is
 * deliberately no direct-update fallback when its migration is unavailable. */
export async function extendAssignmentDeadline(assignmentId: string, input: ExtendAssignmentDeadlineInput): Promise<
  { success: true; endAt: string; updatedAt: string; warning?: string } | { error: string }
> {
  const parsedInput = assignmentDeadlineExtensionInputSchema.safeParse(input)
  if (!assignmentDeadlineExtensionIdSchema.safeParse(assignmentId).success || !parsedInput.success) {
    return { error: 'ข้อมูลเวลาปิดรับไม่ถูกต้อง กรุณาเปิดหน้าต่างขยายเวลาใหม่' }
  }
  let receipt: { endAt: string; updatedAt: string } | null = null
  try {
    const session = await extensionSession(assignmentId)
    if ('error' in session) return { error: session.error ?? SAVE_ERROR }
    const context = await readExtensionContext(session, assignmentId)
    if ('error' in context) return { error: context.error ?? SAVE_ERROR }
    const { assignment, classroomIds } = context
    const next = parsedInput.data
    if (assignment.end_at !== next.expectedEndAt || assignment.updated_at !== next.expectedUpdatedAt) {
      return { error: STALE_ERROR }
    }
    const validated = validateAssignmentDeadlineExtension(assignment, next.endAt)
    if ('error' in validated) return { error: validated.error }

    const { data, error } = await session.supabase.rpc('extend_assignment_deadline', {
      p_assignment_id: assignmentId,
      p_end_at: validated.endAt,
      p_expected_end_at: next.expectedEndAt,
      p_expected_updated_at: next.expectedUpdatedAt,
    })
    if (error) {
      // Database details can contain table/schema or policy information. Only
      // an allowlisted code is logged; the user receives fixed Thai copy.
      if (error.code === 'PGRST202' || error.code === '42883') {
        console.error('[assignment-deadline-extension] RPC unavailable', { code: error.code })
        return { error: UNAVAILABLE_ERROR }
      }
      if (error.code === '40001' || error.code === 'PT409') return { error: STALE_ERROR }
      if (error.code === '42501') return { error: 'ไม่พบงานนี้ หรือคุณไม่มีสิทธิ์ขยายเวลา' }
      return { error: SAVE_ERROR }
    }
    const parsedReceipt = assignmentDeadlineExtensionReceiptSchema.safeParse(data)
    if (!parsedReceipt.success || parsedReceipt.data.id !== assignmentId
      || Date.parse(parsedReceipt.data.end_at) !== Date.parse(validated.endAt)) {
      return { error: 'ผลการขยายเวลายังไม่ยืนยัน กรุณาโหลดข้อมูลล่าสุดก่อนลองอีกครั้ง' }
    }
    receipt = { endAt: parsedReceipt.data.end_at, updatedAt: parsedReceipt.data.updated_at }
    revalidatePath(`/assignments/${assignmentId}`, 'layout')
    for (const classroomId of classroomIds) revalidatePath(`/classrooms/${classroomId}`, 'layout')
    // Includes student work lists and any classroom linked during the write.
    revalidatePath('/classrooms', 'layout')
    revalidatePath('/assignments')
    revalidatePath('/dashboard')
    return { success: true, ...receipt }
  } catch {
    if (receipt) return {
      success: true, ...receipt,
      warning: 'ขยายเวลาสำเร็จแล้ว แต่ยังรีเฟรชหน้าไม่สำเร็จ กรุณาโหลดหน้าใหม่',
    }
    return { error: 'ติดต่อระบบไม่ได้ ผลการขยายเวลายังไม่ยืนยัน กรุณาโหลดข้อมูลล่าสุดก่อนลองอีกครั้ง' }
  }
}
