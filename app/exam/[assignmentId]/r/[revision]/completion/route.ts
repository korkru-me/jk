import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { readWaitingCompletion } from '@/lib/seb-exam-completion.server'
import { loadWaitingSebArtifact } from '@/lib/seb-waiting-release.server'
import { sebSessionCookieName } from '@/lib/seb-session'
import { EXAM_PRIVATE_HEADERS } from '@/lib/seb-exam-http'
import type { SebWaitingRouteParams } from '@/lib/seb-waiting.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest, { params }: { params: Promise<SebWaitingRouteParams> }) {
  // Denials are ordinary text at an extensionless URL, not a corrupt .seb
  // response. This HTTP property does not prove native failure recovery.
  const deny = (status: number) => new Response('ยังไม่สามารถออกได้ กรุณายืนยันการส่งข้อสอบหรือขอรหัสออกจากครู', {
    status, headers: { ...EXAM_PRIVATE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
  })
  if (request.nextUrl.search || request.headers.has('next-action')) return deny(403)
  const completed = await readWaitingCompletion(await params)
  if (!completed || completed.profile.origin !== request.nextUrl.origin) return deny(403)
  const artifact = await loadWaitingSebArtifact(completed.profile, 'terminal')
  if (!artifact.ok) return deny(503)
  // Clear native entry verification: the terminal config has different keys
  // and cannot retain a start grant through the old session cookie.
  const jar = await cookies()
  jar.delete(sebSessionCookieName(completed.context.assignmentId))
  // Presentation hint only; committed server receipt is rechecked on every GET.
  jar.set('korkru-seb-completion-ready', completed.context.contextId, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 900 })
  return new Response(new Uint8Array(artifact.bytes), {
    headers: { ...EXAM_PRIVATE_HEADERS, 'Content-Type': 'application/seb', 'Content-Disposition': 'attachment; filename="korkru-exam-completed.seb"', 'Content-Length': String(artifact.sizeBytes) },
  })
}
