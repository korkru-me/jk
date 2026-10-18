'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, Download, Settings2 } from 'lucide-react'
import { unstable_rethrow, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { COVER_PRESETS } from '@/app/(app)/classrooms/_components/classroom-meta'
import { groupPreset } from '@/app/(app)/classrooms/_components/group-colors'
import type { ScoreAdjustmentBatchRow } from '@/app/(app)/assignments/[id]/results/_components/results-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { applyLateColorScoreAdjustment } from '@/lib/actions/late-submission-adjustments'
import { scoreParts, type GradingStudent, type GradingWorkspaceData } from '@/lib/grading-workspace'
import type { LateBandColorId } from '@/lib/late-submission'
import { summarizeStreakResults } from '@/lib/streak-results'
import { cn } from '@/lib/utils'

function finished(student: GradingStudent) {
  return student.submissionId != null && (student.status == null || student.status === 'submitted' || student.status === 'graded')
}

function streakSummary(data: GradingWorkspaceData) {
  return summarizeStreakResults(data.students.filter(finished).map(student => ({
    id: student.submissionId!, best_streak: student.bestStreak, streak_reached: student.streakReached,
  })), data.answers.map(answer => ({ submission_id: answer.submissionId, score: answer.score, max_score: answer.isVoid ? 0 : answer.maxScore })))
}

/** Quote embedded quotes/newlines and keep formula-like text inert in spreadsheets. */
function csvCell(value: string | number | null | undefined) {
  let text = value == null ? '' : String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

function colorLabel(color: string) {
  return COVER_PRESETS.find(preset => preset.id === color)?.label ?? color
}

function signed(value: number) {
  return `${value > 0 ? '+' : ''}${value.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`
}

function ColorChip({ color }: { color: string }) {
  return <Badge variant="outline"><span className={cn('size-2 rounded-full', groupPreset(color).solid)} aria-hidden="true" />{colorLabel(color)}</Badge>
}

export function GradingExportButton({ data }: { data: GradingWorkspaceData }) {
  function download() {
    const streak = data.assignment.completionRule === 'streak'
    const summary = streak ? streakSummary(data) : null
    const questions = new Map(data.questions.map(question => [question.id, question]))
    const pendingSubmissions = new Set<string>()
    for (const answer of data.answers) {
      const question = questions.get(answer.questionId)
      if (question && !data.voidedQuestionIds.includes(answer.questionId) && scoreParts(answer, question).pending) pendingSubmissions.add(answer.submissionId)
    }
    const headers = ['ชั้น', 'ห้อง', 'เลขที่', 'รหัสนักเรียน', 'ชื่อ–สกุล']
    const rows: (string | number | null | undefined)[][] = [streak
      ? [...headers, 'ผล', 'เกณฑ์ถูกติดต่อกัน', 'ติดกันมากสุด', 'จำนวนข้อที่ทำ', 'ตอบถูก']
      : [...headers, 'คะแนน', 'คะแนนเต็ม', 'สถานะการตรวจ']]
    for (const student of data.students) {
      const identity = [student.gradeLevel, student.sectionNumber ?? student.classroom, student.classNumber, student.studentCode, student.name]
      const submitted = finished(student)
      if (streak) {
        const result = submitted ? summary?.byId.get(student.submissionId!) : null
        rows.push([...identity, !submitted ? student.status === 'in_progress' ? 'กำลังทำ' : 'ยังไม่ส่ง' : result?.reached ? 'ผ่าน' : 'ยังไม่ผ่าน',
          data.assignment.streakTarget, result?.best, result?.asked, result?.correct])
      } else {
        const status = !submitted ? student.status === 'in_progress' ? 'กำลังทำ' : 'ยังไม่ส่ง'
          : student.maxScore <= 0 ? 'ไม่มีข้อที่นับคะแนน'
            : pendingSubmissions.has(student.submissionId!) ? 'มีข้อรอตรวจ' : 'ตรวจครบแล้ว'
        rows.push([...identity, submitted ? student.score : null, submitted ? student.maxScore : null, status])
      }
    }
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${data.assignment.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100) || 'คะแนน'}_ผลการตรวจ.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }
  return <Button type="button" size="sm" variant="outline" className="pointer-coarse:min-h-11" onClick={download}><Download data-icon="inline-start" />ส่งออก CSV</Button>
}

interface AdjustmentConfirmation {
  assignmentId: string
  color: LateBandColorId
  adjustment: number
  reason: string
  count: number
}

export function GradingTools({ data, adjustmentBatches = [], applyAdjustmentAction = applyLateColorScoreAdjustment }: {
  data: GradingWorkspaceData
  adjustmentBatches?: ScoreAdjustmentBatchRow[]
  applyAdjustmentAction?: typeof applyLateColorScoreAdjustment
}) {
  const router = useRouter()
  const id = useId()
  const [color, setColor] = useState<LateBandColorId | ''>('')
  const [draft, setDraft] = useState('')
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState<AdjustmentConfirmation | null>(null)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const dismissFocus = useRef<HTMLElement | null>(null)
  const streak = data.assignment.completionRule === 'streak'
  const groups = useMemo(() => {
    const result = new Map<LateBandColorId, { count: number; labels: Set<string> }>()
    for (const student of data.students) {
      if (!finished(student) || student.timing?.status !== 'late') continue
      const band = student.timing.band
      const group = result.get(band.color) ?? { count: 0, labels: new Set<string>() }
      group.count++
      group.labels.add(band.label)
      result.set(band.color, group)
    }
    return result
  }, [data.students])
  const selected = color ? groups.get(color) : null
  const adjustment = Number(draft)
  const valid = !streak && !!color && !!selected && draft.trim() !== '' && Number.isFinite(adjustment) && adjustment >= -10000 && adjustment <= 10000
  const latestBatches = useMemo(() => [...adjustmentBatches].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at)).slice(0, 5), [adjustmentBatches])
  const streakStats = useMemo(() => streak ? streakSummary(data) : null, [data, streak])

  async function applyAdjustment() {
    if (!confirmation || confirmation.assignmentId !== data.assignment.id || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await applyAdjustmentAction({ assignmentId: confirmation.assignmentId, color: confirmation.color, adjustment: confirmation.adjustment, reason: confirmation.reason })
      if ('error' in result) { setError(result.error || 'ปรับคะแนนไม่สำเร็จ กรุณาลองใหม่'); return }
      setConfirmation(null)
      setDraft('')
      setReason('')
      toast.success(`ปรับคะแนนนักเรียน ${result.affectedCount.toLocaleString('th-TH')} คนแล้ว`)
      router.refresh()
    } catch (caught) {
      unstable_rethrow(caught)
      setError('ยังยืนยันผลการปรับคะแนนไม่ได้ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่')
    } finally { setBusy(false) }
  }

  return <Card radius="md" className="min-w-0">
    <details className="group/grading-tools">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11">
        <Settings2 className="size-4 text-muted-foreground" aria-hidden="true" />เครื่องมือและประวัติคะแนน
        <ChevronDown className="ml-auto size-4 text-muted-foreground group-open/grading-tools:rotate-180" aria-hidden="true" />
      </summary>
      <div className="flex min-w-0 flex-col gap-3 border-t px-3 py-3">
        {streak && streakStats ? <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>เกณฑ์ถูกติดกัน {data.assignment.streakTarget ?? '—'} ข้อ</span><span>ผ่านแล้ว {streakStats.reachedCount.toLocaleString('th-TH')} คน</span><span>ค่ากลางจำนวนข้อที่ใช้ {streakStats.medianAsked ?? '—'} ข้อ</span>
        </p> : groups.size > 0 ? <>
          <FieldGroup className="flex-row flex-wrap items-end gap-2">
            <Field className="w-full gap-1 sm:w-auto">
              <FieldLabel htmlFor={`${id}-color`}>กลุ่มสีส่งช้า</FieldLabel>
              <NativeSelect id={`${id}-color`} value={color} className="sm:max-w-60 pointer-coarse:min-h-11" disabled={busy} onChange={event => setColor(event.target.value as LateBandColorId | '')}>
                <option value="">เลือกกลุ่มสี</option>
                {[...groups].map(([groupColor, group]) => <option key={groupColor} value={groupColor}>{colorLabel(groupColor)} · {[...group.labels].join(', ')} ({group.count} คน)</option>)}
              </NativeSelect>
            </Field>
            <Field className="w-32 gap-1">
              <FieldLabel htmlFor={`${id}-amount`}>ปรับคะแนน</FieldLabel>
              <Input id={`${id}-amount`} type="number" inputMode="decimal" min={-10000} max={10000} step="0.01" value={draft} disabled={busy} placeholder="เช่น -2" onChange={event => setDraft(event.target.value)} className="pointer-coarse:min-h-11" />
            </Field>
            <Field className="min-w-40 flex-1 gap-1">
              <FieldLabel htmlFor={`${id}-reason`}>เหตุผล (ไม่บังคับ)</FieldLabel>
              <Input id={`${id}-reason`} maxLength={200} value={reason} disabled={busy} placeholder="เช่น ส่งหลังช่วงผ่อนผัน" onChange={event => setReason(event.target.value)} className="pointer-coarse:min-h-11" />
            </Field>
            <Button ref={trigger} type="button" size="sm" className="pointer-coarse:min-h-11" disabled={!valid || busy} onClick={() => {
              if (!valid || !color || !selected) return
              setError(null)
              setConfirmingClose(false)
              setConfirmation({ assignmentId: data.assignment.id, color, adjustment: Math.round(adjustment * 100) / 100, reason, count: selected.count })
            }}>ตั้งค่าให้ทั้งกลุ่ม</Button>
          </FieldGroup>
          <FieldDescription>ค่าที่กรอกแทนค่าปรับเดิมของกลุ่ม ไม่บวกซ้ำ เช่น -2 คือหัก 2 คะแนน และ 0 คือล้างค่าปรับ · ช่วง -10,000 ถึง 10,000 คะแนน</FieldDescription>
        </> : <p className="text-xs text-muted-foreground">ยังไม่มีนักเรียนที่ส่งงานในกลุ่มสีส่งช้า</p>}

        {!streak && latestBatches.length > 0 && <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-medium">ประวัติปรับคะแนนล่าสุด</h2>
          <Table>
            <TableHeader><TableRow><TableHead>กลุ่มสี</TableHead><TableHead>ค่าปรับ</TableHead><TableHead>จำนวน</TableHead><TableHead>ผู้ปรับ / เวลา</TableHead><TableHead>เหตุผล</TableHead></TableRow></TableHeader>
            <TableBody>{latestBatches.map(batch => {
              const date = new Date(batch.created_at)
              return <TableRow key={batch.id}><TableCell><ColorChip color={batch.color} /></TableCell><TableCell>{signed(batch.adjustment)}</TableCell><TableCell>{batch.affected_count.toLocaleString('th-TH')} คน</TableCell><TableCell className="whitespace-normal"><span>{batch.changed_by_name || '—'}</span><span className="ml-2 text-xs text-muted-foreground">{Number.isFinite(date.getTime()) ? date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' }) : '—'}</span></TableCell><TableCell className="max-w-80 whitespace-normal [overflow-wrap:anywhere]">{batch.reason || '—'}</TableCell></TableRow>
            })}</TableBody>
          </Table>
        </div>}
      </div>
    </details>

    <Dialog open={confirmation !== null && confirmation.assignmentId === data.assignment.id} onOpenChange={(open, details) => {
      if (open) return
      if (busy) { details.cancel(); return }
      if (details.reason === 'outside-press' || details.reason === 'escape-key') {
        details.cancel()
        dismissFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        setConfirmingClose(true)
        return
      }
      setConfirmation(null)
    }}>
      <DialogContent className="gap-3 sm:max-w-lg" showCloseButton={false} finalFocus={trigger}>
        <DialogHeader className="gap-2"><DialogTitle>ยืนยันปรับคะแนนทั้งกลุ่ม?</DialogTitle><DialogDescription>
          ตั้งค่าปรับเป็น {signed(confirmation?.adjustment ?? 0)} คะแนน ให้นักเรียน {confirmation?.count ?? 0} คนในกลุ่มสี{confirmation ? colorLabel(confirmation.color) : ''} ค่านี้จะแทนค่าปรับเดิมและเก็บประวัติการเปลี่ยนแปลง
        </DialogDescription></DialogHeader>
        {confirmation?.reason && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">เหตุผล: {confirmation.reason}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2 py-3"><Button type="button" variant="outline" className="pointer-coarse:min-h-11" disabled={busy} onClick={() => setConfirmation(null)}>กลับไปแก้ไข</Button><Button type="button" className="pointer-coarse:min-h-11" disabled={busy} onClick={() => { void applyAdjustment() }}>{busy ? 'กำลังบันทึก…' : 'ยืนยันปรับคะแนน'}</Button></DialogFooter>
      </DialogContent>
      <ConfirmDialog open={confirmingClose} onOpenChange={setConfirmingClose} title="ปิดคำยืนยันปรับคะแนน?" description="ยังไม่มีการส่งคำสั่งปรับคะแนน ค่าที่กรอกในฟอร์มจะยังอยู่" cancelLabel="กลับไปดำเนินการต่อ" confirmLabel="ยืนยันปิด" finalFocus={confirmation ? dismissFocus : trigger} onConfirm={() => { setConfirmingClose(false); setConfirmation(null) }} />
    </Dialog>
  </Card>
}
