import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAllTags, getFormulaPresets, getQuestionShareOrgIds } from '@/lib/actions/questions'
import { McqForm } from '@/components/questions/mcq-form'
import { TrueFalseForm } from '@/components/questions/true-false-form'
import { FillBlankForm } from '@/components/questions/fill-blank-form'
import { OrderingForm } from '@/components/questions/ordering-form'
import { MatchingForm } from '@/components/questions/matching-form'
import { EssayForm } from '@/components/questions/essay-form'
import { FileUploadForm } from '@/components/questions/file-upload-form'
import { RandomNumericForm } from '@/components/questions/random-numeric-form'
import { CompositeForm } from '@/components/questions/composite-form'
import { TrueFalseGroupForm } from '@/components/questions/true-false-group-form'
import { isTrueFalseGroupQuestion } from '@/lib/true-false-group'
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
      .single(),
    getAllTags(),
    getFormulaPresets(),
  ])

  if (!question) notFound()

  const isOwner = question.created_by === user!.id
  if (!isOwner && !question.team_edit_allowed) notFound()

  const sharedOrgIds = await getQuestionShareOrgIds(id)
  const q = { ...(question as Question), shared_org_ids: sharedOrgIds }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">แก้ไขโจทย์</h1>
        <p className="text-sm text-gray-500 mt-1 truncate">{q.title}</p>
      </div>
      {q.question_type === 'mcq' && <McqForm mode="edit" question={q} allTags={allTags} presets={presets} isOwner={isOwner} />}
      {q.question_type === 'true_false' && <TrueFalseForm mode="edit" question={q} allTags={allTags} isOwner={isOwner} />}
      {q.question_type === 'fill_blank' && <FillBlankForm mode="edit" question={q} allTags={allTags} isOwner={isOwner} />}
      {q.question_type === 'ordering' && <OrderingForm mode="edit" question={q} allTags={allTags} isOwner={isOwner} />}
      {q.question_type === 'matching' && <MatchingForm mode="edit" question={q} allTags={allTags} isOwner={isOwner} />}
      {q.question_type === 'essay' && <EssayForm mode="edit" question={q} allTags={allTags} isOwner={isOwner} />}
      {q.question_type === 'file_upload' && <FileUploadForm mode="edit" question={q} allTags={allTags} isOwner={isOwner} />}
      {q.question_type === 'written' && <RandomNumericForm mode="edit" question={q} allTags={allTags} presets={presets} isOwner={isOwner} />}
      {q.question_type === 'composite' && (
        isTrueFalseGroupQuestion(q)
          ? <TrueFalseGroupForm mode="edit" question={q} allTags={allTags} isOwner={isOwner} />
          : <CompositeForm mode="edit" question={q} allTags={allTags} isOwner={isOwner} />
      )}
    </div>
  )
}
