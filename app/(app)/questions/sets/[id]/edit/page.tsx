import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { notFound, redirect } from 'next/navigation'
import { getQuestionSet, getQuestionSetShareOrgIds } from '@/lib/actions/question-sets'
import { CreateQuestionSetForm } from '@/components/assignments/create-question-set-form'
import type { Question } from '@/lib/types'

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

  const [{ data: questions }, sharedOrgIds] = await Promise.all([
    supabase
      .from('questions')
      .select('id, title, question_text, difficulty, question_type, visibility, requires_work_image')
      .eq('created_by', user.id)
      .neq('visibility', 'pending')
      .order('created_at', { ascending: false }),
    getQuestionSetShareOrgIds(id),
  ])

  return (
    <div className="max-w-[1200px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">แก้ไขแฟ้มโจทย์</h1>
        <p className="text-sm text-muted-foreground mt-1">การแก้ไขจะไม่ย้อนกลับไปเปลี่ยนชุดข้อสอบที่มอบหมายไปแล้วจากแฟ้มนี้</p>
      </div>

      <CreateQuestionSetForm
        questions={(questions ?? []) as Question[]}
        initialSet={{ ...set, shared_org_ids: sharedOrgIds }}
      />
    </div>
  )
}
