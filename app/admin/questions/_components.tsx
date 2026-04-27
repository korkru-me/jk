'use client'

import { useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { adminDeleteQuestion } from '@/lib/actions/admin'
import type { Question, QuestionCategory } from '@/lib/types'
import Link from 'next/link'

// ─── Filter bar ─────────────────────────────────────────────
export function QuestionsFilter({ categories }: { categories: QuestionCategory[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function update(key: string, value: string) {
    const p = new URLSearchParams(searchParams.toString())
    if (value && value !== 'all') p.set(key, value)
    else p.delete(key)
    router.push(`${pathname}?${p.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <Input
        placeholder="ค้นหาชื่อโจทย์..."
        defaultValue={searchParams.get('search') ?? ''}
        onChange={(e) => update('search', e.target.value)}
        className="w-52"
      />
      <Select
        value={searchParams.get('visibility') ?? 'all'}
        onValueChange={(v) => v !== null && update('visibility', v)}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Visibility" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">ทุก Visibility</SelectItem>
          <SelectItem value="public">Public</SelectItem>
          <SelectItem value="private">Private</SelectItem>
          <SelectItem value="school">School</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={searchParams.get('category') ?? 'all'}
        onValueChange={(v) => v !== null && update('category', v)}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="หมวดหมู่" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">ทุกหมวด</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={searchParams.get('difficulty') ?? 'all'}
        onValueChange={(v) => v !== null && update('difficulty', v)}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="ระดับ" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">ทุกระดับ</SelectItem>
          <SelectItem value="easy">ง่าย</SelectItem>
          <SelectItem value="medium">ปานกลาง</SelectItem>
          <SelectItem value="hard">ยาก</SelectItem>
          <SelectItem value="analytical">วิเคราะห์</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

// ─── Row actions ─────────────────────────────────────────────
const VIS_STYLE: Record<string, string> = {
  public:  'bg-green-100 text-green-700',
  private: 'bg-gray-100 text-gray-600',
  school:  'bg-blue-100 text-blue-700',
  pending: 'bg-yellow-100 text-yellow-700',
}
const DIFF_STYLE: Record<string, string> = {
  easy:       'bg-green-50 text-green-700',
  medium:     'bg-yellow-50 text-yellow-700',
  hard:       'bg-red-50 text-red-700',
  analytical: 'bg-purple-50 text-purple-700',
}

type Row = Question & {
  question_categories: { name: string } | null
  users: { full_name: string; email: string } | null
}

export function QuestionTable({ questions }: { questions: Row[] }) {
  const [preview, setPreview] = useState<Row | null>(null)
  const [, startTransition] = useTransition()

  function handleDelete(id: string, title: string) {
    if (!confirm(`ลบโจทย์ "${title}"?`)) return
    startTransition(async () => {
      const res = await adminDeleteQuestion(id)
      if (res?.error) toast.error(res.error)
      else toast.success('ลบโจทย์แล้ว')
    })
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ชื่อโจทย์</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">หมวด</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ระดับ</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ประเภท</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Visibility</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ผู้สร้าง</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">วันที่</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {questions.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12 text-gray-400">ไม่พบโจทย์</td></tr>
            )}
            {questions.map((q) => (
              <tr key={q.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 max-w-xs">
                  <p className="font-medium text-gray-900 truncate">{q.title}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{q.question_text}</p>
                </td>
                <td className="px-4 py-3 text-gray-600">{q.question_categories?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${DIFF_STYLE[q.difficulty]}`}>
                    {q.difficulty}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{q.question_type}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${VIS_STYLE[q.visibility]}`}>
                    {q.visibility}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">{q.users?.full_name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                  {new Date(q.created_at).toLocaleDateString('th-TH')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreview(q)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      ดู
                    </button>
                    <Link
                      href={`/questions/${q.id}/edit`}
                      className="text-xs text-gray-600 hover:underline"
                    >
                      แก้ไข
                    </Link>
                    <button
                      onClick={() => handleDelete(q.id, q.title)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      ลบ
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{preview?.title}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs ${VIS_STYLE[preview.visibility]}`}>{preview.visibility}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${DIFF_STYLE[preview.difficulty]}`}>{preview.difficulty}</span>
                <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{preview.question_type}</span>
                {preview.question_categories && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">{preview.question_categories.name}</span>
                )}
              </div>
              <p className="text-gray-700 whitespace-pre-line border rounded-lg p-3 bg-gray-50">{preview.question_text}</p>
              {preview.question_type === 'written' && preview.answer_formula && (
                <div className="border rounded-lg p-3 bg-blue-50">
                  <p className="text-xs text-blue-500 mb-1">สูตรคำตอบ</p>
                  <p className="font-mono text-blue-800">{preview.answer_formula} {preview.answer_unit}</p>
                </div>
              )}
              {preview.solution_text && (
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">เฉลย</p>
                  <p className="text-gray-700 whitespace-pre-line">{preview.solution_text}</p>
                </div>
              )}
              {preview.rejected_reason && (
                <div className="border border-red-200 rounded-lg p-3 bg-red-50">
                  <p className="text-xs text-red-500 mb-1">เหตุผลที่ถูกปฏิเสธ</p>
                  <p className="text-red-700">{preview.rejected_reason}</p>
                </div>
              )}
              <p className="text-xs text-gray-400">สร้างโดย: {preview.users?.full_name} · {new Date(preview.created_at).toLocaleString('th-TH')}</p>
            </div>
          )}
          <DialogFooter showCloseButton>
            <Link href={`/questions/${preview?.id}/edit`} className={cn(buttonVariants({ size: 'sm' }))}>
              แก้ไขโจทย์
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
