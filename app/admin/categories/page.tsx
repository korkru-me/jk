import { createAdminClient } from '@/lib/supabase/admin'
import { CategoriesTree } from './_components'

export default async function AdminCategoriesPage() {
  const admin = createAdminClient()

  const [{ data: categories }, { data: qCounts }] = await Promise.all([
    admin.from('question_categories').select('*').order('order'),
    admin.from('questions').select('category_id'),
  ])

  const countMap: Record<string, number> = {}
  for (const q of qCounts ?? []) {
    if (q.category_id) countMap[q.category_id] = (countMap[q.category_id] ?? 0) + 1
  }

  const catsWithCount = (categories ?? []).map((c) => ({
    ...c,
    question_count: countMap[c.id] ?? 0,
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">หมวดหมู่</h1>
        <p className="text-sm text-muted-foreground mt-1">{categories?.length ?? 0} หมวด</p>
      </div>
      <CategoriesTree categories={catsWithCount as any} allCategories={categories ?? []} />
    </div>
  )
}
