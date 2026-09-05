import { getAuthUser } from '@/lib/auth/server'
import {
  buildEducationResearchScoreWorkbook,
  educationResearchWorkbookFileName,
  type EducationResearchExcelTemplateRow,
} from '@/lib/education-research-excel'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import type { EducationResearchMeasurement, EducationResearchScore } from '@/lib/types'

export const dynamic = 'force-dynamic'

type TemplateRow = {
  participant_id: string
  row_token: string
  roster_order_snapshot: number | null
  student_code_snapshot: string | null
  full_name_snapshot: string
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) return jsonError('กรุณาเข้าสู่ระบบก่อนดาวน์โหลดแม่แบบ', 401)

  const supabase = await createClient()
  const { data: project } = await supabase
    .from('education_research_projects')
    .select('id, org_id, title, topic, classrooms(name)')
    .eq('id', id)
    .maybeSingle()
  if (!project) return jsonError('ไม่พบโครงการวิจัย', 404)

  const { data: canManage } = await supabase.rpc('can_manage_education_research_project', {
    p_project_id: project.id,
    p_org_id: project.org_id,
  })
  if (canManage !== true) return jsonError('คุณไม่มีสิทธิ์ดาวน์โหลดข้อมูลคะแนนของโครงการนี้', 403)

  const { data: templateId, error: templateError } = await supabase.rpc('create_education_research_import_template', {
    p_project_id: project.id,
  })
  if (templateError || typeof templateId !== 'string') {
    return jsonError('สร้างแม่แบบไม่สำเร็จ กรุณาตรวจแหล่งคะแนนและรายชื่อผู้เข้าร่วม', 400)
  }

  const [templateResult, templateRowsResult, measurementsResult, scoresResult] = await Promise.all([
    supabase.from('education_research_import_templates').select('id, version').eq('id', templateId).single(),
    fetchAllRows<TemplateRow>((from, to) => supabase
      .from('education_research_import_template_rows')
      .select('participant_id, row_token, roster_order_snapshot, student_code_snapshot, full_name_snapshot')
      .eq('template_id', templateId)
      .order('roster_order_snapshot', { ascending: true, nullsFirst: false })
      .order('participant_id', { ascending: true })
      .range(from, to), { maxRows: 2000 }),
    supabase.from('education_research_measurements').select('*').eq('project_id', project.id),
    fetchAllRows<EducationResearchScore>((from, to) => supabase
      .from('education_research_scores')
      .select('*')
      .eq('project_id', project.id)
      .order('participant_id', { ascending: true })
      .order('measurement_id', { ascending: true })
      .range(from, to)),
  ])
  if (!templateResult.data || templateRowsResult.error || measurementsResult.error || scoresResult.error) {
    return jsonError('เตรียมข้อมูลแม่แบบไม่สำเร็จ กรุณาลองใหม่', 500)
  }

  const measurements = (measurementsResult.data ?? []) as EducationResearchMeasurement[]
  const scores = scoresResult.rows
  const pretest = measurements.find(item => item.measurement_type === 'pretest') ?? null
  const posttest = measurements.find(item => item.measurement_type === 'posttest') ?? null
  const scoreByKey = new Map(scores.map(score => [`${score.participant_id}:${score.measurement_id}`, Number(score.raw_score)]))
  const templateRows = templateRowsResult.rows
  const rows: EducationResearchExcelTemplateRow[] = templateRows.map(row => ({
    row_token: row.row_token,
    roster_order: row.roster_order_snapshot,
    student_code: row.student_code_snapshot,
    full_name: row.full_name_snapshot,
    current_pretest: pretest ? scoreByKey.get(`${row.participant_id}:${pretest.id}`) ?? null : null,
    current_posttest: posttest ? scoreByKey.get(`${row.participant_id}:${posttest.id}`) ?? null : null,
  }))

  try {
    const workbook = await buildEducationResearchScoreWorkbook({
      project: {
        id: project.id,
        title: project.title,
        topic: project.topic,
        classroom_name: (project.classrooms as unknown as { name: string } | null)?.name ?? 'ไม่พบห้องเรียน',
      },
      template: { id: templateResult.data.id, version: templateResult.data.version },
      pretest: pretest ? { source_type: pretest.source_type, max_score: pretest.max_score === null ? null : Number(pretest.max_score) } : null,
      posttest: posttest ? { source_type: posttest.source_type, max_score: posttest.max_score === null ? null : Number(posttest.max_score) } : null,
      rows,
    })
    const fileName = educationResearchWorkbookFileName(project.title)
    return new Response(new Uint8Array(workbook), {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Disposition': `attachment; filename="KorKru-research-scores.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return jsonError('สร้างไฟล์ Excel ไม่สำเร็จ กรุณาลองใหม่', 500)
  }
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}
