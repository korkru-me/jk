import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAllTags } from '@/lib/actions/questions'
import { ClassifyForm } from '@/components/questions/classify-form'

export const metadata = { title: 'สร้างโจทย์ตารางจำแนก — KorKru' }

export default async function NewClassifyPage() {
  const allTags = await getAllTags()
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/questions/new" className="text-muted-foreground transition-colors hover:text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">สร้างโจทย์ตารางจำแนก</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ตารางเดียวจบในข้อเดียว — แถวคือสิ่งที่ให้จำแนก คอลัมน์คือมิติการจำแนก นักเรียนเลือก 1 ตัวเลือกต่อช่อง
          </p>
        </div>
      </div>
      <ClassifyForm allTags={allTags} />
    </div>
  )
}
