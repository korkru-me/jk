import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAllTags } from '@/lib/actions/questions'
import { CompositeForm } from '@/components/questions/composite-form'

export const metadata = { title: 'สร้างโจทย์ผสม — KorKru' }

export default async function NewCompositePage() {
  const allTags = await getAllTags()
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/questions/new" className="text-muted-foreground hover:text-muted-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">สร้างโจทย์ผสม (หลายรูปแบบ)</h1>
          <p className="text-sm text-muted-foreground mt-1">รวมคำถามถูก-ผิด เติมคำ เรียงลำดับ ปรนัย ไว้ในโจทย์เดียวกัน ภายใต้โจทย์หลักเดียว</p>
        </div>
      </div>
      <CompositeForm allTags={allTags} />
    </div>
  )
}
