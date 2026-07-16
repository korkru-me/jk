'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Trash2 } from 'lucide-react'
import { createQuestionSet, updateQuestionSet, deleteQuestionSet } from '@/lib/actions/question-sets'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SmartTagInput } from '@/components/ui/smart-tag-input'
import { QuestionPicker } from '@/components/assignments/question-picker'
import type { Question, QuestionSet } from '@/lib/types'

interface Props {
  questions: Question[]
  allTags: string[]
  initialSet?: QuestionSet
}

export function CreateQuestionSetForm({ questions, allTags, initialSet }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [title, setTitle] = useState(initialSet?.title ?? '')
  const [description, setDescription] = useState(initialSet?.description ?? '')
  const [tags, setTags] = useState<string[]>(initialSet?.tags ?? [])
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSet?.question_ids ?? [])
  const [search, setSearch] = useState('')
  const [diffFilter, setDiffFilter] = useState('all')

  function toggleQ(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const canSave = title.trim().length > 0 && selectedIds.length > 0

  function handleSubmit() {
    startTransition(async () => {
      const payload = { title: title.trim(), description: description.trim(), question_ids: selectedIds, tags }
      const res = initialSet
        ? await updateQuestionSet(initialSet.id, payload)
        : await createQuestionSet(payload)
      if (res?.error) { toast.error(res.error); return }
      if (!initialSet && 'id' in res) {
        toast.success('สร้างชุดโจทย์แล้ว')
        router.push('/questions/sets')
      }
    })
  }

  function handleDelete() {
    if (!initialSet) return
    if (!confirm(`ลบชุดโจทย์ "${initialSet.title}"? ไม่สามารถกู้คืนได้`)) return
    startTransition(async () => {
      const res = await deleteQuestionSet(initialSet.id)
      if (res?.error) { toast.error(res.error); return }
      router.push('/questions/sets')
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">ข้อมูลชุดโจทย์</h2>

        <div className="space-y-1.5">
          <Label htmlFor="set-title">ชื่อชุดโจทย์ <span className="text-red-500">*</span></Label>
          <Input
            id="set-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="เช่น แบบฝึกหัด กฎการเคลื่อนที่ของนิวตัน"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="set-desc">คำอธิบาย</Label>
          <Textarea
            id="set-desc"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
            rows={2}
          />
        </div>

        <div className="space-y-1.5">
          <Label>แท็ก</Label>
          <p className="text-xs text-gray-500">ใช้ค้นหา/กรองชุดโจทย์ในคลัง เช่น ฟิสิกส์ ม.4, กลศาสตร์</p>
          <SmartTagInput allTags={allTags} tags={tags} onTagsChange={setTags} />
        </div>
      </div>

      <QuestionPicker
        questions={questions}
        selectedIds={selectedIds}
        onToggle={toggleQ}
        search={search}
        onSearchChange={setSearch}
        diffFilter={diffFilter}
        onDiffFilterChange={setDiffFilter}
      />

      <div className="flex items-center justify-between pt-2">
        {initialSet ? (
          <Button type="button" variant="outline" onClick={handleDelete} disabled={isPending} className="gap-2 text-red-600 border-red-200 hover:bg-red-50">
            <Trash2 className="w-4 h-4" /> ลบชุดโจทย์
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
            ยกเลิก
          </Button>
        )}
        <Button type="button" onClick={handleSubmit} disabled={isPending || !canSave} className="gap-2">
          <Save className="w-4 h-4" />
          {isPending ? 'กำลังบันทึก...' : initialSet ? 'บันทึกการแก้ไข' : 'สร้างชุดโจทย์'}
        </Button>
      </div>
    </div>
  )
}
