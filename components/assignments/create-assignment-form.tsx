'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createAssignment } from '@/lib/actions/assignments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import type { Question, Classroom } from '@/lib/types'

interface Props {
  classrooms: Classroom[]
  questions: Question[]
}

export function CreateAssignmentForm({ classrooms, questions }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [selectedClassroom, setSelectedClassroom] = useState(classrooms[0]?.id ?? '')
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([])
  const [mode, setMode] = useState<'online' | 'print'>('online')
  const [search, setSearch] = useState('')

  const filteredQuestions = questions.filter(q =>
    q.title.toLowerCase().includes(search.toLowerCase()) ||
    q.question_text.toLowerCase().includes(search.toLowerCase())
  )

  function toggleQuestion(id: string) {
    setSelectedQuestions(prev =>
      prev.includes(id) ? prev.filter(q => q !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (selectedQuestions.length === 0) {
      toast.error('กรุณาเลือกโจทย์อย่างน้อย 1 ข้อ')
      return
    }
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    const result = await createAssignment({
      classroom_id: selectedClassroom,
      title: fd.get('title') as string,
      description: fd.get('description') as string,
      question_ids: selectedQuestions,
      start_at: (fd.get('start_at') as string) || null,
      end_at: (fd.get('end_at') as string) || null,
      duration_minutes: fd.get('duration_minutes') ? Number(fd.get('duration_minutes')) : null,
      mode,
    })
    if (result?.error) {
      toast.error(result.error)
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic info */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">ข้อมูลพื้นฐาน</h2>

        <div className="space-y-2">
          <Label htmlFor="title">ชื่อชุดข้อสอบ *</Label>
          <Input id="title" name="title" placeholder="เช่น แบบทดสอบกลางภาค บทที่ 1-3" required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">คำอธิบาย</Label>
          <Textarea id="description" name="description" placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)" rows={2} />
        </div>

        <div className="space-y-2">
          <Label>ห้องเรียน *</Label>
          <select
            value={selectedClassroom}
            onChange={e => setSelectedClassroom(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            {classrooms.length === 0 && (
              <option value="">— ยังไม่มีห้องเรียน —</option>
            )}
            {classrooms.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Mode */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">โหมดการสอบ</h2>
        <div className="grid grid-cols-2 gap-3">
          {(['online', 'print'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`p-4 rounded-lg border-2 text-left transition-colors ${
                mode === m
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-2xl mb-1">{m === 'online' ? '💻' : '🖨️'}</div>
              <div className="font-medium text-sm">{m === 'online' ? 'ออนไลน์' : 'พิมพ์ใบงาน'}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {m === 'online' ? 'นักเรียนทำบนเว็บ + Timer' : 'พิมพ์ใบงาน + QR Code'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Timing */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">เวลา (ไม่บังคับ)</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="start_at">เริ่มสอบ</Label>
            <Input id="start_at" name="start_at" type="datetime-local" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="end_at">สิ้นสุด</Label>
            <Input id="end_at" name="end_at" type="datetime-local" />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="duration_minutes">เวลาทำ (นาที)</Label>
          <Input id="duration_minutes" name="duration_minutes" type="number" min={1} placeholder="เช่น 60" className="max-w-[200px]" />
        </div>
      </div>

      {/* Question selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">เลือกโจทย์</h2>
          <Badge variant="secondary">{selectedQuestions.length} ข้อ</Badge>
        </div>

        <Input
          placeholder="ค้นหาโจทย์..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="max-h-80 overflow-y-auto space-y-2 border border-gray-100 rounded-lg p-2">
          {filteredQuestions.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">ไม่พบโจทย์</p>
          )}
          {filteredQuestions.map(q => (
            <label
              key={q.id}
              className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                selectedQuestions.includes(q.id)
                  ? 'bg-blue-50 border border-blue-200'
                  : 'hover:bg-gray-50 border border-transparent'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedQuestions.includes(q.id)}
                onChange={() => toggleQuestion(q.id)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{q.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{q.question_text}</p>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">
                {q.difficulty === 'easy' ? 'ง่าย'
                  : q.difficulty === 'medium' ? 'กลาง'
                  : q.difficulty === 'hard' ? 'ยาก' : 'วิเคราะห์'}
              </Badge>
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={loading || classrooms.length === 0}>
          {loading ? 'กำลังบันทึก...' : 'บันทึกชุดข้อสอบ'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          ยกเลิก
        </Button>
      </div>
    </form>
  )
}
