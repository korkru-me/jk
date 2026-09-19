import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAllTags } from '@/lib/actions/questions'
import { ImageLabelForm } from '@/components/questions/image-label-form'

export const metadata = { title: 'สร้างโจทย์เติมคำในรูป — KorKru' }

export default async function NewImageLabelPage() {
  const allTags = await getAllTags()
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/questions/new" className="text-muted-foreground transition-colors hover:text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">สร้างโจทย์เติมคำในรูป</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            รูปเดียวจบในข้อเดียว — คลิกวางช่องคำตอบบนรูป แล้วนักเรียนเติมคำว่าแต่ละจุดคืออะไร
          </p>
        </div>
      </div>
      <ImageLabelForm allTags={allTags} />
    </div>
  )
}
