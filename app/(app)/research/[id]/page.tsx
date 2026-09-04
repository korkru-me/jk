import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import type {
  AssignmentStatus,
  EducationResearchMeasurement,
  EducationResearchProject,
} from '@/lib/types'
import { ResearchProjectOverview } from './_components/research-project-overview'

export const dynamic = 'force-dynamic'

type ProjectRow = EducationResearchProject & {
  classrooms: { id: string; name: string } | null
}

export interface ResearchAssignmentSummary {
  id: string
  title: string
  status: AssignmentStatus
  start_at: string | null
  end_at: string | null
  duration_minutes: number | null
  access_code: string | null
  question_ids: string[]
}

export type ResearchMeasurementSummary = EducationResearchMeasurement & {
  assignments: ResearchAssignmentSummary | null
  score_count: number
}

export default async function ResearchProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const authUser = await getAuthUser()
  if (!authUser) redirect('/login')

  const supabase = await createClient()
  const { data: projectData, error: projectError } = await supabase
    .from('education_research_projects')
    .select('id, org_id, classroom_id, created_by, title, topic, research_design, status, passing_threshold_percent, significance_level, criterion_test_sides, completed_at, created_at, updated_at, classrooms(id, name)')
    .eq('id', id)
    .maybeSingle()

  if (projectError || !projectData) notFound()
  const project = projectData as unknown as ProjectRow

  const [canManageResult, measurementsResult, participantsResult, scoresResult] = await Promise.all([
    supabase.rpc('can_manage_education_research_project', {
      p_project_id: project.id,
      p_org_id: project.org_id,
    }),
    supabase
      .from('education_research_measurements')
      .select('id, org_id, project_id, measurement_type, source_type, assignment_id, max_score, selection_mode, source_set_id, source_sections, source_question_ids, snapshot_question_ids, duration_minutes, created_at, updated_at, assignments(id, title, status, start_at, end_at, duration_minutes, access_code, question_ids)')
      .eq('project_id', project.id)
      .order('measurement_type'),
    supabase
      .from('education_research_participants')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id),
    fetchAllRows<{ measurement_id: string; participant_id: string }>((from, to) => supabase
      .from('education_research_scores')
      .select('measurement_id, participant_id')
      .eq('project_id', project.id)
      .order('participant_id', { ascending: true })
      .order('measurement_id', { ascending: true })
      .range(from, to)),
  ])

  if (
    canManageResult.error
    || measurementsResult.error
    || participantsResult.error
    || scoresResult.error
  ) {
    throw new Error('Failed to load education research project overview')
  }

  const scoreCountByMeasurement = new Map<string, number>()
  const participantIdsByMeasurement = new Map<string, Set<string>>()
  for (const score of scoresResult.rows) {
    scoreCountByMeasurement.set(
      score.measurement_id,
      (scoreCountByMeasurement.get(score.measurement_id) ?? 0) + 1,
    )
    const participantIds = participantIdsByMeasurement.get(score.measurement_id) ?? new Set<string>()
    participantIds.add(score.participant_id)
    participantIdsByMeasurement.set(score.measurement_id, participantIds)
  }

  const measurements = (measurementsResult.data ?? []).map(measurement => ({
    ...measurement,
    assignments: measurement.assignments ?? null,
    score_count: scoreCountByMeasurement.get(measurement.id) ?? 0,
  })) as unknown as ResearchMeasurementSummary[]
  const pretestId = measurements.find(item => item.measurement_type === 'pretest')?.id
  const posttestId = measurements.find(item => item.measurement_type === 'posttest')?.id
  const pretestParticipants = pretestId ? participantIdsByMeasurement.get(pretestId) ?? new Set<string>() : new Set<string>()
  const posttestParticipants = posttestId ? participantIdsByMeasurement.get(posttestId) ?? new Set<string>() : new Set<string>()
  const pairedScoreCount = [...pretestParticipants].filter(participantId => posttestParticipants.has(participantId)).length

  return (
    <ResearchProjectOverview
      project={project}
      measurements={measurements}
      participantCount={participantsResult.count ?? 0}
      pairedScoreCount={pairedScoreCount}
      canManage={canManageResult.data === true}
    />
  )
}
