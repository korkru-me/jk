import { createClient } from '@/lib/supabase/server'
import { AdvancedEditor } from '@/components/questions/advanced-editor'
import type { QuestionCategory, FormulaPreset } from '@/lib/types'

export const metadata = { title: 'Advanced Question Editor — Korkru' }

export default async function AdvancedQuestionEditorPage() {
  const supabase = await createClient()

  const [{ data: categories }, { data: presets }, { data: tagRows }] = await Promise.all([
    supabase.from('question_categories').select('*').order('order'),
    supabase.from('formula_presets').select('*, question_categories(name)').order('formula_name'),
    supabase.from('questions').select('tags').not('tags', 'is', null),
  ])

  const allTags: string[] = Array.from(
    new Set((tagRows ?? []).flatMap((r: { tags: string[] | null }) => r.tags ?? []))
  ).sort((a, b) => a.localeCompare(b, 'th'))

  return (
    <div className="flex flex-col h-full -m-6">
      <AdvancedEditor
        allTags={allTags}
        presets={(presets ?? []) as (FormulaPreset & { question_categories: { name: string } | null })[]}
        categories={(categories ?? []) as QuestionCategory[]}
        draftKey="advanced-editor-new"
      />
    </div>
  )
}
