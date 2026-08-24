'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Info, LockKeyhole, Search, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  confirmManualResearchScores,
  saveManualResearchScoreDraft,
} from '@/lib/actions/education-research'
import {
  formatResearchScore,
  parseResearchScoreInput,
  type ResearchScoreCell,
} from '@/lib/education-research-scores'
import { cn } from '@/lib/utils'
import type { EducationResearchMeasurement, EducationResearchScore } from '@/lib/types'

export interface ManualScoreEntryRow {
  participant_id: string
  order: number
  full_name: string
  student_code: string | null
  pretest_score: EducationResearchScore | null
  posttest_score: EducationResearchScore | null
  pretest_draft: number | null
  posttest_draft: number | null
}

type CellKey = `${string}:pretest` | `${string}:posttest`

export function ManualScoreEntryClient({ projectId, rows, pretest, posttest, classroomName }: { projectId: string; rows: ManualScoreEntryRow[]; pretest: EducationResearchMeasurement | null; posttest: EducationResearchMeasurement | null; classroomName: string }) {
  const router = useRouter()
  const initialValues = useMemo(() => buildInitialValues(rows), [rows])
  const [values, setValues] = useState<Record<CellKey, string>>(initialValues)
  const [baseline, setBaseline] = useState<Record<CellKey, string>>(initialValues)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'missing_pretest' | 'missing_posttest' | 'errors'>('all')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const inputs = useRef<Array<HTMLInputElement | null>>([])

  const cellState = useMemo(() => {
    const state = new Map<CellKey, ReturnType<typeof parseResearchScoreInput>>()
    for (const row of rows) {
      state.set(`${row.participant_id}:pretest`, parseResearchScoreInput(values[`${row.participant_id}:pretest`] ?? '', pretest?.max_score ?? null))
      state.set(`${row.participant_id}:posttest`, parseResearchScoreInput(values[`${row.participant_id}:posttest`] ?? '', posttest?.max_score ?? null))
    }
    return state
  }, [posttest?.max_score, pretest?.max_score, rows, values])

  const changedKeys = useMemo(() => Object.keys(values).filter(key => values[key as CellKey] !== baseline[key as CellKey]), [baseline, values])
  const hasChanges = changedKeys.length > 0
  const errorCount = [...cellState.values()].filter(value => value.error).length
  const validCells = buildPayload(rows, values, cellState, pretest, posttest)
  const overwriteCount = validCells.filter(cell => {
    const row = rows.find(item => item.participant_id === cell.participant_id)
    const existing = cell.measurement_id === pretest?.id ? row?.pretest_score : row?.posttest_score
    return existing !== null && existing !== undefined && Number(existing.raw_score) !== cell.raw_score
  }).length

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasChanges) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasChanges])

  const filteredRows = rows.filter(row => {
    const term = search.trim().toLocaleLowerCase('th')
    if (term && !`${row.full_name} ${row.student_code ?? ''}`.toLocaleLowerCase('th').includes(term)) return false
    const pre = cellState.get(`${row.participant_id}:pretest`)
    const post = cellState.get(`${row.participant_id}:posttest`)
    if (filter === 'missing_pretest' && pre?.value !== null) return false
    if (filter === 'missing_posttest' && post?.value !== null) return false
    if (filter === 'errors' && !pre?.error && !post?.error) return false
    return true
  })
  const pretestCount = rows.filter(row => cellState.get(`${row.participant_id}:pretest`)?.value !== null).length
  const posttestCount = rows.filter(row => cellState.get(`${row.participant_id}:posttest`)?.value !== null).length

  function saveDraft() {
    if (errorCount > 0) return toast.error('กรุณาแก้คะแนนที่ผิดก่อนบันทึกฉบับร่าง')
    startTransition(async () => {
      const result = await saveManualResearchScoreDraft({ project_id: projectId, rows: validCells })
      if (result.error) { toast.error(result.error); return }
      toast.success(`บันทึกฉบับร่างแล้ว ${result.saved_count} ค่า`)
      setBaseline(values)
    })
  }

  function confirmScores() {
    if (errorCount > 0) return toast.error('กรุณาแก้คะแนนที่ผิดก่อนยืนยัน')
    if (overwriteCount > 0 && !reason.trim()) return toast.error('กรุณาระบุเหตุผลเมื่อเปลี่ยนคะแนนเดิม')
    startTransition(async () => {
      const result = await confirmManualResearchScores({ project_id: projectId, rows: validCells, reason: reason.trim() || null })
      if (result.error) { toast.error(result.error); return }
      toast.success(`บันทึกคะแนนจริงแล้ว ${result.saved_count} ค่า`)
      setReviewOpen(false)
      setReason('')
      const confirmedValues = buildInitialValuesFromPayload(rows, validCells, pretest, posttest)
      setValues(confirmedValues)
      setBaseline(confirmedValues)
      router.refresh()
    })
  }

  return (
    <>
      <Card padding="md" className="border-primary/20 bg-primary/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex gap-3"><LockKeyhole className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" /><div><p className="font-semibold text-foreground">รายชื่อมาจากผู้เข้าร่วมที่ตรึงไว้และแก้ไม่ได้ในหน้านี้</p><p className="mt-1 text-sm text-muted-foreground">ช่องว่าง = ยังไม่มีคะแนน · 0 = ได้ศูนย์คะแนน · ห้อง {classroomName}</p></div></div><div className="text-sm text-muted-foreground">ก่อนเรียน: {sourceText(pretest)} · หลังเรียน: {sourceText(posttest)}</div></div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="นักเรียน" value={rows.length} suffix="คน" icon={Users} />
        <StatCard label="ก่อนเรียน" value={pretestCount} suffix={`/${rows.length}`} icon={CheckCircle2} tone="success" />
        <StatCard label="หลังเรียน" value={posttestCount} suffix={`/${rows.length}`} icon={CheckCircle2} tone="warning" />
        <StatCard label="พบข้อผิดพลาด" value={errorCount} suffix="จุด" icon={AlertTriangle} tone={errorCount > 0 ? 'destructive' : 'success'} />
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-md flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="ค้นหาชื่อนักเรียนหรือรหัส" /></div>
        <div className="flex flex-wrap gap-2">{([['all', `ทั้งหมด ${rows.length}`], ['missing_pretest', 'ขาดก่อนเรียน'], ['missing_posttest', 'ขาดหลังเรียน'], ['errors', `มีข้อผิดพลาด ${errorCount}`]] as const).map(([value, label]) => <Button key={value} size="sm" variant={filter === value ? 'default' : 'outline'} onClick={() => setFilter(value)}>{label}</Button>)}</div>
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full min-w-[880px] text-sm"><thead className="bg-muted/70 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">เลขที่</th><th className="px-4 py-3 font-medium">นักเรียน</th><th className="px-4 py-3 font-medium">รหัสนักเรียน</th><th className="px-4 py-3 font-medium">ก่อนเรียน /{formatResearchScore(pretest?.max_score)}</th><th className="px-4 py-3 font-medium">หลังเรียน /{formatResearchScore(posttest?.max_score)}</th><th className="px-4 py-3 font-medium">สถานะ</th></tr></thead><tbody className="divide-y divide-border">{filteredRows.map((row, rowIndex) => {
          const preKey = `${row.participant_id}:pretest` as CellKey
          const postKey = `${row.participant_id}:posttest` as CellKey
          const preState = cellState.get(preKey)
          const postState = cellState.get(postKey)
          return <tr key={row.participant_id}><td className="px-4 py-3 text-muted-foreground">{row.order}</td><td className="px-4 py-3 font-medium text-foreground">{row.full_name}</td><td className="px-4 py-3 text-muted-foreground">{row.student_code ?? '—'}</td><EditableScoreCell value={values[preKey]} onChange={value => setValues(current => ({ ...current, [preKey]: value }))} error={preState?.error ?? null} enabled={pretest?.source_type === 'manual'} inputRef={element => { inputs.current[rowIndex * 2] = element }} onNext={() => inputs.current[rowIndex * 2 + 1]?.focus()} /><EditableScoreCell value={values[postKey]} onChange={value => setValues(current => ({ ...current, [postKey]: value }))} error={postState?.error ?? null} enabled={posttest?.source_type === 'manual'} inputRef={element => { inputs.current[rowIndex * 2 + 1] = element }} onNext={() => inputs.current[(rowIndex + 1) * 2]?.focus()} /><td className="px-4 py-3"><RowStatus pre={preState} post={postState} /></td></tr>
        })}{filteredRows.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">ไม่พบรายการตามตัวกรอง</td></tr>}</tbody></table></div>
      </Card>

      <Card padding="md" className="sticky bottom-3 z-10 shadow-lg"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Info className="size-4" aria-hidden="true" /> มีการเปลี่ยนแปลง {changedKeys.length} ช่องที่ยังไม่ยืนยัน</div><div className="flex flex-wrap gap-2"><Button variant="outline" render={<Link href={`/research/${projectId}/data`} />}>ยกเลิก</Button><Button variant="outline" onClick={saveDraft} disabled={pending || errorCount > 0}>บันทึกฉบับร่าง</Button><Button onClick={() => setReviewOpen(true)} disabled={pending || errorCount > 0 || validCells.length === 0}>ตรวจสอบและยืนยัน</Button></div></div></Card>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>ตรวจสอบก่อนบันทึกคะแนนจริง</DialogTitle><DialogDescription>ระบบจะบันทึกค่าที่กรอกครบพร้อมกัน ช่องว่างจะไม่สร้างคะแนนและไม่ใช้ลบคะแนนเดิม</DialogDescription></DialogHeader><div className="grid grid-cols-3 gap-3"><ReviewStat label="ค่าที่จะบันทึก" value={validCells.length} /><ReviewStat label="เปลี่ยนคะแนนเดิม" value={overwriteCount} tone={overwriteCount > 0 ? 'warning' : 'default'} /><ReviewStat label="คะแนนยังขาด" value={editableCellCount(rows, pretest, posttest) - validCells.length} /></div>{overwriteCount > 0 && <div className="space-y-2"><Label htmlFor="manual-change-reason">เหตุผลที่เปลี่ยนคะแนนเดิม <span className="text-destructive">*</span></Label><Textarea id="manual-change-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} placeholder="เช่น ตรวจทานกระดาษคำตอบแล้วพบว่าบันทึกคะแนนผิด" /></div>}<DialogFooter><Button variant="outline" onClick={() => setReviewOpen(false)} disabled={pending}>กลับไปตรวจสอบ</Button><Button onClick={confirmScores} disabled={pending || (overwriteCount > 0 && !reason.trim())}>{pending ? 'กำลังบันทึก…' : 'ยืนยันบันทึกคะแนน'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}

function EditableScoreCell({ value, onChange, error, enabled, inputRef, onNext }: { value: string; onChange: (value: string) => void; error: string | null; enabled: boolean; inputRef: (element: HTMLInputElement | null) => void; onNext: () => void }) {
  return <td className="px-4 py-2 align-top"><Input ref={inputRef} value={value} onChange={event => onChange(event.target.value)} disabled={!enabled} inputMode="decimal" aria-invalid={Boolean(error)} placeholder={enabled ? 'ยังไม่มีคะแนน' : 'ใช้แหล่งอื่น'} onKeyDown={event => { if (event.key === 'Enter' || event.key === 'ArrowDown') { event.preventDefault(); onNext() } }} />{error && <p className="mt-1 text-xs text-destructive">{error}</p>}</td>
}

function RowStatus({ pre, post }: { pre: ReturnType<typeof parseResearchScoreInput> | undefined; post: ReturnType<typeof parseResearchScoreInput> | undefined }) {
  if (pre?.error || post?.error) return <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">ต้องแก้ไข</span>
  if (pre?.value === null) return <span className="rounded-full bg-warning/10 px-2 py-1 text-xs font-medium text-warning">ขาดก่อนเรียน</span>
  if (post?.value === null) return <span className="rounded-full bg-warning/10 px-2 py-1 text-xs font-medium text-warning">ขาดหลังเรียน</span>
  return <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-medium text-success">ครบแล้ว</span>
}

function StatCard({ label, value, suffix, icon: Icon, tone = 'primary' }: { label: string; value: number; suffix: string; icon: typeof Users; tone?: 'primary' | 'success' | 'warning' | 'destructive' }) { const toneClass = tone === 'success' ? 'bg-success/10 text-success' : tone === 'warning' ? 'bg-warning/10 text-warning' : tone === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'; return <Card padding="lg"><div className="flex items-center gap-3"><div className={cn('flex size-10 items-center justify-center rounded-xl', toneClass)}><Icon className="size-5" aria-hidden="true" /></div><div><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}<span className="ml-1 text-base font-medium text-muted-foreground">{suffix}</span></p></div></div></Card> }
function ReviewStat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'warning' }) { return <Card padding="sm" className={tone === 'warning' ? 'border-warning/30 bg-warning/5' : undefined}><p className="text-xs text-muted-foreground">{label}</p><p className={cn('mt-1 text-xl font-bold', tone === 'warning' ? 'text-warning' : 'text-foreground')}>{value}</p></Card> }
function sourceText(measurement: EducationResearchMeasurement | null): string { return measurement?.source_type === 'manual' ? 'กรอกบนเว็บ' : measurement?.source_type === 'excel' ? 'Excel' : measurement?.source_type === 'korkru_exam' ? 'ข้อสอบ KorKru' : 'ยังไม่กำหนด' }

function buildInitialValues(rows: ManualScoreEntryRow[]): Record<CellKey, string> {
  const result = {} as Record<CellKey, string>
  for (const row of rows) {
    result[`${row.participant_id}:pretest`] = row.pretest_draft !== null ? String(row.pretest_draft) : row.pretest_score ? String(row.pretest_score.raw_score) : ''
    result[`${row.participant_id}:posttest`] = row.posttest_draft !== null ? String(row.posttest_draft) : row.posttest_score ? String(row.posttest_score.raw_score) : ''
  }
  return result
}

function buildPayload(rows: ManualScoreEntryRow[], values: Record<CellKey, string>, state: Map<CellKey, ReturnType<typeof parseResearchScoreInput>>, pretest: EducationResearchMeasurement | null, posttest: EducationResearchMeasurement | null): ResearchScoreCell[] {
  const cells: ResearchScoreCell[] = []
  for (const row of rows) {
    for (const [type, measurement] of [['pretest', pretest], ['posttest', posttest]] as const) {
      if (measurement?.source_type !== 'manual') continue
      const parsed = state.get(`${row.participant_id}:${type}`)
      if (parsed?.value !== null && parsed?.value !== undefined && !parsed.error) cells.push({ participant_id: row.participant_id, measurement_id: measurement.id, raw_score: parsed.value })
    }
  }
  return cells
}

function buildInitialValuesFromPayload(rows: ManualScoreEntryRow[], cells: ResearchScoreCell[], pretest: EducationResearchMeasurement | null, posttest: EducationResearchMeasurement | null): Record<CellKey, string> {
  const values = buildInitialValues(rows)
  for (const cell of cells) {
    const type = cell.measurement_id === pretest?.id ? 'pretest' : cell.measurement_id === posttest?.id ? 'posttest' : null
    if (type) values[`${cell.participant_id}:${type}`] = String(cell.raw_score)
  }
  return values
}

function editableCellCount(rows: ManualScoreEntryRow[], pretest: EducationResearchMeasurement | null, posttest: EducationResearchMeasurement | null): number {
  return rows.length * Number(pretest?.source_type === 'manual') + rows.length * Number(posttest?.source_type === 'manual')
}
