import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  AlertTriangle,
  BookOpenCheck,
  LockKeyhole,
  Target,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getAuthUser } from '@/lib/auth/server'
import {
  calculateCriterionAnalysis,
  calculatePairedAnalysis,
  selectResearchAnalysisData,
} from '@/lib/education-research-statistics'
import { createClient } from '@/lib/supabase/server'
import type {
  EducationResearchMeasurement,
  EducationResearchProject,
  EducationResearchScore,
  EducationResearchScoreHistory,
  StudentProfile,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { ResearchProjectNav } from '../_components/research-project-nav'
import {
  CriterionAnalysisPanel,
  PairedAnalysisPanel,
} from './_components/research-analysis-panels'
import {
  ResearchDataUsedPanel,
  type ResearchDataFilter,
  type ResearchDataHistoryItem,
  type ResearchDataUsedRow,
} from './_components/research-data-used-panel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ผลวิเคราะห์งานวิจัย — KorKru' }

type ResultsTab = 'paired' | 'criterion' | 'data'
type ProjectRow = EducationResearchProject & { classrooms: { name: string } | null }
type ParticipantQueryRow = {
  id: string
  student_id: string
  roster_order: number | null
  users: { id: string; full_name: string } | null
}

const PAGE_SIZE = 20

export default async function ResearchResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; query?: string; filter?: string; page?: string }>
}) {
  const { id } = await params
  const queryParams = await searchParams
  const tab = parseTab(queryParams.tab)
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
        <ResultsHeader project={project} participantCount={null} maxScore={null} />
        <ResearchProjectNav projectId={project.id} active="results" />
        <Card padding="xl" className="border-warning/30"><div className="flex gap-3"><LockKeyhole className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" /><div><h2 className="font-semibold text-foreground">ดูผลวิเคราะห์คะแนนไม่ได้</h2><p className="mt-1 text-sm text-muted-foreground">สิทธิ์ดูอย่างเดียวเปิดได้เฉพาะภาพรวมโครงการ ผลสถิติและข้อมูลที่ใช้คำนวณต้องใช้สิทธิ์จัดการห้องเรียน</p><Button className="mt-4" variant="outline" render={<Link href={`/research/${project.id}`} />}>กลับภาพรวม</Button></div></div></Card>
      </div>
    )
  }

  const [measurementsResult, participantsResult, scoresResult] = await Promise.all([
    supabase
      .from('education_research_measurements')
      .select('id, org_id, project_id, measurement_type, source_type, assignment_id, max_score, selection_mode, source_set_id, source_sections, source_question_ids, snapshot_question_ids, duration_minutes, created_at, updated_at')
      .eq('project_id', project.id),
    supabase
      .from('education_research_participants')
      .select('id, student_id, roster_order, users(id, full_name)')
      .eq('project_id', project.id)
      .order('roster_order', { ascending: true, nullsFirst: false }),
    supabase
      .from('education_research_scores')
      .select('*')
      .eq('project_id', project.id),
  ])

  if (measurementsResult.error || participantsResult.error || scoresResult.error) {
    return (
      <div className="space-y-6">
        <ResultsHeader project={project} participantCount={null} maxScore={null} />
        <ResearchProjectNav projectId={project.id} active="results" />
        <Card padding="xl" className="border-destructive/30"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" /><div><h2 className="font-semibold text-foreground">โหลดข้อมูลสำหรับวิเคราะห์ไม่สำเร็จ</h2><p className="mt-1 text-sm text-muted-foreground">ยังไม่มีการแสดงผลสถิติจากข้อมูลที่ไม่ครบ กรุณาลองเปิดหน้านี้ใหม่อีกครั้ง</p></div></div></Card>
      </div>
    )
  }

  const measurements = (measurementsResult.data ?? []) as EducationResearchMeasurement[]
  const participants = (participantsResult.data ?? []) as unknown as ParticipantQueryRow[]
  const scores = (scoresResult.data ?? []) as EducationResearchScore[]
  const pretest = measurements.find(measurement => measurement.measurement_type === 'pretest') ?? null
  const posttest = measurements.find(measurement => measurement.measurement_type === 'posttest') ?? null
  const pretestMaxScore = positiveNumber(pretest?.max_score)
  const posttestMaxScore = positiveNumber(posttest?.max_score)
  const displayMaxScore = posttestMaxScore ?? pretestMaxScore
  const significanceLevel = Number(project.significance_level)
  const thresholdPercent = Number(project.passing_threshold_percent)
  const criterionScore = posttestMaxScore === null ? 0 : posttestMaxScore * thresholdPercent / 100
  const scoreByKey = new Map(scores.map(score => [`${score.participant_id}:${score.measurement_id}`, score]))
  const selectionRows = participants.map(participant => ({
    participantId: participant.id,
    pretest: pretest ? scoreValue(scoreByKey.get(`${participant.id}:${pretest.id}`)) : null,
    posttest: posttest ? scoreValue(scoreByKey.get(`${participant.id}:${posttest.id}`)) : null,
  }))
  const selection = selectResearchAnalysisData(selectionRows)
  const measurementCompatible = pretestMaxScore !== null
    && posttestMaxScore !== null
    && Math.abs(pretestMaxScore - posttestMaxScore) < 1e-9
  const pairedAnalysis = calculatePairedAnalysis(
    selection.pairedObservations,
    significanceLevel,
    measurementCompatible,
  )
  const criterionAnalysis = calculateCriterionAnalysis(selection.criterionScores, criterionScore, significanceLevel)
  const passedCount = criterionScore > 0
    ? selection.criterionScores.filter(score => score >= criterionScore).length
    : 0
  const latestScoreUpdatedAt = scores.reduce<string | null>((latest, score) => (
    latest === null || score.updated_at > latest ? score.updated_at : latest
  ), null)

  return (
    <div className="space-y-6">
      <ResultsHeader project={project} participantCount={participants.length} maxScore={displayMaxScore} />
      <ResearchProjectNav projectId={project.id} active="results" />
      <ResultsTabs projectId={project.id} active={tab} thresholdPercent={thresholdPercent} />

      {tab === 'paired' && (
        <PairedAnalysisPanel
          analysis={pairedAnalysis}
          excludedCount={selection.incompletePairCount}
          maxScore={measurementCompatible ? displayMaxScore : null}
          significanceLevel={significanceLevel}
          latestScoreUpdatedAt={latestScoreUpdatedAt}
        />
      )}
      {tab === 'criterion' && (
        <CriterionAnalysisPanel
          analysis={criterionAnalysis}
          participantCount={participants.length}
          pairedCount={selection.pairedObservations.length}
          passedCount={passedCount}
          thresholdPercent={thresholdPercent}
          maxScore={posttestMaxScore}
          significanceLevel={significanceLevel}
          latestScoreUpdatedAt={latestScoreUpdatedAt}
        />
      )}
      {tab === 'data' && (
        await renderDataUsedPanel({
          project,
          participants,
          scores,
          pretest,
          posttest,
          selection,
          criterionScore: posttestMaxScore === null ? null : criterionScore,
          thresholdPercent,
          latestScoreUpdatedAt,
          queryParams,
        })
      )}
    </div>
  )
}

async function renderDataUsedPanel({
  project,
  participants,
  scores,
  pretest,
  posttest,
  selection,
  criterionScore,
  thresholdPercent,
  latestScoreUpdatedAt,
  queryParams,
}: {
  project: ProjectRow
  participants: ParticipantQueryRow[]
  scores: EducationResearchScore[]
  pretest: EducationResearchMeasurement | null
  posttest: EducationResearchMeasurement | null
  selection: ReturnType<typeof selectResearchAnalysisData>
  criterionScore: number | null
  thresholdPercent: number
  latestScoreUpdatedAt: string | null
  queryParams: { query?: string; filter?: string; page?: string }
}) {
  const supabase = await createClient()
  const studentIds = participants.map(participant => participant.student_id)
  const profilesResult = studentIds.length > 0
    ? await supabase.from('student_profiles').select('student_id, student_code, class_number').in('student_id', studentIds)
    : { data: [], error: null }

  if (profilesResult.error) {
    return <DataQueryError />
  }

  const profiles = new Map((profilesResult.data ?? []).map(profile => [
    profile.student_id,
    profile as Pick<StudentProfile, 'student_id' | 'student_code' | 'class_number'>,
  ]))
  const scoreByKey = new Map(scores.map(score => [`${score.participant_id}:${score.measurement_id}`, score]))
  const search = (queryParams.query ?? '').trim().slice(0, 100)
  const normalizedSearch = search.toLocaleLowerCase('th')
  const filter = parseFilter(queryParams.filter)
  const allRows = participants.map((participant, index) => {
    const profile = profiles.get(participant.student_id)
    const pretestScore = pretest ? scoreValue(scoreByKey.get(`${participant.id}:${pretest.id}`)) : null
    const posttestScore = posttest ? scoreValue(scoreByKey.get(`${participant.id}:${posttest.id}`)) : null
    const includedPaired = selection.pairedParticipantIds.has(participant.id)
    const includedCriterion = selection.criterionParticipantIds.has(participant.id)
    return {
      participant,
      order: participant.roster_order ?? profile?.class_number ?? index + 1,
      fullName: participant.users?.full_name ?? 'ไม่พบชื่อผู้ใช้',
      studentCode: profile?.student_code ?? null,
      pretestScore,
      posttestScore,
      includedPaired,
      includedCriterion,
      passedCriterion: includedCriterion && criterionScore !== null ? posttestScore! >= criterionScore : null,
      exclusionReason: exclusionReason(pretestScore, posttestScore),
    }
  })
  const filteredRows = allRows.filter(row => {
    const matchesSearch = !normalizedSearch || `${row.fullName} ${row.studentCode ?? ''}`.toLocaleLowerCase('th').includes(normalizedSearch)
    if (!matchesSearch) return false
    if (filter === 'paired') return row.includedPaired
    if (filter === 'criterion') return row.includedCriterion
    if (filter === 'incomplete') return !row.includedPaired
    if (filter === 'excluded') return !row.includedPaired || !row.includedCriterion
    return true
  })
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const requestedPage = Number.parseInt(queryParams.page ?? '1', 10)
  const currentPage = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), totalPages) : 1
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const participantIds = pageRows.map(row => row.participant.id)
  const historiesResult = participantIds.length > 0
    ? await supabase
      .from('education_research_score_history')
      .select('*')
      .eq('project_id', project.id)
      .in('participant_id', participantIds)
      .order('changed_at', { ascending: false })
      .limit(PAGE_SIZE * 40)
    : { data: [], error: null }

  if (historiesResult.error) return <DataQueryError />

  const histories = (historiesResult.data ?? []) as EducationResearchScoreHistory[]
  const actorIds = [...new Set(histories.map(history => history.changed_by).filter((value): value is string => Boolean(value)))]
  const actorsResult = actorIds.length > 0
    ? await supabase.from('users').select('id, full_name').in('id', actorIds)
    : { data: [], error: null }
  if (actorsResult.error) return <DataQueryError />

  const actorNames = new Map((actorsResult.data ?? []).map(actor => [actor.id, actor.full_name]))
  const historyByParticipant = new Map<string, ResearchDataHistoryItem[]>()
  for (const history of histories) {
    const items = historyByParticipant.get(history.participant_id) ?? []
    items.push({
      id: history.id,
      measurementLabel: history.measurement_id === pretest?.id ? 'ก่อนเรียน' : 'หลังเรียน',
      action: history.action,
      oldScore: nullableNumber(history.old_score),
      newScore: nullableNumber(history.new_score),
      oldSource: history.old_source,
      newSource: history.new_source,
      reason: history.reason,
      actorName: history.changed_by ? actorNames.get(history.changed_by) ?? null : null,
      changedAt: history.changed_at,
    })
    historyByParticipant.set(history.participant_id, items)
  }

  const browserRows: ResearchDataUsedRow[] = pageRows.map(row => ({
    participantId: row.participant.id,
    order: row.order,
    fullName: row.fullName,
    studentCode: row.studentCode,
    pretest: row.pretestScore,
    posttest: row.posttestScore,
    includedPaired: row.includedPaired,
    includedCriterion: row.includedCriterion,
    passedCriterion: row.passedCriterion,
    exclusionReason: row.exclusionReason,
    history: historyByParticipant.get(row.participant.id) ?? [],
  }))

  return (
    <ResearchDataUsedPanel
      projectId={project.id}
      rows={browserRows}
      participantCount={participants.length}
      pairedCount={selection.pairedObservations.length}
      criterionCount={selection.criterionScores.length}
      incompleteCount={selection.incompletePairCount}
      thresholdPercent={thresholdPercent}
      criterionScore={criterionScore}
      query={search}
      filter={filter}
      currentPage={currentPage}
      totalPages={totalPages}
      filteredCount={filteredRows.length}
      latestScoreUpdatedAt={latestScoreUpdatedAt}
    />
  )
}

function ResultsHeader({ project, participantCount, maxScore }: { project: ProjectRow; participantCount: number | null; maxScore: number | null }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground"><Link href="/research" className="hover:underline">วิจัยการศึกษา</Link> / ผลวิเคราะห์</p>
      <h1 className="mt-1 text-2xl font-bold text-foreground">ผลวิเคราะห์: {project.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{project.topic}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5"><BookOpenCheck className="size-4 text-primary" aria-hidden="true" />{project.classrooms?.name ?? 'ไม่พบห้องเรียน'}</span>
        {participantCount !== null && <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5"><Users className="size-4 text-primary" aria-hidden="true" />{participantCount} นักเรียน</span>}
        {maxScore !== null && <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5"><BookOpenCheck className="size-4 text-primary" aria-hidden="true" />คะแนนเต็ม {formatCompact(maxScore)}</span>}
        <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5"><Target className="size-4 text-primary" aria-hidden="true" />เกณฑ์ {formatCompact(Number(project.passing_threshold_percent))}%</span>
      </div>
    </div>
  )
}

function ResultsTabs({ projectId, active, thresholdPercent }: { projectId: string; active: ResultsTab; thresholdPercent: number }) {
  const tabs: Array<{ value: ResultsTab; label: string; href: string }> = [
    { value: 'paired', label: 'ก่อน–หลังเรียน', href: `/research/${projectId}/results` },
    { value: 'criterion', label: `เทียบเกณฑ์ ${formatCompact(thresholdPercent)}%`, href: `/research/${projectId}/results?tab=criterion` },
    { value: 'data', label: 'ข้อมูลที่ใช้', href: `/research/${projectId}/results?tab=data` },
  ]
  return <nav className="grid overflow-hidden rounded-xl border sm:grid-cols-3" aria-label="ประเภทผลวิเคราะห์">{tabs.map(tab => <Link key={tab.value} href={tab.href} aria-current={active === tab.value ? 'page' : undefined} className={cn('px-4 py-2.5 text-center text-sm font-semibold transition-colors hover:bg-muted', active === tab.value ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}>{tab.label}</Link>)}</nav>
}

function DataQueryError() {
  return <Card padding="lg" className="border-destructive/30"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" /><div><h2 className="font-semibold text-foreground">โหลดข้อมูลรายคนไม่สำเร็จ</h2><p className="mt-1 text-sm text-muted-foreground">ผลสถิติไม่ได้ถูกแทนด้วยข้อมูลอื่น กรุณาลองเปิดแท็บนี้ใหม่อีกครั้ง</p></div></div></Card>
}

function parseTab(value: string | undefined): ResultsTab {
  return value === 'criterion' || value === 'data' ? value : 'paired'
}

function parseFilter(value: string | undefined): ResearchDataFilter {
  return value === 'paired' || value === 'criterion' || value === 'incomplete' || value === 'excluded' ? value : 'all'
}

function positiveNumber(value: number | null | undefined): number | null {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function scoreValue(score: EducationResearchScore | undefined): number | null {
  if (!score) return null
  const value = Number(score.raw_score)
  return Number.isFinite(value) ? value : null
}

function nullableNumber(value: number | null): number | null {
  if (value === null) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function exclusionReason(pretest: number | null, posttest: number | null): string | null {
  if (pretest === null && posttest === null) return 'ไม่มีคะแนนก่อนเรียนและหลังเรียน'
  if (pretest === null) return 'ไม่มีคะแนนก่อนเรียน จึงไม่ใช้ในผลก่อน–หลัง'
  if (posttest === null) return 'ไม่มีคะแนนหลังเรียน จึงไม่ใช้ทั้งสองการวิเคราะห์'
  return null
}

function formatCompact(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}
