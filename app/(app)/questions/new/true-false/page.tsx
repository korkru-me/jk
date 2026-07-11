import { getAllTags } from '@/lib/actions/questions'
import { TrueFalseForm } from '@/components/questions/true-false-form'

export const metadata = { title: 'สร้างโจทย์ถูก-ผิด — KorKru' }

export default async function NewTrueFalsePage() {
  const allTags = await getAllTags()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">สร้างโจทย์ถูก-ผิด</h1>
        <p className="text-sm text-gray-500 mt-1">ครูใส่ข้อความ นักเรียนติ๊กถูกหรือผิด พร้อมเลือกเงื่อนไขการให้เหตุผล</p>
      </div>
      <TrueFalseForm allTags={allTags} />
    </div>
  )
}
