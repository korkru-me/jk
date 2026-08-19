import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { MultiStepEditor } from '@/components/questions/multi-step-editor'
import { getQuestionShareOrgIds } from '@/lib/actions/questions'
import type { QuestionCategory, FormulaPreset, Question, Difficulty, Visibility } from '@/lib/types'
import type { SubQuestionData } from '@/lib/actions/question-groups'

export default async function MultiStepEditPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId } = await params
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const [{ data: groupQuestions }, { data: categories }, { data: presets }] = await Promise.all([
    supabase
      .from('questions')
      .select('*')
      .eq('group_id', groupId)
      .order('order_in_group', { ascending: true }),
    supabase.from('question_categories').select('*').order('order'),
    supabase.from('formula_presets').select('*, question_categories(name)').order('formula_name'),
  ])

  if (!groupQuestions || groupQuestions.length === 0) notFound()

  const parent = (groupQuestions as Question[]).find((q) => q.order_in_group === 0)
  if (!parent) notFound()

  const isOwner = parent.created_by === user.id
  if (!isOwner && !parent.team_edit_allowed) notFound()

  const sharedOrgIds = await getQuestionShareOrgIds(parent.id)

  const subQs = (groupQuestions as Question[])
    .filter((q) => (q.order_in_group ?? 0) > 0)
    .sort((a, b) => (a.order_in_group ?? 0) - (b.order_in_group ?? 0))

  const initialSubQuestions: SubQuestionData[] = subQs.map((q) => ({
    id: q.id,
    question_text: q.question_text,
    difficulty: q.difficulty as Difficulty,
    variables: q.variables ?? [],
    answer_formula: q.answer_formula ?? '',
    answer_unit: q.answer_unit ?? '',
    answer_tolerance: q.answer_tolerance ?? 0.05,
    solution_text: q.solution_text ?? '',
    solution_image_urls: q.solution_image_urls ?? [],
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">แก้ไขโจทย์หลายขั้นตอน</h1>
        <p className="text-sm text-gray-500 mt-1">{subQs.length} ข้อย่อย</p>
      </div>
      <MultiStepEditor
        mode="edit"
        groupId={groupId}
        parentId={parent.id}
        categories={(categories ?? []) as QuestionCategory[]}
        presets={(presets ?? []) as (FormulaPreset & { question_categories: { name: string } | null })[]}
        initialTitle={parent.title}
        initialContext={parent.question_text}
        initialCategoryId={parent.category_id ?? ''}
        initialVisibility={parent.visibility as Visibility}
        initialOrgId={parent.org_id}
        initialSharedOrgIds={sharedOrgIds}
        initialTeamEditAllowed={parent.team_edit_allowed}
        initialDifficulty={parent.difficulty as Difficulty}
        initialSubQuestions={initialSubQuestions}
        isOwner={isOwner}
      />
    </div>
  )
}
