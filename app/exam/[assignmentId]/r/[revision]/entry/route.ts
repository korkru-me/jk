import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readCurrentAssignmentSebRelease } from '@/lib/seb-assignment-release.server'
import { readWaitingSebProfile, waitingSebFeatureEnabled } from '@/lib/seb-waiting-release-policy'
import { createSebExamContextClaims } from '@/lib/seb-exam-context-core'
import { readSebExamContext, setSebExamContext } from '@/lib/seb-exam-context.server'
import { sebExamRoutePath } from '@/lib/seb-exam-transport-policy'
import type { SebWaitingRouteParams } from '@/lib/seb-waiting.server'

export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest, { params }: { params: Promise<SebWaitingRouteParams> }) {
  if (!waitingSebFeatureEnabled(process.env)) return new Response('ห้องสอบนี้ยังไม่พร้อม', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const scope = await params
  const release = await readCurrentAssignmentSebRelease(scope.assignmentId)
  const profile = release ? readWaitingSebProfile(release) : null
  if (!release || !profile || release.revision !== Number(scope.revision) || profile.origin !== request.nextUrl.origin) {
    return new Response('ห้องสอบนี้ยังไม่พร้อม กรุณาแจ้งครูผู้สอน', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }
  const old = await readSebExamContext()
  if (old.status === 'invalid' || (old.status === 'valid' && (
    old.claims.assignmentId !== release.assignmentId || old.claims.revision !== release.revision || old.claims.releaseId !== release.releaseId
  ))) return new Response('ขอบเขตห้องสอบไม่ถูกต้อง', { status: 403, headers: { 'Cache-Control': 'no-store' } })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (old.status === 'valid' && old.claims.userId && old.claims.userId !== user?.id) {
    return new Response('บัญชีห้องสอบเปลี่ยนแล้ว กรุณาเปิดไฟล์ข้อสอบใหม่', { status: 403, headers: { 'Cache-Control': 'no-store' } })
  }
  const context = old.status === 'valid' ? old.claims : createSebExamContextClaims({
    assignmentId: release.assignmentId, revision: release.revision, releaseId: release.releaseId,
  }, { userId: user?.id ?? null })
  await setSebExamContext(context)
  return NextResponse.redirect(new URL(sebExamRoutePath(context, user && context.userId ? 'waiting' : 'login'), profile.origin), { headers: { 'Cache-Control': 'no-store' } })
}
