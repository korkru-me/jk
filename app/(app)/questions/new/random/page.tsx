import { getAllTags, getFormulaPresets } from '@/lib/actions/questions'
import { RandomNumericForm } from '@/components/questions/random-numeric-form'

export default async function NewRandomQuestionPage() {
  const [allTags, presets] = await Promise.all([getAllTags(), getFormulaPresets()])
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">สร้างโจทย์ตอบสั้น — เติมคำตอบตัวเลข</h1>
        <p className="text-sm text-gray-500 mt-1">สร้างจากสมการสำเร็จรูป เขียนสมการเอง หรือกำหนดคำตอบด้วยตัวเอง</p>
      </div>
      <RandomNumericForm allTags={allTags} presets={presets} />
    </div>
  )
}
