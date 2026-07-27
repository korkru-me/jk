import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAllTags } from '@/lib/actions/questions'
import { EssayForm } from '@/components/questions/essay-form'

export default async function NewEssayQuestionPage() {
  const allTags = await getAllTags()
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/questions/new" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">สร้างโจทย์อัตนัย</h1>
          <p className="text-sm text-gray-500 mt-1">นักเรียนตอบด้วยข้อความบรรยาย ครูตรวจให้คะแนนด้วยมือ</p>
        </div>
      </div>
      <EssayForm allTags={allTags} />
    </div>
  )
}
