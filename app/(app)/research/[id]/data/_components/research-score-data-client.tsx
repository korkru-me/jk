'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileSpreadsheet,
  Pencil,
  Search,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import {
  formatResearchScore,
  researchScoreSourceLabel,
} from '@/lib/education-research-scores'
import { cn } from '@/lib/utils'
import type {
  EducationResearchMeasurement,
  EducationResearchScore,
  EducationResearchScoreHistory,
} from '@/lib/types'

type HistoryWithActor = EducationResearchScoreHistory & { actor_name: string | null }

export interface ResearchScoreDataRow {
  participant_id: string
  student_id: string
  order: number
  full_name: string
  student_code: string | null
  pretest_score: EducationResearchScore | null
  posttest_score: EducationResearchScore | null
  pretest_history: HistoryWithActor[]
  posttest_history: HistoryWithActor[]
}

export function ResearchScoreDataClient({
  project,
  rows,
  pretest,
  posttest,
  initialStatusFilter,
}: {
  project: { id: string; classroom_name: string; passing_threshold_percent: number }
  rows: ResearchScoreDataRow[]
  pretest: EducationResearchMeasurement | null
  posttest: EducationResearchMeasurement | null
  initialStatusFilter: 'all' | 'ready' | 'missing'
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'missing'>(initialStatusFilter)
  const [sourceFilter, setSourceFilter] = useState<'all' | 'korkru_exam' | 'manual' | 'excel'>('all')
  const [selectedRow, setSelectedRow] = useState<ResearchScoreDataRow | null>(null)
  const pretestCount = rows.filter(row => row.pretest_score !== null).length
  const posttestCount = rows.filter(row => row.posttest_score !== null).length
  const pairedCount = rows.filter(row => row.pretest_score !== null && row.posttest_score !== null).length
  const missingCount = rows.length - pairedCount
  const canManual = pretest?.source_type === 'manual' || posttest?.source_type === 'manual'
  const canExcel = pretest?.source_type === 'excel' || posttest?.source_type === 'excel'

  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('th')
    return rows.filter(row => {
      const ready = row.pretest_score !== null && row.posttest_score !== null
      if (statusFilter === 'ready' && !ready) return false
      if (statusFilter === 'missing' && ready) return false
      if (sourceFilter !== 'all') {
        const sources = [row.pretest_score?.score_source, row.posttest_score?.score_source]
        if (!sources.includes(sourceFilter)) return false
      }
      return !term || `${row.full_name} ${row.student_code ?? ''}`.toLocaleLowerCase('th').includes(term)
    })
  }, [rows, search, sourceFilter, statusFilter])

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={Users} label="ผู้เข้าร่วม" value={rows.length} suffix="คน" />
        <SummaryCard icon={ClipboardCheck} label="ก่อนเรียน" value={pretestCount} suffix={`/${rows.length}`} tone="success" />
        <SummaryCard icon={ClipboardCheck} label="หลังเรียน" value={posttestCount} suffix={`/${rows.length}`} tone="warning" />
        <SummaryCard icon={CheckCircle2} label="คู่คะแนนพร้อมใช้" value={pairedCount} suffix={`/${rows.length}`} tone="success" />
      </div>

      {missingCount > 0 && (
        <Card padding="md" className="border-warning/30 bg-warning/5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" /><div><p className="font-semibold text-foreground">ยังขาดคู่คะแนน {missingCount} คน</p><p className="mt-1 text-sm text-muted-foreground">ช่องว่างจะไม่ถูกนับเป็น 0 และจะยังไม่รวมในการวิเคราะห์ก่อน–หลัง</p></div></div>
            <Button variant="outline" onClick={() => setStatusFilter('missing')}>ดูเฉพาะคะแนนที่ขาด</Button>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="ค้นหาชื่อนักเรียนหรือรหัส" aria-label="ค้นหานักเรียน" /></div>
          <NativeSelect value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="กรองสถานะคู่คะแนน"><option value="all">ทุกสถานะ</option><option value="ready">พร้อมวิเคราะห์</option><option value="missing">คะแนนขาด</option></NativeSelect>
          <NativeSelect value={sourceFilter} onChange={event => setSourceFilter(event.target.value as typeof sourceFilter)} aria-label="กรองแหล่งคะแนน"><option value="all">ทุกแหล่งคะแนน</option><option value="korkru_exam">ข้อสอบ KorKru</option><option value="manual">กรอกบนเว็บ</option><option value="excel">Excel</option></NativeSelect>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManual && <Button variant="outline" render={<Link href={`/research/${project.id}/data/manual`} />}><Pencil aria-hidden="true" /> กรอก/แก้ไขคะแนน</Button>}
          {canExcel && <Button variant="outline" render={<Link href={`/research/${project.id}/data/import`} />}><FileSpreadsheet aria-hidden="true" /> แม่แบบและนำเข้า Excel</Button>}
        </div>
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-muted/70 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">เลขที่</th><th className="px-4 py-3 font-medium">นักเรียน</th><th className="px-4 py-3 font-medium">ก่อนเรียน</th><th className="px-4 py-3 font-medium">หลังเรียน</th><th className="px-4 py-3 font-medium">คู่คะแนน</th><th className="px-4 py-3 font-medium">แหล่งที่มา</th><th className="px-4 py-3 text-right font-medium">จัดการ</th></tr></thead>
            <tbody className="divide-y divide-border">
              {filteredRows.map(row => {
                const ready = row.pretest_score !== null && row.posttest_score !== null
                return (
                  <tr key={row.participant_id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground">{row.order}</td>
                    <td className="px-4 py-3"><p className="font-medium text-foreground">{row.full_name}</p><p className="mt-0.5 text-xs text-muted-foreground">{row.student_code ?? 'ยังไม่มีรหัสนักเรียน'}</p></td>
                    <ScoreCell score={row.pretest_score} maxScore={pretest?.max_score ?? null} studentId={row.student_id} />
                    <ScoreCell score={row.posttest_score} maxScore={posttest?.max_score ?? null} studentId={row.student_id} />
                    <td className="px-4 py-3"><span className={cn('inline-flex rounded-full px-2 py-1 text-xs font-medium', ready ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>{ready ? 'พร้อมวิเคราะห์' : row.pretest_score ? 'รอคะแนนหลังเรียน' : row.posttest_score ? 'ขาดคะแนนก่อนเรียน' : 'ยังไม่มีคะแนน'}</span></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{sourceSummary(row)}</td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setSelectedRow(row)}>ดูรายละเอียด <ChevronRight aria-hidden="true" /></Button></td>
                  </tr>
                )
              })}
              {filteredRows.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">ไม่พบนักเรียนที่ตรงกับตัวกรอง</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">แสดง {filteredRows.length} จาก {rows.length} คน · ห้อง {project.classroom_name} · เกณฑ์ผ่านหลังเรียน {project.passing_threshold_percent}%</p>

      <ScoreDetailDialog row={selectedRow} pretest={pretest} posttest={posttest} onOpenChange={open => !open && setSelectedRow(null)} />
    </>
  )
}

function SummaryCard({ icon: Icon, label, value, suffix, tone = 'primary' }: { icon: typeof Users; label: string; value: number; suffix: string; tone?: 'primary' | 'success' | 'warning' }) {
  const toneClass = tone === 'success' ? 'bg-success/10 text-success' : tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'
  return <Card padding="lg"><div className="flex items-center gap-3"><div className={cn('flex size-10 items-center justify-center rounded-xl', toneClass)}><Icon className="size-5" aria-hidden="true" /></div><div><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold text-foreground">{value}<span className="ml-1 text-base font-medium text-muted-foreground">{suffix}</span></p></div></div></Card>
}

function ScoreCell({ score, maxScore, studentId }: { score: EducationResearchScore | null; maxScore: number | null; studentId: string }) {
  if (!score) return <td className="px-4 py-3"><span className="text-muted-foreground">—</span></td>
  const editedByTeacher = Boolean(score.updated_by && score.updated_by !== studentId)
  return <td className="px-4 py-3"><p className="font-semibold text-foreground">{formatResearchScore(Number(score.raw_score))}<span className="font-normal text-muted-foreground">/{formatResearchScore(maxScore)}</span></p>{editedByTeacher && <span className="mt-1 inline-flex rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">แก้ไขโดยครู</span>}</td>
}

function sourceSummary(row: ResearchScoreDataRow): string {
  const sources = [...new Set([row.pretest_score?.score_source, row.posttest_score?.score_source].filter(Boolean))]
  return sources.length === 0 ? '—' : sources.map(source => researchScoreSourceLabel(source ?? null)).join(' / ')
}

function ScoreDetailDialog({ row, pretest, posttest, onOpenChange }: { row: ResearchScoreDataRow | null; pretest: EducationResearchMeasurement | null; posttest: EducationResearchMeasurement | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={Boolean(row)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>รายละเอียดคะแนน: {row?.full_name}</DialogTitle><DialogDescription>คะแนนปัจจุบัน แหล่งที่มา และประวัติการเปลี่ยนแปลงที่ระบบบันทึกไว้</DialogDescription></DialogHeader>
        {row && <div className="grid gap-4 sm:grid-cols-2"><HistoryPanel label="ก่อนเรียน" score={row.pretest_score} maxScore={pretest?.max_score ?? null} histories={row.pretest_history} /><HistoryPanel label="หลังเรียน" score={row.posttest_score} maxScore={posttest?.max_score ?? null} histories={row.posttest_history} /></div>}
      </DialogContent>
    </Dialog>
  )
}

function HistoryPanel({ label, score, maxScore, histories }: { label: string; score: EducationResearchScore | null; maxScore: number | null; histories: HistoryWithActor[] }) {
  return <Card padding="md"><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold text-foreground">{score ? `${formatResearchScore(Number(score.raw_score))}/${formatResearchScore(maxScore)}` : 'ยังไม่มีคะแนน'}</p><p className="mt-1 text-xs text-muted-foreground">{score ? researchScoreSourceLabel(score.score_source) : '—'}</p><div className="mt-4 space-y-3 border-t border-border pt-3">{histories.length === 0 ? <p className="text-xs text-muted-foreground">ยังไม่มีประวัติ</p> : histories.slice(0, 10).map(history => <div key={history.id} className="text-xs"><p className="font-medium text-foreground">{history.action === 'insert' ? `เพิ่มคะแนน ${formatResearchScore(history.new_score)}` : history.action === 'update' ? `${formatResearchScore(history.old_score)} → ${formatResearchScore(history.new_score)}` : `ลบคะแนน ${formatResearchScore(history.old_score)}`}</p><p className="mt-0.5 text-muted-foreground">{history.actor_name ?? 'ระบบ'} · {new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(history.changed_at))}</p>{history.reason && <p className="mt-0.5 text-muted-foreground">เหตุผล: {history.reason}</p>}</div>)}</div></Card>
}
