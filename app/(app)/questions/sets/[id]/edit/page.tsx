import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { notFound, redirect } from 'next/navigation'
import { getQuestionSet, getQuestionSetShareOrgIds } from '@/lib/actions/question-sets'
import { CreateQuestionSetForm } from '@/components/assignments/create-question-set-form'
import { fetchBankQuestions } from '@/lib/question-bank'
import { getQuestionCardData } from '@/lib/actions/question-card-data'

/**
 * How many of the แฟ้ม's โจทย์ arrive with the page.
 *
 * Matches the card list's own page size: the reader can only see one page at
 * a time, and the rest is read as they turn to it. A แฟ้ม of a thousand โจทย์
 * therefore opens exactly as fast as a แฟ้ม of ten.
 */
const CARD_PREFETCH = 24

export const metadata = { title: 'แก้ไขแฟ้มโจทย์ — KorKru' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditQuestionSetPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const set = await getQuestionSet(id)
  if (!set) notFound()
  // Editing a set stays creator-only — teammates can view/use a shared set, not edit its question list.
  if (set.created_by !== user.id) notFound()

  const [questions, sharedOrgIds, initialCardData] = await Promise.all([
    fetchBankQuestions(supabase, user.id),
    getQuestionSetShareOrgIds(id),
    getQuestionCardData((set.question_ids ?? []).slice(0, CARD_PREFETCH)),
  ])

  return (
    // The heading names the แฟ้ม, so it is rendered by the form, which holds
    // the live title — a rename shows there before it is saved.
    <div className="max-w-[1200px] space-y-6">
      <CreateQuestionSetForm
        questions={questions}
        initialSet={{ ...set, shared_org_ids: sharedOrgIds }}
        initialCardData={initialCardData}
      />
    </div>
  )
}
