import { getAuthUser } from '@/lib/auth/server'
import {
  EDUCATION_RESEARCH_EXPORT_ROW_LIMIT,
  EducationResearchExportError,
  anonymizeEducationResearchRows,
  buildEducationResearchDataExportWorkbook,
  educationResearchDataExportFileName,
  type EducationResearchExportRow,
} from '@/lib/education-research-export'
import { parseEducationResearchExportRequest } from '@/lib/education-research-export-request'
import { selectResearchAnalysisData } from '@/lib/education-research-statistics'
import { encodeRfc5987Filename } from '@/lib/exam-proctor-report'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import type { EducationResearchMeasurement, EducationResearchScore } from '@/lib/types'

export const dynamic = 'force-dynamic'

const PROFILE_LOOKUP_CHUNK_SIZE = 200

type ProjectRow = {
  id: string
  org_id: string
  title: string
  topic: string
  passing_threshold_percent: number | string
  classrooms: { name: string } | null
}

type ParticipantRow = {
  id: string
  student_id?: string
  roster_order: number | null
  created_at: string
  users?: { id: string; full_name: string | null } | null
}

type StudentProfileRow = {
  student_id: string
  student_code: string | null
  class_number: number | null
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return jsonError('ข้อมูลโครงการวิจัยไม่ถูกต้อง', 400)

  const user = await getAuthUser()
  if (!user) return jsonError('กรุณาเข้าสู่ระบบก่อนดาวน์โหลดข้อมูล', 401)

  const parsed = await parseEducationResearchExportRequest(request)
  if (!parsed) return jsonError('ชนิดไฟล์ที่เลือกไม่ถูกต้อง', 400)

  const supabase = await createClient()
  const { data: projectData, error: projectError } = await supabase
    .from('education_research_projects')
    .select('id, org_id, title, topic, passing_threshold_percent, classrooms(name)')
    .eq('id', id)
    .maybeSingle()
  if (projectError) return jsonError('ตรวจสอบโครงการวิจัยไม่สำเร็จ กรุณาลองใหม่', 500)
  if (!projectData) return jsonError('ไม่พบโครงการวิจัย', 404)
  const project = projectData as unknown as ProjectRow

  const { data: canManage, error: permissionError } = await supabase.rpc(
    'can_manage_education_research_project',
    { p_project_id: project.id, p_org_id: project.org_id },
  )
  if (permissionError) return jsonError('ตรวจสอบสิทธิ์โครงการไม่สำเร็จ กรุณาลองใหม่', 500)
  if (canManage !== true) return jsonError('คุณไม่มีสิทธิ์ดาวน์โหลดข้อมูลรายบุคคลของโครงการนี้', 403)

  const participantColumns = parsed.mode === 'identified'
    ? 'id, student_id, roster_order, created_at, users(id, full_name)'
    : 'id, roster_order, created_at'

  const [measurementsResult, participantsResult, scoresResult] = await Promise.all([
    supabase
      .from('education_research_measurements')
      .select('*')
      .eq('project_id', project.id),
    fetchAllRows<ParticipantRow>((from, to) => supabase
      .from('education_research_participants')
      .select(participantColumns)
      .eq('project_id', project.id)
      .order('roster_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: ParticipantRow[] | null; error: unknown }>),
    fetchAllRows<EducationResearchScore>((from, to) => supabase
      .from('education_research_scores')
      .select('*')
      .eq('project_id', project.id)
      .order('participant_id', { ascending: true })
      .order('measurement_id', { ascending: true })
      .range(from, to)),
  ])

  if (measurementsResult.error || participantsResult.error || scoresResult.error) {
    return jsonError('อ่านข้อมูลสำหรับส่งออกไม่สำเร็จ กรุณาลองใหม่', 500)
  }
  const participants = participantsResult.rows
  if (participants.length === 0) return jsonError('โครงการนี้ยังไม่มีผู้เข้าร่วมให้ส่งออก', 400)
  if (participants.length > EDUCATION_RESEARCH_EXPORT_ROW_LIMIT) {
    return jsonError(`ยังไม่ได้สร้างไฟล์ เพราะมีผู้เข้าร่วมเกิน ${EDUCATION_RESEARCH_EXPORT_ROW_LIMIT.toLocaleString('th-TH')} คน`, 413)
  }

  const measurements = (measurementsResult.data ?? []) as EducationResearchMeasurement[]
  const scores = scoresResult.rows
  const pretest = measurements.find(item => item.measurement_type === 'pretest') ?? null
  const posttest = measurements.find(item => item.measurement_type === 'posttest') ?? null
  if (!pretest || !posttest) return jsonError('โครงการนี้ยังกำหนดรอบคะแนนก่อนและหลังเรียนไม่ครบ', 400)

  const pretestMaxScore = positiveNumber(pretest.max_score)
  const posttestMaxScore = positiveNumber(posttest.max_score)
  const thresholdPercent = Number(project.passing_threshold_percent)
  if (pretestMaxScore === null || posttestMaxScore === null
    || !Number.isFinite(thresholdPercent) || thresholdPercent <= 0 || thresholdPercent > 100) {
    return jsonError('คะแนนเต็มหรือเกณฑ์ผ่านของโครงการไม่ถูกต้อง', 400)
  }

  const scoreByKey = new Map(scores.map(score => [
    `${score.participant_id}:${score.measurement_id}`,
    Number(score.raw_score),
  ]))
  const selectionRows = participants.map(participant => ({
    participantId: participant.id,
    pretest: scoreByKey.get(`${participant.id}:${pretest.id}`) ?? null,
    posttest: scoreByKey.get(`${participant.id}:${posttest.id}`) ?? null,
  }))
  const selection = selectResearchAnalysisData(selectionRows)
  const criterionScore = posttestMaxScore * thresholdPercent / 100

  let profiles = new Map<string, StudentProfileRow>()
  if (parsed.mode === 'identified') {
    const studentIds = participants
      .map(participant => participant.student_id)
      .filter((studentId): studentId is string => typeof studentId === 'string')
    if (studentIds.length !== participants.length || new Set(studentIds).size !== participants.length) {
      return jsonError('ตรวจสอบตัวตนผู้เข้าร่วมไม่สำเร็จ กรุณาลองใหม่', 500)
    }
    const profilesResult = await loadStudentProfiles(supabase, studentIds)
    if (profilesResult.error) return jsonError('อ่านรหัสนักเรียนสำหรับส่งออกไม่สำเร็จ กรุณาลองใหม่', 500)
    profiles = profilesResult.profiles
  }

  const baseRows: EducationResearchExportRow[] = participants.map((participant, index) => {
    const pretestScore = scoreByKey.get(`${participant.id}:${pretest.id}`) ?? null
    const posttestScore = scoreByKey.get(`${participant.id}:${posttest.id}`) ?? null
    const profile = participant.student_id ? profiles.get(participant.student_id) : undefined
    const includedPaired = selection.pairedParticipantIds.has(participant.id)
    const includedCriterion = selection.criterionParticipantIds.has(participant.id)
    return {
      order: participant.roster_order ?? profile?.class_number ?? index + 1,
      studentCode: profile?.student_code ?? null,
      fullName: participant.users?.full_name?.trim() || 'ไม่พบชื่อผู้ใช้',
      pretest: pretestScore,
      posttest: posttestScore,
      includedPaired,
      includedCriterion,
      passedCriterion: includedCriterion && posttestScore !== null
        ? posttestScore >= criterionScore
        : null,
      exclusionReason: exclusionReason(pretestScore, posttestScore),
    }
  })
  const exportRows = parsed.mode === 'anonymous'
    ? anonymizeEducationResearchRows(baseRows)
    : baseRows
  const generatedAt = new Date()

  let workbook: Buffer
  try {
    workbook = await buildEducationResearchDataExportWorkbook({
      mode: parsed.mode,
      project: {
        title: project.title,
        topic: project.topic,
        classroomName: project.classrooms?.name ?? 'ไม่พบห้องเรียน',
        thresholdPercent,
      },
      pretestMaxScore,
      posttestMaxScore,
      rows: exportRows,
      generatedAt,
    })
  } catch (error) {
    if (error instanceof EducationResearchExportError) return jsonError(error.message, 400)
    return jsonError('สร้างไฟล์ Excel ไม่สำเร็จ กรุณาลองใหม่', 500)
  }

  const latestScoreUpdatedAt = scores.reduce<string | null>((latest, score) => (
    latest === null || score.updated_at > latest ? score.updated_at : latest
  ), null)
  const admin = createAdminClient()
  const { error: auditError } = await admin.rpc('record_education_research_export_event', {
    p_project_id: project.id,
    p_actor_id: user.id,
    p_export_mode: parsed.mode,
    p_row_count: exportRows.length,
    p_source_score_updated_at: latestScoreUpdatedAt,
  })
  if (auditError) return jsonError('บันทึกประวัติการดาวน์โหลดไม่สำเร็จ จึงยังไม่ได้ส่งไฟล์', 500)

  const fileName = educationResearchDataExportFileName(project.title, parsed.mode)
  return new Response(new Uint8Array(workbook), {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Disposition': `attachment; filename="KorKru-research-data.xlsx"; filename*=UTF-8''${encodeRfc5987Filename(fileName)}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

async function loadStudentProfiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentIds: string[],
): Promise<{ profiles: Map<string, StudentProfileRow>; error: unknown }> {
  const rows: StudentProfileRow[] = []
  for (let offset = 0; offset < studentIds.length; offset += PROFILE_LOOKUP_CHUNK_SIZE) {
    const chunk = studentIds.slice(offset, offset + PROFILE_LOOKUP_CHUNK_SIZE)
    const { data, error } = await supabase
      .from('student_profiles')
      .select('student_id, student_code, class_number')
      .in('student_id', chunk)
    if (error) return { profiles: new Map(), error }
    rows.push(...((data ?? []) as StudentProfileRow[]))
  }
  const profiles = new Map(rows.map(row => [row.student_id, row]))
  return { profiles, error: null }
}

function exclusionReason(pretest: number | null, posttest: number | null): string | null {
  if (pretest === null && posttest === null) return 'ไม่มีคะแนนก่อนเรียนและหลังเรียน'
  if (pretest === null) return 'ไม่มีคะแนนก่อนเรียน'
  if (posttest === null) return 'ไม่มีคะแนนหลังเรียน'
  return null
}

function positiveNumber(value: number | string | null | undefined): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
