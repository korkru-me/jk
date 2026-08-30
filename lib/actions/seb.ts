'use server'

import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createSebSessionClaims,
  normalizeSebRequestUrl,
  parseSebVersion,
  readSebEnvironment,
  signSebClaims,
  verifySebClaims,
  verifySebRequestHashes,
  type SebChallengePurpose,
} from '@/lib/seb'
import {
  createSebChallenge,
  sebSessionCookieName,
  validateSebChallenge,
} from '@/lib/seb-session'

interface VerifySebInput {
  assignmentId: string
  challenge: string
  requestUrl: string
  configKeyHash: string
  browserExamKeyHash: string
  version: string
  purpose: SebChallengePurpose
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function requestOrigin(headerStore: Headers) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) {
    try { return new URL(configured).origin } catch { return null }
  }

  const origin = headerStore.get('origin')
  if (origin) {
    try { return new URL(origin).origin } catch { return null }
  }

  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host')
  if (!host) return null
  const protocol = headerStore.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  try { return new URL(`${protocol}://${host}`).origin } catch { return null }
}

export async function verifySafeExamBrowser(input: VerifySebInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'กรุณาเข้าสู่ระบบใหม่' }
  if (!UUID_PATTERN.test(input.assignmentId)) return { error: 'ข้อมูลข้อสอบไม่ถูกต้อง' }

  if (input.purpose !== 'take' && input.purpose !== 'system_check') {
    return { error: 'ประเภทการตรวจสอบ Safe Exam Browser ไม่ถูกต้อง' }
  }

  const environment = readSebEnvironment()
  if (!environment) {
    return { error: 'ระบบ Safe Exam Browser ยังตั้งค่าไม่ครบ กรุณาแจ้งครูผู้สอน' }
  }

  const challengeClaims = verifySebClaims(input.challenge, environment.sessionSecret)
  if (
    challengeClaims?.kind !== 'seb_challenge'
    || challengeClaims.userId !== user.id
    || challengeClaims.assignmentId !== input.assignmentId
    || challengeClaims.purpose !== input.purpose
  ) {
    return { error: 'ลิงก์ตรวจสอบหมดอายุ กรุณากดเริ่มใหม่' }
  }

  const version = parseSebVersion(input.version)
  if (!version) return { error: 'ไม่พบเวอร์ชัน Safe Exam Browser ที่รองรับ' }

  let normalizedRequestUrl: string
  try {
    normalizedRequestUrl = normalizeSebRequestUrl(input.requestUrl)
    const url = new URL(normalizedRequestUrl)
    const origin = requestOrigin(await headers())
    const expectedPath = input.purpose === 'take'
      ? `/assignments/${input.assignmentId}/take`
      : `/assignments/${input.assignmentId}/system-check`
    if (
      !origin
      || url.origin !== origin
      || url.pathname !== expectedPath
      || url.searchParams.get('sebChallenge') !== input.challenge
    ) {
      return { error: 'หน้าที่ใช้ตรวจสอบ Safe Exam Browser ไม่ถูกต้อง' }
    }
  } catch {
    return { error: 'หน้าที่ใช้ตรวจสอบ Safe Exam Browser ไม่ถูกต้อง' }
  }

  const validHashes = verifySebRequestHashes({
    requestUrl: normalizedRequestUrl,
    configKeyHash: input.configKeyHash,
    browserExamKeyHash: input.browserExamKeyHash,
    configKey: environment.configKey,
    browserExamKeys: environment.browserExamKeys,
  })
  if (!validHashes) {
    return { error: 'การตั้งค่า Safe Exam Browser หรือเวอร์ชันไม่ตรงกับที่โรงเรียนอนุญาต' }
  }

  const claims = createSebSessionClaims({
    userId: user.id,
    assignmentId: input.assignmentId,
    platform: version.platform,
    version: version.version,
  })

  if (input.purpose === 'system_check') {
    // Persist only the latest successful pre-attempt verification. The
    // service-role-only RPC independently repeats the published assignment,
    // SEB mode, and current roster-membership checks before writing. Neither
    // request hash nor any device/network identifier crosses this boundary.
    const admin = createAdminClient()
    const { error } = await admin.rpc('record_exam_seb_checkin', {
      p_assignment_id: input.assignmentId,
      p_student_id: user.id,
      p_platform: claims.platform,
      p_version: claims.version,
      p_verified_at: new Date(claims.issuedAt).toISOString(),
      p_valid_until: new Date(claims.expiresAt).toISOString(),
    })
    if (error) {
      return { error: 'บันทึกผลตรวจความพร้อมไม่สำเร็จ กรุณาลองตรวจใหม่หรือแจ้งครูผู้คุมสอบ' }
    }
  }

  const maxAge = Math.floor((claims.expiresAt - Date.now()) / 1_000)
  ;(await cookies()).set(sebSessionCookieName(input.assignmentId), signSebClaims(claims, environment.sessionSecret), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
    priority: 'high',
  })

  return {
    success: true as const,
    platform: version.platform,
    validUntil: new Date(claims.expiresAt).toISOString(),
  }
}

/**
 * Prepare an assignment-specific device check without exposing questions,
 * validating an access code, creating a submission, or starting its timer.
 */
export async function getSebSystemCheckData(
  assignmentId: string,
  sebChallenge?: string,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ', unauthenticated: true as const }
  if (!UUID_PATTERN.test(assignmentId)) return { error: 'ข้อมูลข้อสอบไม่ถูกต้อง' }

  const admin = createAdminClient()
  const [assignmentResult, classroomLinksResult] = await Promise.all([
    admin
      .from('assignments')
      .select('id, title, secure_browser_mode')
      .eq('id', assignmentId)
      .eq('status', 'published')
      .maybeSingle(),
    admin
      .from('assignment_classrooms')
      .select('classroom_id')
      .eq('assignment_id', assignmentId),
  ])

  const assignment = assignmentResult.data
  if (!assignment) return { error: 'ไม่พบชุดข้อสอบที่เผยแพร่แล้ว' }

  const classroomIds = (classroomLinksResult.data ?? []).map(row => row.classroom_id)
  const { data: membership } = classroomIds.length > 0
    ? await admin
        .from('classroom_students')
        .select('id')
        .eq('student_id', user.id)
        .in('classroom_id', classroomIds)
        .limit(1)
        .maybeSingle()
    : { data: null }
  if (!membership) return { error: 'คุณไม่ได้อยู่ในห้องเรียนที่ได้รับข้อสอบนี้' }
  if (assignment.secure_browser_mode !== 'seb_required') {
    return { error: 'ข้อสอบนี้ไม่ได้บังคับใช้ Safe Exam Browser' }
  }

  const reusableChallenge = validateSebChallenge(
    sebChallenge,
    user.id,
    assignmentId,
    'system_check',
  )
  const challenge = reusableChallenge
    ? sebChallenge!
    : createSebChallenge(user.id, assignmentId, 'system_check')

  return {
    success: true as const,
    assignmentTitle: assignment.title,
    challenge,
    sebConfigured: challenge !== null,
  }
}
