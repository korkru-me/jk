'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { deleteLearningStandard, updateLearningStandard } from '@/lib/actions/ioc-standards'

export interface StandardRow {
  id: string
  code: string
  description: string
  /** How many questions in the bank are paired with this indicator. */
  questionCount: number
  /** Only the teacher who added a row may rewrite or remove it. */
  mine: boolean
}

export function IocStandardsClient({ rows }: { rows: StandardRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map(row => <StandardCard key={row.id} row={row} />)}
    </div>
  )
}

function StandardCard({ row }: { row: StandardRow }) {
  const router = useRouter()
  const [confirm, confirmDialog] = useConfirm()
  const [editing, setEditing] = useState(false)
  const [code, setCode] = useState(row.code)
  const [description, setDescription] = useState(row.description)
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const result = await updateLearningStandard({ standard_id: row.id, code, description })
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success('บันทึกตัวชี้วัดแล้ว')
      setEditing(false)
      router.refresh()
    })
  }

  async function remove() {
    const ok = await confirm({
      title: `ลบ “${row.code || row.description.slice(0, 40)}” ออกจากคลัง?`,
      description: row.questionCount > 0
        ? `โจทย์ ${row.questionCount} ข้อที่เคยผูกกับตัวชี้วัดนี้จะไม่ถูกเติมให้อัตโนมัติอีก โจทย์เองยังอยู่ครบ และฟอร์ม IOC ที่ทำไปแล้วไม่เปลี่ยนแปลง เพราะแต่ละฟอร์มเก็บสำเนาของตัวเองไว้`
        : 'ตัวชี้วัดนี้ยังไม่ได้ผูกกับโจทย์ข้อใด',
      confirmLabel: 'ลบออกจากคลัง',
      variant: 'destructive',
    })
    if (!ok) return

    startTransition(async () => {
      const result = await deleteLearningStandard(row.id)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success('ลบออกจากคลังแล้ว')
      router.refresh()
    })
  }

  return (
    <Card padding="lg" className="space-y-3">
      {editing ? (
        <>
          <Input value={code} onChange={event => setCode(event.target.value)} placeholder="รหัส เช่น ค 3.1 ม.6/1" />
          <Textarea
            rows={3}
            value={description}
            onChange={event => setDescription(event.target.value)}
            placeholder="คำอธิบายตัวชี้วัด"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setCode(row.code)
                setDescription(row.description)
                setEditing(false)
              }}
            >
              ยกเลิก
            </Button>
            <Button size="sm" disabled={pending} onClick={save}>
              {pending ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{row.code || 'ตัวชี้วัดที่ไม่มีรหัส'}</p>
              {row.description ? (
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{row.description}</p>
              ) : null}
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              ผูกกับโจทย์ {row.questionCount} ข้อ
            </span>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {row.mine ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>แก้ไข</Button>
                <Button variant="ghost" size="sm" disabled={pending} onClick={remove}>ลบออกจากคลัง</Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">เพิ่มโดยครูท่านอื่น · แก้ไขได้เฉพาะผู้ที่เพิ่ม</span>
            )}
          </div>
        </>
      )}
      {confirmDialog}
    </Card>
  )
}
