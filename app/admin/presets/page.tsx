import { createAdminClient } from '@/lib/supabase/admin'
import { PresetsTable } from './_components'

export default async function AdminPresetsPage() {
  const admin = createAdminClient()
  const [{ data: presets }, { data: categories }] = await Promise.all([
    admin.from('formula_presets').select('*, question_categories(name)').order('formula_name'),
    admin.from('question_categories').select('*').order('order'),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">สูตรสำเร็จ</h1>
        <p className="text-sm text-muted-foreground mt-1">{presets?.length ?? 0} สูตร (ใช้ใน Method 2)</p>
      </div>
      <PresetsTable presets={(presets ?? []) as any} categories={categories ?? []} />
    </div>
  )
}
