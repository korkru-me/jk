'use server'

import { cookies, headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  createAndroidExamSessionClaims,
  isLikelyAndroidUserAgent,
  signAndroidExamSession,
  type AndroidApprovalStatus,
} from '@/lib/android-exam'
import { androidExamSessionCookieName } from '@/lib/android-exam-session'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const APPROVAL_LIFETIME_MS = 12 * 60 * 60_000

export interface AndroidApprovalView {
  id: string
  assignment_id: string
  student_id: string
  status: AndroidApprovalStatus
  requested_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  expires_at: string | null
  updated_at: string
}

function androidRequest(headersStore: Headers) {
  const clientPlatform = headersStore.get('sec-ch-ua-platform')?.replaceAll('"', '')
  return clientPlatform?.toLowerCase() === 'android'
    || isLikelyAndroidUserAgent(headersStore.get('user-agent'))
}

async function getStudentExamContext(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  assignmentId: string,
) {
  const [assignmentResult, linksResult, extensionResult] = await Promise.all([
    admin
      .from('assignments')
      .select('id, org_id, title, status, start_at, end_at, secure_browser_mode, android_exam_mode')
      .eq('id', assignmentId)
      .eq('status', 'published')
      .maybeSingle(),
    admin
      .from('assignment_classrooms')
      .select('classroom_id')
      .eq('assignment_id', assignmentId),
    admin
      .from('assignment_extensions')
      .select('extended_end_at')
      .eq('assignment_id', assignmentId)
      .eq('student_id', userId)
      .maybeSingle(),
  ])

  const assignment = assignmentResult.data
  if (!assignment) return { error: 'ไม่พบข้อสอบที่เผยแพร่แล้ว' as const }
  if (
    assignment.secure_browser_mode !== 'seb_required'
    || assignment.android_exam_mode !== 'monitored'
  ) return { error: 'ข้อสอบนี้ไม่ได้เปิด Android monitored mode' as const }

  const classroomIds = (linksResult.data ?? []).map(row => row.classroom_id)
  const { data: membership } = classroomIds.length > 0
    ? await admin
        .from('classroom_students')
        .select('id')
        .eq('student_id', userId)
        .in('classroom_id', classroomIds)
        .limit(1)
        .maybeSingle()
    : { data: null }
  if (!membership) return { error: 'คุณไม่ได้อยู่ในห้องที่ได้รับข้อสอบนี้' as const }

  const now = Date.now()
  if (assignment.start_at && new Date(assignment.start_at).getTime() > now) {
    return { error: 'ยังไม่ถึงเวลาเปิดสอบ' as const }
  }
  const effectiveEndAt = extensionResult.data?.extended_end_at ?? assignment.end_at
  if (effectiveEndAt && new Date(effectiveEndAt).getTime() < now) {
    return { error: 'หมดเวลาส่งแล้ว' as const }
  }

  return { assignment }
}

export async function requestAndroidExamAccess(assignmentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'กรุณาเข้าสู่ระบบใหม่' }
  if (!UUID_PATTERN.test(assignmentId)) return { error: 'ข้อมูลข้อสอบไม่ถูกต้อง' }
  if (!androidRequest(await headers())) {
    return { error: 'คำขอนี้ใช้ได้เฉพาะเบราว์เซอร์บน Android และยังต้องให้ครูตรวจเครื่องจริง' }
  }

  const admin = createAdminClient()
  const context = await getStudentExamContext(admin, user.id, assignmentId)
  if ('error' in context && context.error) return { error: context.error }

  const { data: current } = await admin
    .from('exam_android_approvals')
    .select('status, expires_at')
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle()
  if (
    current?.status === 'approved'
    && current.expires_at
    && new Date(current.expires_at).getTime() > Date.now()
  ) return { success: true as const, status: 'approved' as const }

  const { error } = await admin
    .from('exam_android_approvals')
    .upsert({
      org_id: context.assignment.org_id,
      assignment_id: assignmentId,
      student_id: user.id,
      status: 'pending',
      requested_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      expires_at: null,
    }, { onConflict: 'assignment_id,student_id' })
  if (error) return { error: 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่' }

  revalidatePath(`/assignments/${assignmentId}/proctor`)
  return { success: true as const, status: 'pending' as const }
}

export async function getAndroidExamApprovalStatus(assignmentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'กรุณาเข้าสู่ระบบใหม่' }
  if (!UUID_PATTERN.test(assignmentId)) return { error: 'ข้อมูลข้อสอบไม่ถูกต้อง' }

  const { data, error } = await supabase
    .from('exam_android_approvals')
    .select('status, expires_at')
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle()
  if (error) return { error: 'ตรวจสถานะคำขอไม่สำเร็จ' }
  if (!data) return { success: true as const, status: 'none' as const }
  if (data.status === 'approved' && data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    return { success: true as const, status: 'expired' as const }
  }
  return {
    success: true as const,
    status: data.status as AndroidApprovalStatus,
  }
}

export async function activateAndroidExamSession(assignmentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'กรุณาเข้าสู่ระบบใหม่' }
  if (!UUID_PATTERN.test(assignmentId)) return { error: 'ข้อมูลข้อสอบไม่ถูกต้อง' }
  if (!androidRequest(await headers())) {
    return { error: 'เปิด Android monitored session ได้จากเครื่อง Android ที่ครูตรวจแล้วเท่านั้น' }
  }

  const admin = createAdminClient()
  const context = await getStudentExamContext(admin, user.id, assignmentId)
  if ('error' in context && context.error) return { error: context.error }
  const { data: approval } = await admin
    .from('exam_android_approvals')
    .select('status, reviewed_at, reviewed_by, expires_at')
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle()
  if (
    approval?.status !== 'approved'
    || !approval.reviewed_at
    || !approval.reviewed_by
    || !approval.expires_at
    || new Date(approval.expires_at).getTime() <= Date.now()
  ) return { error: 'ยังไม่ได้รับอนุมัติจากครู หรือคำอนุมัติหมดอายุแล้ว' }

  const secret = process.env.SEB_SESSION_SECRET?.trim() ?? ''
  if (secret.length < 32) return { error: 'ระบบ session ยังตั้งค่าไม่ครบ กรุณาแจ้งครู' }
  const claims = createAndroidExamSessionClaims({
    userId: user.id,
    assignmentId,
    approvedBy: approval.reviewed_by,
    approvedAt: new Date(approval.reviewed_at).getTime(),
    approvalExpiresAt: new Date(approval.expires_at).getTime(),
  })
  const maxAge = Math.max(1, Math.floor((claims.expiresAt - Date.now()) / 1_000))
  ;(await cookies()).set(
    androidExamSessionCookieName(assignmentId),
    signAndroidExamSession(claims, secret),
    {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge,
      priority: 'high',
    },
  )
  return { success: true as const }
}

export async function reviewAndroidExamAccess(
  assignmentId: string,
  studentId: string,
  decision: 'approve' | 'deny',
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (decision !== 'approve' && decision !== 'deny') return { error: 'คำสั่งอนุมัติไม่ถูกต้อง' }
  if (!UUID_PATTERN.test(assignmentId) || !UUID_PATTERN.test(studentId)) {
    return { error: 'ข้อมูลคำขอไม่ถูกต้อง' }
  }
  const [{ data: actor }, { data: assignment }] = await Promise.all([
    supabase.from('users').select('role').eq('id', user.id).maybeSingle(),
    supabase
      .from('assignments')
      .select('id, org_id, status, secure_browser_mode, android_exam_mode')
      .eq('id', assignmentId)
      .maybeSingle(),
  ])
  if (!actor || actor.role === 'student' || !assignment) {
    return { error: 'ไม่พบข้อสอบหรือไม่มีสิทธิ์อนุมัติ' }
  }
  if (
    assignment.status !== 'published'
    || assignment.secure_browser_mode !== 'seb_required'
    || assignment.android_exam_mode !== 'monitored'
  ) return { error: 'ข้อสอบนี้ไม่ได้เปิด Android monitored mode' }

  const admin = createAdminClient()
  const { data: links } = await admin
    .from('assignment_classrooms')
    .select('classroom_id')
    .eq('assignment_id', assignmentId)
  const classroomIds = (links ?? []).map(row => row.classroom_id)
  const { data: membership } = classroomIds.length > 0
    ? await admin
        .from('classroom_students')
        .select('id')
        .eq('student_id', studentId)
        .in('classroom_id', classroomIds)
        .limit(1)
        .maybeSingle()
    : { data: null }
  if (!membership) return { error: 'นักเรียนไม่ได้อยู่ในห้องที่ได้รับข้อสอบนี้' }

  const reviewedAt = new Date()
  const update = decision === 'approve'
    ? {
        status: 'approved' as const,
        reviewed_at: reviewedAt.toISOString(),
        reviewed_by: user.id,
        expires_at: new Date(reviewedAt.getTime() + APPROVAL_LIFETIME_MS).toISOString(),
      }
    : {
        status: 'denied' as const,
        reviewed_at: reviewedAt.toISOString(),
        reviewed_by: user.id,
        expires_at: null,
      }
  const { data, error } = await admin
    .from('exam_android_approvals')
    .update(update)
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (error || !data) return { error: 'ไม่พบคำขอที่รออนุมัติ หรือมีครูคนอื่นจัดการแล้ว' }

  revalidatePath(`/assignments/${assignmentId}/proctor`)
  return { success: true as const, status: update.status }
}
