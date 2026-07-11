import { getAllTags } from '@/lib/actions/questions'
import { FillBlankForm } from '@/components/questions/fill-blank-form'

export const metadata = { title: 'สร้างโจทย์เติมคำ — KorKru' }

export default async function NewFillBlankPage() {
  const allTags = await getAllTags()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">สร้างโจทย์เติมคำในช่องว่าง</h1>
        <p className="text-sm text-gray-500 mt-1">ใส่ประโยคยาว แทรกช่องว่าง [___] ให้นักเรียนกรอกคำตอบสั้นๆ</p>
      </div>
      <FillBlankForm allTags={allTags} />
    </div>
  )
}
