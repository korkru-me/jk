import { getAllTags, getFormulaPresets } from '@/lib/actions/questions'
import { McqForm } from '@/components/questions/mcq-form'

export default async function NewMcqQuestionPage() {
  const [allTags, presets] = await Promise.all([getAllTags(), getFormulaPresets()])
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">สร้างโจทย์ปรนัย</h1>
        <p className="text-sm text-gray-500 mt-1">มีตัวเลือก 2–6 ข้อ เลือกคำตอบถูกต้องได้มากกว่า 1 ข้อ</p>
      </div>
      <McqForm allTags={allTags} presets={presets} />
    </div>
  )
}
