import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import type { EducationResearchMeasurement } from '@/lib/types'
import { ResearchProjectNav } from '../../_components/research-project-nav'
import { ResearchExcelImportClient } from './_components/research-excel-import-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'นำเข้าคะแนน Excel — KorKru' }

export default async function ResearchExcelImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data: project } = await supabase
    .from('education_research_projects')
    .select('id, org_id, title, topic, classrooms(name)')
    .eq('id', id)
    .maybeSingle()
  if (!project) notFound()
  const { data: canManage } = await supabase.rpc('can_manage_education_research_project', { p_project_id: project.id, p_org_id: project.org_id })
  if (canManage !== true) redirect(`/research/${project.id}/data`)

  const [measurementsResult, participantsResult] = await Promise.all([
    supabase.from('education_research_measurements').select('*').eq('project_id', project.id),
    supabase.from('education_research_participants').select('id', { count: 'exact', head: true }).eq('project_id', project.id),
  ])
  const measurements = (measurementsResult.data ?? []) as EducationResearchMeasurement[]
  const pretest = measurements.find(item => item.measurement_type === 'pretest') ?? null
  const posttest = measurements.find(item => item.measurement_type === 'posttest') ?? null
  if (pretest?.source_type !== 'excel' && posttest?.source_type !== 'excel') redirect(`/research/${project.id}/data`)

  return (
    <div className="space-y-6">
      <div><p className="text-sm text-muted-foreground"><Link href="/research" className="hover:underline">วิจัยการศึกษา</Link> / <Link href={`/research/${project.id}/data`} className="hover:underline">ข้อมูลคะแนน</Link> / นำเข้า Excel</p><h1 className="mt-1 text-2xl font-bold text-foreground">ดาวน์โหลดแม่แบบและนำเข้าคะแนน</h1><p className="mt-1 text-sm text-muted-foreground">{project.title} · {project.topic}</p></div>
      <ResearchProjectNav projectId={project.id} active="data" />
      <ResearchExcelImportClient
        projectId={project.id}
        classroomName={(project.classrooms as unknown as { name: string } | null)?.name ?? 'ไม่พบห้องเรียน'}
        participantCount={participantsResult.count ?? 0}
        pretest={pretest ? { source_type: pretest.source_type, max_score: pretest.max_score === null ? null : Number(pretest.max_score) } : null}
        posttest={posttest ? { source_type: posttest.source_type, max_score: posttest.max_score === null ? null : Number(posttest.max_score) } : null}
      />
    </div>
  )
}
