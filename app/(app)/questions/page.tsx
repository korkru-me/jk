import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { DeleteQuestionButton } from '@/components/questions/delete-button'
import { cn } from '@/lib/utils'
import type { Question } from '@/lib/types'

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'ง่าย',
  medium: 'ปานกลาง',
  hard: 'ยาก',
  analytical: 'วิเคราะห์',
}

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  hard: 'bg-red-100 text-red-700',
  analytical: 'bg-purple-100 text-purple-700',
}

const TYPE_LABEL: Record<string, string> = {
  written: 'อัตนัย',
  mcq: 'ปรนัย',
}

export default async function QuestionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: questions } = await supabase
    .from('questions')
    .select('*, question_categories(name)')
    .eq('created_by', user!.id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">คลังโจทย์ของฉัน</h1>
          <p className="text-sm text-gray-500 mt-1">
            {questions?.length ?? 0} โจทย์
          </p>
        </div>
        <Link
          href="/questions/new"
          className={cn(buttonVariants({ variant: 'default' }))}
        >
          + สร้างโจทย์ใหม่
        </Link>
      </div>

      {!questions || questions.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-4xl mb-3">📝</p>
          <p className="text-gray-500 font-medium">ยังไม่มีโจทย์ในคลัง</p>
          <p className="text-sm text-gray-400 mt-1 mb-6">เริ่มสร้างโจทย์แรกของคุณได้เลย</p>
          <Link
            href="/questions/new"
            className={cn(buttonVariants({ variant: 'default' }))}
          >
            สร้างโจทย์แรก
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {questions.map((q: Question & { question_categories: { name: string } | null }) => (
            <div
              key={q.id}
              className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-gray-900 truncate">{q.title}</p>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', DIFFICULTY_COLOR[q.difficulty])}>
                    {DIFFICULTY_LABEL[q.difficulty]}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {TYPE_LABEL[q.question_type]}
                  </span>
                  {q.question_categories && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                      {q.question_categories.name}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 mt-0.5 truncate">{q.question_text}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/questions/${q.id}/edit`}
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                >
                  แก้ไข
                </Link>
                <DeleteQuestionButton id={q.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
