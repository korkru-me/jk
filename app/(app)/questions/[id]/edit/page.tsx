import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAllTags, getFormulaPresets } from '@/lib/actions/questions'
import { McqForm } from '@/components/questions/mcq-form'
import { TrueFalseForm } from '@/components/questions/true-false-form'
import { FillBlankForm } from '@/components/questions/fill-blank-form'
import { OrderingForm } from '@/components/questions/ordering-form'
import { MatchingForm } from '@/components/questions/matching-form'
import { EssayForm } from '@/components/questions/essay-form'
import { RandomNumericForm } from '@/components/questions/random-numeric-form'
import type { Question } from '@/lib/types'

interface EditQuestionPageProps {
  params: Promise<{ id: string }>
}

export default async function EditQuestionPage({ params }: EditQuestionPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: question }, allTags, presets] = await Promise.all([
    supabase
      .from('questions')
      .select('*')
      .eq('id', id)
      .eq('created_by', user!.id)
      .single(),
    getAllTags(),
    getFormulaPresets(),
  ])

  if (!question) notFound()

  const q = question as Question

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">แก้ไขโจทย์</h1>
        <p className="text-sm text-gray-500 mt-1 truncate">{q.title}</p>
      </div>
      {q.question_type === 'mcq' && <McqForm mode="edit" question={q} allTags={allTags} presets={presets} />}
      {q.question_type === 'true_false' && <TrueFalseForm mode="edit" question={q} allTags={allTags} />}
      {q.question_type === 'fill_blank' && <FillBlankForm mode="edit" question={q} allTags={allTags} />}
      {q.question_type === 'ordering' && <OrderingForm mode="edit" question={q} allTags={allTags} />}
      {q.question_type === 'matching' && <MatchingForm mode="edit" question={q} allTags={allTags} />}
      {q.question_type === 'essay' && <EssayForm mode="edit" question={q} allTags={allTags} />}
      {q.question_type === 'written' && <RandomNumericForm mode="edit" question={q} allTags={allTags} presets={presets} />}
    </div>
  )
}
