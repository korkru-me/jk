'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { DuplicateHit } from '@/lib/actions/question-export'

interface Props {
  duplicates: DuplicateHit[]
  isPending: boolean
  onCancel: () => void
  onSkip: () => void
  onRename: () => void
}

export function ImportDuplicateDialog({ duplicates, isPending, onCancel, onSkip, onRename }: Props) {
  return (
    <Dialog open={duplicates.length > 0} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>พบโจทย์ที่อาจซ้ำ {duplicates.length} ข้อ</DialogTitle>
          <DialogDescription>
            โจทย์ต่อไปนี้มีชื่อหรือเนื้อหาตรงกับโจทย์ที่มีอยู่แล้วในคลังของคุณ เลือกวิธีจัดการก่อนนำเข้าที่เหลือ
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-48 overflow-y-auto space-y-1 text-sm">
          {duplicates.map(d => (
            <li key={d.index} className="px-2.5 py-1.5 rounded-lg bg-warning/10 text-warning truncate">
              {d.title}
            </li>
          ))}
        </ul>

        <DialogFooter className="sm:flex-col">
          <Button onClick={onRename} disabled={isPending} className="w-full">
            นำเข้าทั้งหมด (ตั้งชื่อข้อที่ซ้ำใหม่ เช่น &quot;(2)&quot;)
          </Button>
          <Button onClick={onSkip} disabled={isPending} variant="outline" className="w-full">
            ข้ามข้อที่ซ้ำ แล้วนำเข้าที่เหลือ
          </Button>
          <Button onClick={onCancel} disabled={isPending} variant="ghost" className="w-full">
            ยกเลิกการนำเข้าทั้งหมด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
