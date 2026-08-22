import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { redirect } from 'next/navigation'
import { CreateQuestionSetForm } from '@/components/assignments/create-question-set-form'
import type { Question } from '@/lib/types'

export const metadata = { title: 'สร้างแฟ้มโจทย์ — KorKru' }

export default async function NewQuestionSetPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'teacher' && profile?.role !== 'admin') redirect('/dashboard')

  const { data: questions } = await supabase
    .from('questions')
    .select('id, title, question_text, difficulty, question_type, visibility, requires_work_image')
    .eq('created_by', user.id)
    .neq('visibility', 'pending')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-[1200px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">สร้างแฟ้มโจทย์</h1>
        <p className="text-sm text-muted-foreground mt-1">รวมโจทย์จากคลังไว้ในแฟ้มเพื่อใช้ซ้ำ</p>
      </div>

      <CreateQuestionSetForm questions={(questions ?? []) as Question[]} />
    </div>
  )
}
