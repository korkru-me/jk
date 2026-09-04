import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows, fetchRowsInChunks } from '@/lib/supabase/fetch-all-rows'
import type {
  EducationResearchMeasurement,
  EducationResearchScore,
  EducationResearchScoreDraft,
  StudentProfile,
} from '@/lib/types'
import { ResearchProjectNav } from '../../_components/research-project-nav'
import { ManualScoreEntryClient, type ManualScoreEntryRow } from './_components/manual-score-entry-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'กรอกคะแนนงานวิจัย — KorKru' }

type ParticipantRow = { id: string; student_id: string; roster_order: number | null; users: { full_name: string } | null }
type ProfileRow = Pick<StudentProfile, 'student_id' | 'student_code' | 'class_number'>

export default async function ManualResearchScoresPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authUser = await getAuthUser()
  if (!authUser) redirect('/login')
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('education_research_projects')
    .select('id, org_id, title, topic, classroom_id, classrooms(name)')
    .eq('id', id)
    .maybeSingle()
  if (!project) notFound()
  const { data: canManage } = await supabase.rpc('can_manage_education_research_project', { p_project_id: project.id, p_org_id: project.org_id })
  if (!canManage) redirect(`/research/${project.id}/data`)

  const [measurementsResult, participantsResult, scoresResult, draftsResult] = await Promise.all([
    supabase.from('education_research_measurements').select('*').eq('project_id', project.id),
    fetchAllRows<ParticipantRow>((from, to) => supabase
      .from('education_research_participants')
      .select('id, student_id, roster_order, users(full_name)')
      .eq('project_id', project.id)
      .order('roster_order', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: ParticipantRow[] | null; error: unknown }>),
    fetchAllRows<EducationResearchScore>((from, to) => supabase
      .from('education_research_scores')
      .select('*')
      .eq('project_id', project.id)
      .order('participant_id', { ascending: true })
      .order('measurement_id', { ascending: true })
      .range(from, to)),
    fetchAllRows<EducationResearchScoreDraft>((from, to) => supabase
      .from('education_research_score_drafts')
      .select('*')
      .eq('project_id', project.id)
      .eq('saved_by', authUser.id)
      .order('participant_id', { ascending: true })
      .order('measurement_id', { ascending: true })
      .range(from, to)),
  ])

  if (
    measurementsResult.error
    || participantsResult.error
    || scoresResult.error
    || draftsResult.error
  ) {
    throw new Error('Failed to load manual education research scores')
  }

  const measurements = (measurementsResult.data ?? []) as EducationResearchMeasurement[]
  const pretest = measurements.find(item => item.measurement_type === 'pretest') ?? null
  const posttest = measurements.find(item => item.measurement_type === 'posttest') ?? null
  if (pretest?.source_type !== 'manual' && posttest?.source_type !== 'manual') redirect(`/research/${project.id}/data`)

  const participants = participantsResult.rows
  const studentIds = participants.map(participant => participant.student_id)
  const profilesResult = await fetchRowsInChunks<ProfileRow, string>(studentIds, chunk => supabase
    .from('student_profiles')
    .select('student_id, student_code, class_number')
    .in('student_id', chunk))
  if (profilesResult.error) throw new Error('Failed to load education research student profiles')
  const profileByStudent = new Map(profilesResult.rows.map(profile => [profile.student_id, profile]))
  const scores = scoresResult.rows
  const drafts = draftsResult.rows
  const scoreByKey = new Map(scores.map(score => [`${score.participant_id}:${score.measurement_id}`, score]))
  const draftByKey = new Map(drafts.map(draft => [`${draft.participant_id}:${draft.measurement_id}`, draft]))

  const rows: ManualScoreEntryRow[] = participants.map((participant, index) => {
    const profile = profileByStudent.get(participant.student_id)
    const preScore = pretest ? scoreByKey.get(`${participant.id}:${pretest.id}`) ?? null : null
    const postScore = posttest ? scoreByKey.get(`${participant.id}:${posttest.id}`) ?? null : null
    return {
      participant_id: participant.id,
      order: participant.roster_order ?? profile?.class_number ?? index + 1,
      full_name: participant.users?.full_name ?? 'ไม่พบชื่อผู้ใช้',
      student_code: profile?.student_code ?? null,
      pretest_score: preScore,
      posttest_score: postScore,
      pretest_draft: pretest ? draftByKey.get(`${participant.id}:${pretest.id}`)?.raw_score ?? null : null,
      posttest_draft: posttest ? draftByKey.get(`${participant.id}:${posttest.id}`)?.raw_score ?? null : null,
    }
  })

  return (
    <div className="space-y-6">
      <div><p className="text-sm text-muted-foreground"><Link href="/research" className="hover:underline">วิจัยการศึกษา</Link> / <Link href={`/research/${project.id}/data`} className="hover:underline">ข้อมูลคะแนน</Link> / กรอกคะแนนบนเว็บ</p><h1 className="mt-1 text-2xl font-bold text-foreground">กรอกคะแนนก่อน–หลังเรียน</h1><p className="mt-1 text-sm text-muted-foreground">{project.title} · {project.topic}</p></div>
      <ResearchProjectNav projectId={project.id} active="data" />
      <ManualScoreEntryClient projectId={project.id} rows={rows} pretest={pretest} posttest={posttest} classroomName={(project.classrooms as unknown as { name: string } | null)?.name ?? 'ไม่พบห้องเรียน'} />
    </div>
  )
}
