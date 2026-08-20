import { createClient } from '@/lib/supabase/server'
import { MultiStepEditor } from '@/components/questions/multi-step-editor'
import type { QuestionCategory, FormulaPreset } from '@/lib/types'

export default async function MultiStepNewPage() {
  const supabase = await createClient()

  const [{ data: categories }, { data: presets }] = await Promise.all([
    supabase.from('question_categories').select('*').order('order'),
    supabase.from('formula_presets').select('*, question_categories(name)').order('formula_name'),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">สร้างโจทย์หลายขั้นตอน</h1>
        <p className="text-sm text-muted-foreground mt-1">กำหนดบริบทร่วม แล้วเพิ่มข้อย่อยที่เชื่อมคำตอบกันได้</p>
      </div>
      <MultiStepEditor
        mode="create"
        categories={(categories ?? []) as QuestionCategory[]}
        presets={(presets ?? []) as (FormulaPreset & { question_categories: { name: string } | null })[]}
      />
    </div>
  )
}
