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
import { RichText } from '@/components/ui/rich-text'
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
  public:  'bg-success/10 text-success',
  private: 'bg-muted text-muted-foreground',
  school:  'bg-primary/10 text-primary',
  pending: 'bg-warning/10 text-warning',
}
const DIFF_STYLE: Record<string, string> = {
  easy:       'bg-success/10 text-success',
  medium:     'bg-warning/10 text-warning',
  hard:       'bg-destructive/10 text-destructive',
  analytical: 'bg-tint-1/10 text-tint-1',
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
          <thead className="bg-muted border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">ชื่อโจทย์</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">หมวด</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">ระดับ</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">ประเภท</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Visibility</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">ผู้สร้าง</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">วันที่</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {questions.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">ไม่พบโจทย์</td></tr>
            )}
            {questions.map((q) => (
              <tr key={q.id} className="hover:bg-muted transition-colors">
                <td className="px-4 py-3 max-w-xs">
                  <p className="font-medium text-foreground truncate">{q.title}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{q.question_text}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{q.question_categories?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${DIFF_STYLE[q.difficulty]}`}>
                    {q.difficulty}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{q.question_type}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${VIS_STYLE[q.visibility]}`}>
                    {q.visibility}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{q.users?.full_name ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                  {new Date(q.created_at).toLocaleDateString('th-TH')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreview(q)}
                      className="text-xs text-primary hover:underline"
                    >
                      ดู
                    </button>
                    <Link
                      href={`/questions/${q.id}/edit`}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      แก้ไข
                    </Link>
                    <button
                      onClick={() => handleDelete(q.id, q.title)}
                      className="text-xs text-destructive hover:underline"
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
                <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">{preview.question_type}</span>
                {preview.question_categories && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary">{preview.question_categories.name}</span>
                )}
              </div>
              <p className="text-muted-foreground whitespace-pre-line border rounded-lg p-3 bg-muted">{preview.question_text}</p>
              {preview.question_type === 'written' && preview.answer_formula && (
                <div className="border rounded-lg p-3 bg-primary/10">
                  <p className="text-xs text-primary mb-1">สูตรคำตอบ</p>
                  <p className="font-mono text-primary">{preview.answer_formula} {preview.answer_unit}</p>
                </div>
              )}
              {(preview.solution_text || (preview.solution_image_urls ?? []).length > 0) && (
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-xs text-muted-foreground mb-1">เฉลย</p>
                  {preview.solution_text && <RichText text={preview.solution_text} className="text-muted-foreground whitespace-pre-line block" />}
                  {(preview.solution_image_urls ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {(preview.solution_image_urls ?? []).map(url => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={url} src={url} alt="รูปประกอบเฉลย" className="max-h-32 rounded-lg border object-contain" />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {preview.rejected_reason && (
                <div className="border border-destructive/20 rounded-lg p-3 bg-destructive/10">
                  <p className="text-xs text-destructive mb-1">เหตุผลที่ถูกปฏิเสธ</p>
                  <p className="text-destructive">{preview.rejected_reason}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">สร้างโดย: {preview.users?.full_name} · {new Date(preview.created_at).toLocaleString('th-TH')}</p>
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
