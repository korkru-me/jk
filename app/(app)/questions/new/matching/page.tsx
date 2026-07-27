import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAllTags } from '@/lib/actions/questions'
import { MatchingForm } from '@/components/questions/matching-form'

export default async function NewMatchingQuestionPage() {
  const allTags = await getAllTags()
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/questions/new" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">สร้างโจทย์จับคู่</h1>
          <p className="text-sm text-gray-500 mt-1">นักเรียนจับคู่รายการซ้ายกับขวา คอลัมน์ขวาถูกสลับลำดับแบบสุ่ม</p>
        </div>
      </div>
      <MatchingForm allTags={allTags} />
    </div>
  )
}
