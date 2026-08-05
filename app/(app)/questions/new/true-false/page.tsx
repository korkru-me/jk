import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAllTags } from '@/lib/actions/questions'
import { TrueFalseForm } from '@/components/questions/true-false-form'

export const metadata = { title: 'สร้างโจทย์ถูก-ผิด — KorKru' }

export default async function NewTrueFalsePage() {
  const allTags = await getAllTags()
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/questions/new" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">สร้างโจทย์ถูก-ผิด</h1>
          <p className="text-sm text-gray-500 mt-1">ครูใส่ข้อความ นักเรียนติ๊กถูกหรือผิด พร้อมเลือกเงื่อนไขการให้เหตุผล</p>
        </div>
      </div>
      <div className="flex gap-2 border-b">
        <span className="px-3 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600">ถูก-ผิด (เดี่ยว)</span>
        <Link href="/questions/new/true-false-group" className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors">
          ถูก-ผิดแบบชุด (มีคำถามย่อย) →
        </Link>
      </div>
      <TrueFalseForm allTags={allTags} />
    </div>
  )
}
