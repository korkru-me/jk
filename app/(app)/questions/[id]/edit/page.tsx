import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCategories, getFormulaPresets } from '@/lib/actions/questions'
import { QuestionForm } from '@/components/questions/question-form'
import type { Question } from '@/lib/types'

interface EditQuestionPageProps {
  params: Promise<{ id: string }>
}

export default async function EditQuestionPage({ params }: EditQuestionPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: question }, categories, presets] = await Promise.all([
    supabase
      .from('questions')
      .select('*')
      .eq('id', id)
      .eq('created_by', user!.id)
      .single(),
    getCategories(),
    getFormulaPresets(),
  ])

  if (!question) notFound()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">แก้ไขโจทย์</h1>
        <p className="text-sm text-gray-500 mt-1 truncate">{question.title}</p>
      </div>
      <QuestionForm
        mode="edit"
        question={question as Question}
        categories={categories}
        presets={presets}
      />
    </div>
  )
}
