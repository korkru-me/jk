'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { approveQuestion, rejectQuestion } from '@/lib/actions/admin'
import type { Question } from '@/lib/types'

type Row = Question & {
  question_categories: { name: string } | null
  users: { full_name: string; email: string } | null
}

export function PendingTable({ questions }: { questions: Row[] }) {
  const [preview, setPreview] = useState<Row | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Row | null>(null)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleApprove(id: string, title: string) {
    if (!confirm(`อนุมัติโจทย์ "${title}" เป็น Public?`)) return
    startTransition(async () => {
      const res = await approveQuestion(id)
      if (res?.error) toast.error(res.error)
      else toast.success('อนุมัติโจทย์แล้ว')
    })
  }

  function handleReject() {
    if (!rejectTarget) return
    startTransition(async () => {
      const res = await rejectQuestion(rejectTarget.id, reason)
      if (res?.error) toast.error(res.error)
      else {
        toast.success('ปฏิเสธโจทย์แล้ว')
        setRejectTarget(null)
        setReason('')
      }
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
              <th className="text-left px-4 py-3 font-medium text-gray-600">ผู้สร้าง</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">วันที่ส่ง</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {questions.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-16 text-gray-400">
                  <p className="text-2xl mb-2">✅</p>
                  ไม่มีโจทย์รออนุมัติ
                </td>
              </tr>
            )}
            {questions.map((q) => (
              <tr key={q.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 max-w-xs">
                  <p className="font-medium text-gray-900 truncate">{q.title}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{q.question_text}</p>
                </td>
                <td className="px-4 py-3 text-gray-600">{q.question_categories?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <p className="text-gray-800">{q.users?.full_name ?? '—'}</p>
                  <p className="text-xs text-gray-400">{q.users?.email}</p>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(q.created_at).toLocaleDateString('th-TH')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreview(q)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      ดูโจทย์
                    </button>
                    <button
                      onClick={() => handleApprove(q.id, q.title)}
                      disabled={isPending}
                      className="text-xs text-green-600 hover:underline disabled:opacity-50"
                    >
                      อนุมัติ
                    </button>
                    <button
                      onClick={() => { setRejectTarget(q); setReason('') }}
                      className="text-xs text-red-600 hover:underline"
                    >
                      ปฏิเสธ
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
              <p className="text-gray-700 whitespace-pre-line border rounded-lg p-3 bg-gray-50">{preview.question_text}</p>
              {preview.question_type === 'written' && preview.answer_formula && (
                <div className="border rounded-lg p-3 bg-blue-50">
                  <p className="text-xs text-blue-500 mb-1">สูตรคำตอบ</p>
                  <p className="font-mono text-blue-800">{preview.answer_formula} {preview.answer_unit}</p>
                </div>
              )}
              {preview.mcq_options && (
                <div className="space-y-1">
                  {(preview.mcq_options as any[]).map((opt: any, i: number) => (
                    <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border ${opt.is_correct ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                      <span className="text-xs text-gray-500">{['ก','ข','ค','ง'][i]}.</span>
                      <span className="text-sm">{opt.text}</span>
                      {opt.is_correct && <span className="text-xs text-green-600 ml-auto">✓ ถูก</span>}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400">สร้างโดย: {preview.users?.full_name} ({preview.users?.email})</p>
            </div>
          )}
          <DialogFooter>
            <Button
              size="sm"
              onClick={() => { if (preview) { handleApprove(preview.id, preview.title); setPreview(null) } }}
              disabled={isPending}
            >
              ✅ อนุมัติ
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { if (preview) { setRejectTarget(preview); setPreview(null) } }}
            >
              ❌ ปฏิเสธ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(v) => !v && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ปฏิเสธโจทย์</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">โจทย์: <strong>{rejectTarget?.title}</strong></p>
            <div className="space-y-1.5">
              <Label>เหตุผลที่ปฏิเสธ (แจ้งครูผู้สร้าง)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="เช่น สูตรคำตอบไม่ถูกต้อง, โจทย์ซ้ำกับที่มีอยู่แล้ว..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleReject}
              disabled={isPending}
            >
              {isPending ? 'กำลังดำเนินการ...' : 'ยืนยันปฏิเสธ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
