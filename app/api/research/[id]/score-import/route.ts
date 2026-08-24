import { getAuthUser } from '@/lib/auth/server'
import {
  EducationResearchWorkbookError,
  parseEducationResearchScoreWorkbook,
} from '@/lib/education-research-excel'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
  'application/zip',
])

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) return jsonError('กรุณาเข้าสู่ระบบก่อนอัปโหลดไฟล์', 401)

  const supabase = await createClient()
  const { data: project } = await supabase.from('education_research_projects').select('id, org_id').eq('id', id).maybeSingle()
  if (!project) return jsonError('ไม่พบโครงการวิจัย', 404)
  const { data: canManage } = await supabase.rpc('can_manage_education_research_project', {
    p_project_id: project.id,
    p_org_id: project.org_id,
  })
  if (canManage !== true) return jsonError('คุณไม่มีสิทธิ์นำเข้าคะแนนของโครงการนี้', 403)

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return jsonError('อ่านข้อมูลอัปโหลดไม่ได้ กรุณาเลือกไฟล์ใหม่', 400)
  }
  const file = formData.get('file')
  if (!(file instanceof File)) return jsonError('กรุณาเลือกไฟล์ Excel', 400)
  if (!file.name.toLocaleLowerCase('en-US').endsWith('.xlsx')) return jsonError('รองรับเฉพาะไฟล์ .xlsx ที่ดาวน์โหลดจาก KorKru', 400)
  if (file.size === 0) return jsonError('ไฟล์ว่างเปล่า กรุณาเลือกไฟล์ใหม่', 400)
  if (file.size > MAX_FILE_SIZE) return jsonError('ไฟล์มีขนาดเกิน 5 MB', 413)
  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) return jsonError('ชนิดไฟล์ไม่ถูกต้อง กรุณาใช้ไฟล์ .xlsx', 400)

  try {
    const parsed = await parseEducationResearchScoreWorkbook(Buffer.from(await file.arrayBuffer()))
    if (parsed.project_id !== project.id) return jsonError('ไฟล์นี้เป็นของโครงการวิจัยอื่น กรุณาดาวน์โหลดแม่แบบจากโครงการนี้', 400)

    const { data: template } = await supabase
      .from('education_research_import_templates')
      .select('id, version, project_id')
      .eq('id', parsed.template_id)
      .eq('project_id', project.id)
      .maybeSingle()
    if (!template || template.version !== parsed.template_version) {
      return jsonError('ไม่พบแม่แบบรุ่นนี้ในโครงการ กรุณาดาวน์โหลดแม่แบบใหม่', 400)
    }

    const { data: batchId, error } = await supabase.rpc('create_education_research_import_batch', {
      p_project_id: project.id,
      p_template_id: parsed.template_id,
      p_file_name: file.name,
      p_rows: parsed.rows,
    })
    if (error || typeof batchId !== 'string') {
      return jsonError('ตรวจไฟล์ไม่สำเร็จ กรุณาตรวจว่าไม่ได้เพิ่ม ลบ หรือสลับรายชื่อนักเรียน', 400)
    }
    return Response.json({
      batch_id: batchId,
      preview_url: `/research/${project.id}/data/import/${batchId}`,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof EducationResearchWorkbookError) return jsonError(error.message, 400)
    return jsonError('เปิดไฟล์ Excel ไม่สำเร็จ กรุณาดาวน์โหลดแม่แบบใหม่แล้วลองอีกครั้ง', 400)
  }
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}
