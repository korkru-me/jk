import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { redirect } from 'next/navigation'
import { CreateQuestionSetForm } from '@/components/assignments/create-question-set-form'
import { fetchBankQuestions } from '@/lib/question-bank'

export const metadata = { title: 'สร้างแฟ้มโจทย์ — KorKru' }

export default async function NewQuestionSetPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'teacher' && profile?.role !== 'admin') redirect('/dashboard')

  const questions = await fetchBankQuestions(supabase, user.id)

  return (
    <div className="max-w-[1200px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">สร้างแฟ้มโจทย์</h1>
        <p className="text-sm text-muted-foreground mt-1">รวมโจทย์จากคลังไว้ในแฟ้มเพื่อใช้ซ้ำ</p>
      </div>

      <CreateQuestionSetForm questions={questions} />
    </div>
  )
}
