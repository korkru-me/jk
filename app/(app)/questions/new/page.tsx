import { getCategories, getFormulaPresets } from '@/lib/actions/questions'
import { QuestionForm } from '@/components/questions/question-form'

export default async function NewQuestionPage() {
  const [categories, presets] = await Promise.all([
    getCategories(),
    getFormulaPresets(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">สร้างโจทย์ใหม่</h1>
        <p className="text-sm text-gray-500 mt-1">กรอกข้อมูลโจทย์และสูตรคำตอบ</p>
      </div>
      <QuestionForm mode="create" categories={categories} presets={presets} />
    </div>
  )
}
