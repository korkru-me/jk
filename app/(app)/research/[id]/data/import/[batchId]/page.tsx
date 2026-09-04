import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import type {
  EducationResearchImportBatch,
  EducationResearchImportBatchRow,
  EducationResearchMeasurement,
  EducationResearchScore,
} from '@/lib/types'
import { ResearchProjectNav } from '../../../_components/research-project-nav'
import { ResearchExcelPreviewClient } from '../_components/research-excel-preview-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ตรวจคะแนนก่อนนำเข้า — KorKru' }

export default async function ResearchExcelPreviewPage({ params }: { params: Promise<{ id: string; batchId: string }> }) {
  const { id, batchId } = await params
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data: project } = await supabase
    .from('education_research_projects')
    .select('id, org_id, title, topic')
    .eq('id', id)
    .maybeSingle()
  if (!project) notFound()
  const { data: canManage } = await supabase.rpc('can_manage_education_research_project', { p_project_id: project.id, p_org_id: project.org_id })
  if (canManage !== true) redirect(`/research/${project.id}/data`)

  const [batchResult, rowsResult, measurementsResult, participantsResult, scoresResult] = await Promise.all([
    supabase.from('education_research_import_batches').select('*').eq('id', batchId).eq('project_id', project.id).maybeSingle(),
    fetchAllRows<EducationResearchImportBatchRow>((from, to) => supabase
      .from('education_research_import_batch_rows')
      .select('*')
      .eq('batch_id', batchId)
      .eq('project_id', project.id)
      .order('row_number', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to), { maxRows: 2000 }),
    supabase.from('education_research_measurements').select('*').eq('project_id', project.id),
    fetchAllRows<{ id: string }>((from, to) => supabase
      .from('education_research_participants')
      .select('id')
      .eq('project_id', project.id)
      .order('id', { ascending: true })
      .range(from, to), { maxRows: 2000 }),
    fetchAllRows<EducationResearchScore>((from, to) => supabase
      .from('education_research_scores')
      .select('*')
      .eq('project_id', project.id)
      .order('participant_id', { ascending: true })
      .order('measurement_id', { ascending: true })
      .range(from, to)),
  ])
  if (
    batchResult.error
    || rowsResult.error
    || measurementsResult.error
    || participantsResult.error
    || scoresResult.error
  ) {
    throw new Error('Failed to load education research import preview')
  }
  if (!batchResult.data) notFound()

  const measurements = (measurementsResult.data ?? []) as EducationResearchMeasurement[]
  const pretest = measurements.find(item => item.measurement_type === 'pretest') ?? null
  const posttest = measurements.find(item => item.measurement_type === 'posttest') ?? null
  const participants = participantsResult.rows
  const scores = scoresResult.rows
  const scoreByKey = new Set(scores.map(score => `${score.participant_id}:${score.measurement_id}`))
  const pairedCount = participants.filter(participant => pretest && posttest && scoreByKey.has(`${participant.id}:${pretest.id}`) && scoreByKey.has(`${participant.id}:${posttest.id}`)).length

  return (
    <div className="space-y-6">
      <div><p className="text-sm text-muted-foreground"><Link href="/research" className="hover:underline">วิจัยการศึกษา</Link> / <Link href={`/research/${project.id}/data`} className="hover:underline">ข้อมูลคะแนน</Link> / ตรวจสอบ Excel</p><h1 className="mt-1 text-2xl font-bold text-foreground">{batchResult.data.status === 'confirmed' ? 'นำเข้าคะแนนสำเร็จ' : 'ตรวจสอบข้อมูลก่อนนำเข้า'}</h1><p className="mt-1 text-sm text-muted-foreground">{project.title} · {project.topic}</p></div>
      <ResearchProjectNav projectId={project.id} active="data" />
      <ResearchExcelPreviewClient
        projectId={project.id}
        batch={batchResult.data as EducationResearchImportBatch}
        rows={rowsResult.rows}
        pretestMax={pretest?.max_score === null || pretest?.max_score === undefined ? null : Number(pretest.max_score)}
        posttestMax={posttest?.max_score === null || posttest?.max_score === undefined ? null : Number(posttest.max_score)}
        pairedCount={pairedCount}
        participantCount={participants.length}
      />
    </div>
  )
}
