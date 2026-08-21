'use client'

import { useState, useTransition } from 'react'
import { X, Clock, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { grantExtension, revokeExtension } from '@/lib/actions/extensions'
import { IconButton } from '@/components/ui/icon-button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'

interface Props {
  assignmentId: string
  assignmentTitle: string
  studentId: string
  studentName: string
  currentExtension?: { extended_end_at: string; note: string | null }
  onClose: () => void
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ExtensionDialog({ assignmentId, assignmentTitle, studentId, studentName, currentExtension, onClose }: Props) {
  const [extendedEndAt, setExtendedEndAt] = useState(
    currentExtension ? toLocalInputValue(currentExtension.extended_end_at) : ''
  )
  const [note, setNote] = useState(currentExtension?.note ?? '')
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    if (!extendedEndAt) { toast.error('กรุณาเลือกวันเวลา'); return }
    startTransition(async () => {
      const res = await grantExtension(assignmentId, studentId, new Date(extendedEndAt).toISOString(), note)
      if (res?.error) toast.error(res.error)
      else { toast.success(`ขยายเวลาให้ ${studentName} แล้ว`); onClose() }
    })
  }

  function handleRevoke() {
    startTransition(async () => {
      const res = await revokeExtension(assignmentId, studentId)
      if (res?.error) toast.error(res.error)
      else { toast.success('ยกเลิกการขยายเวลาแล้ว'); onClose() }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-tint-1" /> ขยายเวลา
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{studentName} — {assignmentTitle}</p>
          </div>
          <IconButton onClick={onClose} label="ปิด">
            <X />
          </IconButton>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">ปิดรับเมื่อ (สำหรับนักเรียนคนนี้)</label>
            <Input
              type="datetime-local"
              value={extendedEndAt}
              onChange={e => setExtendedEndAt(e.target.value)} className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">หมายเหตุ (ไม่บังคับ)</label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="เช่น ลาป่วย" className="w-full resize-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="flex-1 px-4 py-2 bg-tint-1 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              {currentExtension ? 'อัปเดต' : 'ขยายเวลา'}
            </button>
            {currentExtension && (
              <button
                onClick={handleRevoke}
                disabled={isPending}
                className="px-3 py-2 border border-destructive/20 text-destructive hover:bg-destructive/10 rounded-xl transition-colors disabled:opacity-50"
                title="ยกเลิกการขยายเวลา"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
