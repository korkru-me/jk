import type { NextRequest } from 'next/server'
import { authorizeWaitingExam, type SebWaitingRouteParams } from '@/lib/seb-waiting.server'
import { loadWaitingExamResource } from '@/lib/seb-exam-resource.server'
import { EXAM_PRIVATE_HEADERS } from '@/lib/seb-exam-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest, { params }: { params: Promise<SebWaitingRouteParams> }) {
  const deny = () => new Response('ไฟล์นี้ไม่ได้อยู่ในรอบสอบที่กำลังทำ', { status: 403, headers: EXAM_PRIVATE_HEADERS })
  const entries = [...request.nextUrl.searchParams.entries()]
  if (entries.length !== 1 || entries[0][0] !== 'src' || entries[0][1].length > 8192) return deny()
  const access = await authorizeWaitingExam(await params)
  if (!access.ok || access.profile.origin !== request.nextUrl.origin) return deny()
  const { data: receipt, error } = await access.admin.from('submissions').select('id, status, exam_access_mode, seb_config_revision')
    .eq('assignment_id', access.context.assignmentId).eq('student_id', access.user.id)
    .order('attempt_number', { ascending: false }).limit(1).maybeSingle()
  if (error || !receipt || receipt.status !== 'in_progress' || receipt.exam_access_mode !== 'seb' || receipt.seb_config_revision !== access.context.revision) return deny()
  const resource = await loadWaitingExamResource(access.context, receipt.id, entries[0][1])
  if (!resource.ok) return deny()
  return new Response(new Uint8Array(resource.bytes), { headers: { ...EXAM_PRIVATE_HEADERS, 'Content-Type': resource.mimeType, 'Content-Length': String(resource.bytes.length) } })
}
