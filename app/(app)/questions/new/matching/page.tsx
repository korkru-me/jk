import { getAllTags } from '@/lib/actions/questions'
import { MatchingForm } from '@/components/questions/matching-form'

export default async function NewMatchingQuestionPage() {
  const allTags = await getAllTags()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">สร้างโจทย์จับคู่</h1>
        <p className="text-sm text-gray-500 mt-1">นักเรียนจับคู่รายการซ้ายกับขวา คอลัมน์ขวาถูกสลับลำดับแบบสุ่ม</p>
      </div>
      <MatchingForm allTags={allTags} />
    </div>
  )
}
