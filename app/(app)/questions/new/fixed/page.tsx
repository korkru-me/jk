import { getAllTags } from '@/lib/actions/questions'
import { FixedNumericForm } from '@/components/questions/fixed-numeric-form'

export default async function NewFixedQuestionPage() {
  const allTags = await getAllTags()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">สร้างโจทย์ตอบสั้น — ค่าคงที่</h1>
        <p className="text-sm text-gray-500 mt-1">นักเรียนทุกคนได้โจทย์เหมือนกัน คำตอบเป็นตัวเลขที่ครูกำหนด</p>
      </div>
      <FixedNumericForm allTags={allTags} />
    </div>
  )
}
