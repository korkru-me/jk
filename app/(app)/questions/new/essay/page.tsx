import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAllTags } from '@/lib/actions/questions'
import { EssayForm } from '@/components/questions/essay-form'

export default async function NewEssayQuestionPage() {
  const allTags = await getAllTags()
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/questions/new" className="text-muted-foreground hover:text-muted-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">สร้างโจทย์อัตนัย</h1>
          <p className="text-sm text-muted-foreground mt-1">นักเรียนตอบด้วยข้อความบรรยาย ครูตรวจให้คะแนนด้วยมือ</p>
        </div>
      </div>
      <EssayForm allTags={allTags} />
    </div>
  )
}
