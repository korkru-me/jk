import type { NextRequest } from 'next/server'
import { readSebExamContext, validateSebExamContextCsrf } from '@/lib/seb-exam-context.server'
import { authorizeWaitingExam, type SebWaitingRouteParams } from '@/lib/seb-waiting.server'
import { readBoundedExamBody, EXAM_PRIVATE_HEADERS } from '@/lib/seb-exam-http'
import { executeWaitingExamUpload } from '@/lib/seb-exam-resource.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request: NextRequest, { params }: { params: Promise<SebWaitingRouteParams> }) {
  const failure = (status = 403) => Response.json({ error: 'อัปโหลดในห้องสอบไม่สำเร็จ กรุณาลองใหม่' }, { status, headers: EXAM_PRIVATE_HEADERS })
  const scope = await params
  const state = await readSebExamContext({ assignmentId: scope.assignmentId, revision: Number(scope.revision) })
  if (state.status !== 'valid' || request.nextUrl.search || request.headers.has('next-action')
    || !validateSebExamContextCsrf(request.headers.get('x-korkru-seb-csrf') ?? undefined, state.claims)) return failure()
  const access = await authorizeWaitingExam(scope)
  if (!access.ok || access.context.contextId !== state.claims.contextId || access.profile.origin !== request.nextUrl.origin
    || request.headers.get('origin') !== access.profile.origin) return failure()
  const receipt = request.headers.get('x-korkru-seb-upload-receipt')
  const mimeType = request.headers.get('content-type') ?? ''
  if (!receipt || receipt.length > 8192 || !['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(mimeType)) return failure(415)
  const bytes = await readBoundedExamBody(request, 10 * 1024 * 1024)
  if (!bytes) return failure(413)
  const result = await executeWaitingExamUpload(state.claims, receipt, bytes, mimeType)
  if (!result.ok) return failure()
  return Response.json({ success: true }, { headers: EXAM_PRIVATE_HEADERS })
}
