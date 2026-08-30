'use server'

import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import {
  createSebSessionClaims,
  normalizeSebRequestUrl,
  parseSebVersion,
  readSebEnvironment,
  signSebClaims,
  verifySebClaims,
  verifySebRequestHashes,
} from '@/lib/seb'
import { sebSessionCookieName } from '@/lib/seb-session'

interface VerifySebInput {
  assignmentId: string
  challenge: string
  requestUrl: string
  configKeyHash: string
  browserExamKeyHash: string
  version: string
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

  const environment = readSebEnvironment()
  if (!environment) {
    return { error: 'ระบบ Safe Exam Browser ยังตั้งค่าไม่ครบ กรุณาแจ้งครูผู้สอน' }
  }

  const challengeClaims = verifySebClaims(input.challenge, environment.sessionSecret)
  if (
    challengeClaims?.kind !== 'seb_challenge'
    || challengeClaims.userId !== user.id
    || challengeClaims.assignmentId !== input.assignmentId
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
    if (
      !origin
      || url.origin !== origin
      || url.pathname !== `/assignments/${input.assignmentId}/take`
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
  const maxAge = Math.floor((claims.expiresAt - Date.now()) / 1_000)
  ;(await cookies()).set(sebSessionCookieName(input.assignmentId), signSebClaims(claims, environment.sessionSecret), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
    priority: 'high',
  })

  return { success: true as const, platform: version.platform }
}
