import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAllTags } from '@/lib/actions/questions'
import { FileUploadForm } from '@/components/questions/file-upload-form'

export default async function NewFileUploadQuestionPage() {
  const allTags = await getAllTags()
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/questions/new" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">สร้างโจทย์ส่งไฟล์งาน</h1>
          <p className="text-sm text-gray-500 mt-1">นักเรียนแนบไฟล์รูปภาพหรือ PDF เป็นคำตอบ ระบบให้คะแนนอัตโนมัติเมื่อมีการส่งไฟล์</p>
        </div>
      </div>
      <FileUploadForm allTags={allTags} />
    </div>
  )
}
