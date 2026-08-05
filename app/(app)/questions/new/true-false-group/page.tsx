import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAllTags } from '@/lib/actions/questions'
import { TrueFalseGroupForm } from '@/components/questions/true-false-group-form'

export const metadata = { title: 'สร้างโจทย์ถูก-ผิดแบบชุด — KorKru' }

export default async function NewTrueFalseGroupPage() {
  const allTags = await getAllTags()
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/questions/new/true-false" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">สร้างโจทย์ถูก-ผิดแบบชุด</h1>
          <p className="text-sm text-gray-500 mt-1">โจทย์หลักหนึ่งข้อ พร้อมคำถามย่อยได้หลายข้อ แต่ละข้อมีตัวเลือกให้นักเรียนติ๊กได้ตั้งแต่ 1 ข้อขึ้นไป</p>
        </div>
      </div>
      <div className="flex gap-2 border-b">
        <Link href="/questions/new/true-false" className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors">
          ← ถูก-ผิด (เดี่ยว)
        </Link>
        <span className="px-3 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600">ถูก-ผิดแบบชุด (มีคำถามย่อย)</span>
      </div>
      <TrueFalseGroupForm allTags={allTags} />
    </div>
  )
}
