'use client'

import { useEffect, useRef, useState } from 'react'
import { Ban } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { prepareVoidQuestion, voidAssignmentQuestion } from '@/lib/actions/question-regrading'

interface Impact { submissionCount: number; activeCount: number }
interface Props {
  assignmentId: string
  questionId: string
  isVoid: boolean
  size?: 'xs' | 'sm'
  prepare?: typeof prepareVoidQuestion
  apply?: typeof voidAssignmentQuestion
  onComplete?: () => void
}

export function VoidQuestionButton({ assignmentId, questionId, isVoid, size = 'sm', prepare = prepareVoidQuestion, apply = voidAssignmentQuestion, onComplete }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState('')
  const [impact, setImpact] = useState<Impact | null>(null)
  const [reason, setReason] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const focus = useRef<HTMLElement | null>(null)
  const lifecycle = useRef({ mounted: false, revision: 0 })

  useEffect(() => {
    lifecycle.current.mounted = true
    lifecycle.current.revision += 1
    return () => {
      lifecycle.current.mounted = false
      lifecycle.current.revision += 1
    }
  }, [assignmentId, questionId])

  async function prepareChange() {
    if (busy || isVoid) return
    const revision = lifecycle.current.revision
    const isCurrent = () => lifecycle.current.mounted && lifecycle.current.revision === revision
    setBusy(true)
    try {
      const result = await prepare(assignmentId, questionId)
      if (!isCurrent()) return
      if ('error' in result) { toast.error(result.error); return }
      setToken(result.token); setImpact(result.impact); setReason(''); setAcknowledged(false); setOpen(true)
    } catch { if (isCurrent()) toast.error('ตรวจผลกระทบไม่สำเร็จ กรุณาลองใหม่') }
    finally { if (isCurrent()) setBusy(false) }
  }

  async function confirmChange() {
    if (!acknowledged || reason.trim().length < 3 || busy) return
    const revision = lifecycle.current.revision
    const isCurrent = () => lifecycle.current.mounted && lifecycle.current.revision === revision
    setBusy(true)
    try {
      const result = await apply(assignmentId, questionId, token, reason)
      if (!isCurrent()) return
      if ('error' in result) { toast.error(result.error); return }
      setOpen(false); toast.success('ทำข้อเป็นโมฆะและปรับคะแนนทั้งงานแล้ว')
      onComplete?.(); router.refresh()
    } catch { if (isCurrent()) toast.error('ทำข้อเป็นโมฆะไม่สำเร็จ กรุณาลองใหม่') }
    finally { if (isCurrent()) setBusy(false) }
  }

  if (isVoid) return <Badge variant="secondary">โมฆะ · ไม่นับคะแนน</Badge>

  return <>
    <Tooltip>
      <TooltipTrigger render={<Button ref={trigger} type="button" size={size} variant="destructive" className="pointer-coarse:min-h-11" disabled={busy} onClick={prepareChange}>
        <Ban data-icon="inline-start" /> ทำข้อเป็นโมฆะ
      </Button>} />
      <TooltipContent>ไม่นับทั้งคะแนนที่ได้และคะแนนเต็มของข้อนี้ในการคำนวณคะแนนรวมของงานนี้</TooltipContent>
    </Tooltip>
    <Dialog open={open} onOpenChange={(next, details) => {
      if (!next && (busy || details.reason === 'outside-press' || details.reason === 'escape-key')) {
        details.cancel()
        if (!busy) { focus.current = document.activeElement as HTMLElement; setConfirmClose(true) }
        return
      }
      setOpen(next)
    }}>
      <DialogContent className="gap-3 sm:max-w-lg" showCloseButton={false} finalFocus={trigger}>
        <DialogHeader className="gap-2">
          <DialogTitle>ทำข้อนี้เป็นโมฆะ?</DialogTitle>
          <DialogDescription>ตัดทั้งคะแนนที่ได้และคะแนนเต็มของข้อนี้ออกจากนักเรียนทุกคนในงานนี้ รวมทุกครั้งที่ทำ คำตอบเดิมจะเก็บไว้ และคะแนนกับผลผ่านอาจเปลี่ยนแปลง</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">มีผล {impact?.submissionCount ?? 0} รอบ · ใช้กับงานนี้เท่านั้น</p>
        {(impact?.activeCount ?? 0) > 0 ? <p className="text-sm text-warning">ยังมีนักเรียนกำลังทำ {impact?.activeCount} รอบ กรุณารอให้ส่งครบก่อน</p> : <>
          <Field className="gap-1">
            <FieldLabel htmlFor={`void-reason-${questionId}`}>เหตุผลที่ทำข้อเป็นโมฆะ</FieldLabel>
            <Input id={`void-reason-${questionId}`} value={reason} onChange={event => setReason(event.target.value)} maxLength={300} placeholder="เช่น โจทย์มีข้อมูลไม่ครบ" disabled={busy} />
          </Field>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} disabled={busy} />
            ฉันรับทราบว่าคะแนนและคะแนนเต็มจะเปลี่ยนแปลง
          </label>
        </>}
        <DialogFooter className="gap-2 py-3">
          <Button type="button" variant="outline" className="pointer-coarse:min-h-11" disabled={busy} onClick={() => setOpen(false)}>กลับไปตรวจ</Button>
          {(impact?.activeCount ?? 0) === 0 && <Button type="button" variant="destructive" className="pointer-coarse:min-h-11" disabled={busy || !acknowledged || reason.trim().length < 3} onClick={confirmChange}>ยืนยันทำข้อเป็นโมฆะ</Button>}
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog open={confirmClose} onOpenChange={setConfirmClose} title="ปิดคำยืนยัน?" description="ยังไม่มีการทำข้อเป็นโมฆะ เหตุผลที่กรอกจะไม่ถูกบันทึก" cancelLabel="กลับไปดำเนินการต่อ" confirmLabel="ยืนยันปิด" finalFocus={focus}
        onConfirm={() => { setConfirmClose(false); setOpen(false) }} />
    </Dialog>
  </>
}
