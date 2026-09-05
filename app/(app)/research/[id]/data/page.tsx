import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { LockKeyhole } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows, fetchRowsInChunks } from '@/lib/supabase/fetch-all-rows'
import type {
  EducationResearchMeasurement,
  EducationResearchProject,
  EducationResearchScore,
  EducationResearchScoreHistory,
  StudentProfile,
} from '@/lib/types'
import { ResearchProjectNav } from '../_components/research-project-nav'
import { ResearchScoreDataClient, type ResearchScoreDataRow } from './_components/research-score-data-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ข้อมูลคะแนนงานวิจัย — KorKru' }

type ProjectRow = EducationResearchProject & { classrooms: { name: string } | null }
type ParticipantQueryRow = {
  id: string
  student_id: string
  roster_order: number | null
  users: { id: string; full_name: string } | null
}
type ActorRow = { id: string; full_name: string }
type ProfileRow = Pick<StudentProfile, 'student_id' | 'student_code' | 'class_number'>

export default async function ResearchScoreDataPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string }> }) {
  const { id } = await params
  const query = await searchParams
  const authUser = await getAuthUser()
  if (!authUser) redirect('/login')

  const supabase = await createClient()
  const { data: projectData, error: projectError } = await supabase
    .from('education_research_projects')
    .select('id, org_id, classroom_id, created_by, title, topic, research_design, status, passing_threshold_percent, significance_level, criterion_test_sides, completed_at, created_at, updated_at, classrooms(name)')
    .eq('id', id)
    .maybeSingle()

  if (projectError || !projectData) notFound()
  const project = projectData as unknown as ProjectRow
  const { data: canManage } = await supabase.rpc('can_manage_education_research_project', {
    p_project_id: project.id,
    p_org_id: project.org_id,
  })

  if (canManage !== true) {
    return (
      <div className="space-y-6">
        <div><p className="text-sm text-muted-foreground"><Link href="/research" className="hover:underline">วิจัยการศึกษา</Link> / ข้อมูลคะแนน</p><h1 className="mt-1 text-2xl font-bold text-foreground">{project.title}</h1></div>
        <ResearchProjectNav projectId={project.id} active="data" />
        <Card padding="xl" className="border-warning/30">
          <div className="flex gap-3"><LockKeyhole className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" /><div><h2 className="font-semibold text-foreground">ดูข้อมูลคะแนนรายคนไม่ได้</h2><p className="mt-1 text-sm text-muted-foreground">สิทธิ์ดูอย่างเดียวเปิดได้เฉพาะภาพรวมโครงการ ข้อมูลนักเรียนและคะแนนต้องใช้สิทธิ์จัดการห้องเรียน</p><Button className="mt-4" variant="outline" render={<Link href={`/research/${project.id}`} />}>กลับภาพรวม</Button></div></div>
        </Card>
      </div>
    )
  }

  const [measurementsResult, participantsResult, scoresResult, historiesResult] = await Promise.all([
    supabase
      .from('education_research_measurements')
      .select('id, org_id, project_id, measurement_type, source_type, assignment_id, max_score, selection_mode, source_set_id, source_sections, source_question_ids, snapshot_question_ids, duration_minutes, created_at, updated_at')
      .eq('project_id', project.id),
    fetchAllRows<ParticipantQueryRow>((from, to) => supabase
      .from('education_research_participants')
      .select('id, student_id, roster_order, users(id, full_name)')
      .eq('project_id', project.id)
      .order('roster_order', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: ParticipantQueryRow[] | null; error: unknown }>),
    fetchAllRows<EducationResearchScore>((from, to) => supabase
      .from('education_research_scores')
      .select('*')
      .eq('project_id', project.id)
      .order('participant_id', { ascending: true })
      .order('measurement_id', { ascending: true })
      .range(from, to)),
    fetchAllRows<EducationResearchScoreHistory>((from, to) => supabase
      .from('education_research_score_history')
      .select('*')
      .eq('project_id', project.id)
      .order('changed_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to), { maxRows: 2000 }),
  ])

  if (
    measurementsResult.error
    || participantsResult.error
    || scoresResult.error
    || historiesResult.error
  ) {
    throw new Error('Failed to load education research score data')
  }

  const measurements = (measurementsResult.data ?? []) as EducationResearchMeasurement[]
  const participants = participantsResult.rows
  const scores = scoresResult.rows
  const histories = historiesResult.rows
  const studentIds = participants.map(participant => participant.student_id)
  const actorIds = [...new Set(histories.map(history => history.changed_by).filter((value): value is string => Boolean(value)))]
  const [profilesResult, actorsResult] = await Promise.all([
    fetchRowsInChunks<ProfileRow, string>(studentIds, chunk => supabase
      .from('student_profiles')
      .select('student_id, student_code, class_number')
      .in('student_id', chunk)),
    fetchRowsInChunks<ActorRow, string>(actorIds, chunk => supabase
      .from('users')
      .select('id, full_name')
      .in('id', chunk)),
  ])

  if (profilesResult.error || actorsResult.error) {
    throw new Error('Failed to load education research score identities')
  }

  const profiles = new Map(profilesResult.rows.map(profile => [profile.student_id, profile]))
  const actorNames = new Map(actorsResult.rows.map(actor => [actor.id, actor.full_name]))
  const pretest = measurements.find(measurement => measurement.measurement_type === 'pretest') ?? null
  const posttest = measurements.find(measurement => measurement.measurement_type === 'posttest') ?? null
  const scoreByKey = new Map(scores.map(score => [`${score.participant_id}:${score.measurement_id}`, score]))
  const historyByKey = new Map<string, Array<EducationResearchScoreHistory & { actor_name: string | null }>>()
  for (const history of histories) {
    const key = `${history.participant_id}:${history.measurement_id}`
    const list = historyByKey.get(key) ?? []
    list.push({ ...history, actor_name: history.changed_by ? actorNames.get(history.changed_by) ?? null : null })
    historyByKey.set(key, list)
  }

  const rows: ResearchScoreDataRow[] = participants.map((participant, index) => {
    const profile = profiles.get(participant.student_id)
    const preScore = pretest ? scoreByKey.get(`${participant.id}:${pretest.id}`) ?? null : null
    const postScore = posttest ? scoreByKey.get(`${participant.id}:${posttest.id}`) ?? null : null
    return {
      participant_id: participant.id,
      student_id: participant.student_id,
      order: participant.roster_order ?? profile?.class_number ?? index + 1,
      full_name: participant.users?.full_name ?? 'ไม่พบชื่อผู้ใช้',
      student_code: profile?.student_code ?? null,
      pretest_score: preScore,
      posttest_score: postScore,
      pretest_history: pretest ? historyByKey.get(`${participant.id}:${pretest.id}`) ?? [] : [],
      posttest_history: posttest ? historyByKey.get(`${participant.id}:${posttest.id}`) ?? [] : [],
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground"><Link href="/research" className="hover:underline">วิจัยการศึกษา</Link> / ข้อมูลคะแนน</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">{project.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{project.topic}</p>
      </div>
      <ResearchProjectNav projectId={project.id} active="data" />
      <ResearchScoreDataClient
        project={{ id: project.id, classroom_name: project.classrooms?.name ?? 'ไม่พบห้องเรียน', passing_threshold_percent: Number(project.passing_threshold_percent) }}
        rows={rows}
        pretest={pretest}
        posttest={posttest}
        initialStatusFilter={query.status === 'missing' ? 'missing' : query.status === 'ready' ? 'ready' : 'all'}
      />
    </div>
  )
}
