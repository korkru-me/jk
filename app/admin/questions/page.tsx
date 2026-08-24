import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { QuestionsFilter, QuestionTable } from './_components'

interface Props {
  searchParams: Promise<{ search?: string; visibility?: string; category?: string; difficulty?: string }>
}

export default async function AdminQuestionsPage({ searchParams }: Props) {
  const { search, visibility, category, difficulty } = await searchParams
  const admin = createAdminClient()

  let query = admin
    .from('questions')
    .select('*, question_categories(name), users:created_by(full_name, email)')
    .eq('is_research_snapshot', false)
    .order('created_at', { ascending: false })

  if (search) query = (query as any).ilike('title', `%${search}%`)
  if (visibility && visibility !== 'all') query = (query as any).eq('visibility', visibility)
  if (category && category !== 'all') query = (query as any).eq('category_id', category)
  if (difficulty && difficulty !== 'all') query = (query as any).eq('difficulty', difficulty)

  const [{ data: questions }, { data: categories }] = await Promise.all([
    query,
    admin.from('question_categories').select('*').order('order'),
  ])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">โจทย์ทั้งหมด</h1>
          <p className="text-sm text-muted-foreground mt-1">{questions?.length ?? 0} รายการ</p>
        </div>
        <Link href="/questions/new" className={cn(buttonVariants())}>
          + สร้างโจทย์ใหม่
        </Link>
      </div>
      <QuestionsFilter categories={categories ?? []} />
      <QuestionTable questions={(questions ?? []) as any} />
    </div>
  )
}
