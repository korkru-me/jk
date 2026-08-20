import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAllTags, getFormulaPresets } from '@/lib/actions/questions'
import { RandomNumericForm } from '@/components/questions/random-numeric-form'

export default async function NewRandomQuestionPage() {
  const [allTags, presets] = await Promise.all([getAllTags(), getFormulaPresets()])
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/questions/new" className="text-muted-foreground hover:text-muted-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">สร้างโจทย์ตอบสั้น — เติมคำตอบตัวเลข</h1>
          <p className="text-sm text-muted-foreground mt-1">สร้างจากสมการสำเร็จรูป เขียนสมการเอง หรือกำหนดคำตอบด้วยตัวเอง</p>
        </div>
      </div>
      <RandomNumericForm allTags={allTags} presets={presets} />
    </div>
  )
}
