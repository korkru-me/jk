import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  CircleMinus,
  LockKeyhole,
  Pencil,
  Search,
  Target,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { formatResearchScore, researchScoreSourceLabel } from '@/lib/education-research-scores'
import type { EducationResearchScoreHistoryAction, EducationResearchSourceType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { HelpBubble } from './research-help-bubble'

export type ResearchDataFilter = 'all' | 'paired' | 'criterion' | 'incomplete' | 'excluded'

export interface ResearchDataHistoryItem {
  id: number
  measurementLabel: 'ก่อนเรียน' | 'หลังเรียน'
  action: EducationResearchScoreHistoryAction
  oldScore: number | null
  newScore: number | null
  oldSource: EducationResearchSourceType | null
  newSource: EducationResearchSourceType | null
  reason: string | null
  actorName: string | null
  changedAt: string
}

export interface ResearchDataUsedRow {
  participantId: string
  order: number
  fullName: string
  studentCode: string | null
  pretest: number | null
  posttest: number | null
  includedPaired: boolean
  includedCriterion: boolean
  passedCriterion: boolean | null
  exclusionReason: string | null
  history: ResearchDataHistoryItem[]
}

export function ResearchDataUsedPanel({
  projectId,
  rows,
  participantCount,
  pairedCount,
  criterionCount,
  incompleteCount,
  thresholdPercent,
  criterionScore,
  query,
  filter,
  currentPage,
  totalPages,
  filteredCount,
  latestScoreUpdatedAt,
}: {
  projectId: string
  rows: ResearchDataUsedRow[]
  participantCount: number
  pairedCount: number
  criterionCount: number
  incompleteCount: number
  thresholdPercent: number
  criterionScore: number | null
  query: string
  filter: ResearchDataFilter
  currentPage: number
  totalPages: number
  filteredCount: number
  latestScoreUpdatedAt: string | null
}) {
  return (
    <div className="space-y-4">
      <Card padding="md" className="border-primary/30 bg-primary/5">
        <div className="flex items-start gap-3">
          <Search className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1"><p className="font-semibold text-foreground">ตรวจสอบข้อมูลที่นำไปคำนวณ</p><p className="mt-1 text-sm text-muted-foreground">คะแนนว่างไม่ใช่ศูนย์ ระบบแยกกติกาการเลือกข้อมูลของแต่ละการวิเคราะห์ให้ตรวจย้อนหลังได้</p></div>
          <HelpBubble title="ระบบเลือกข้อมูลอย่างไร" text="ก่อน–หลัง: ต้องมีคะแนนครบทั้งสองครั้งในคนเดียวกัน เทียบเกณฑ์: ใช้ทุกคนที่มีคะแนนหลังเรียน ช่องว่างจะไม่ถูกแทนด้วย 0" />
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DataMetric icon={Users} label="ผู้เข้าร่วม" value={participantCount} suffix="คน" tone="primary" />
        <DataMetric icon={CheckCircle2} label="ใช้ก่อน–หลัง" value={pairedCount} suffix="คู่" tone="success" />
        <DataMetric icon={Target} label="ใช้เทียบเกณฑ์" value={criterionCount} suffix="คน" tone="accent" />
        <DataMetric icon={AlertTriangle} label="ข้อมูลไม่ครบคู่" value={incompleteCount} suffix="คน" tone="warning" />
      </div>

      <form method="get" className="flex flex-col gap-2 lg:flex-row lg:items-end">
        <input type="hidden" name="tab" value="data" />
        <div className="min-w-0 flex-1"><label htmlFor="research-result-query" className="mb-1 block text-xs font-medium text-muted-foreground">ค้นหานักเรียน</label><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input id="research-result-query" name="query" defaultValue={query} className="pl-9" placeholder="ชื่อหรือรหัสนักเรียน" /></div></div>
        <div className="lg:w-56"><label htmlFor="research-result-filter" className="mb-1 block text-xs font-medium text-muted-foreground">กรองการนำไปใช้</label><NativeSelect id="research-result-filter" name="filter" defaultValue={filter}><option value="all">ทั้งหมด ({participantCount})</option><option value="paired">ใช้ก่อน–หลัง ({pairedCount})</option><option value="criterion">ใช้เทียบเกณฑ์ ({criterionCount})</option><option value="incomplete">ข้อมูลไม่ครบคู่ ({incompleteCount})</option><option value="excluded">ดูเฉพาะที่ไม่ถูกรวม</option></NativeSelect></div>
        <div className="flex gap-2"><Button type="submit" variant="outline">ใช้ตัวกรอง</Button><Button variant="outline" render={<Link href={`/research/${projectId}/data`} />}><Pencil aria-hidden="true" />กลับไปแก้คะแนน</Button></div>
      </form>

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="bg-muted/70 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-3 font-medium">เลขที่</th><th className="px-3 py-3 font-medium">นักเรียน</th><th className="px-3 py-3 text-right font-medium">ก่อนเรียน</th><th className="px-3 py-3 text-right font-medium">หลังเรียน</th><th className="px-3 py-3 font-medium">ก่อน–หลัง</th><th className="px-3 py-3 font-medium">เทียบเกณฑ์ {formatThreshold(thresholdPercent)}</th><th className="px-3 py-3 font-medium">เหตุผล / ประวัติ</th></tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map(row => (
                <tr key={row.participantId} className={cn('align-top hover:bg-muted/30', row.exclusionReason && 'bg-warning/5')}>
                  <td className="px-3 py-3 text-muted-foreground">{row.order}</td>
                  <td className="px-3 py-3"><p className="font-medium text-foreground">{row.fullName}</p><p className="mt-0.5 text-xs text-muted-foreground">{row.studentCode ?? 'ยังไม่มีรหัสนักเรียน'}</p></td>
                  <td className="px-3 py-3 text-right font-semibold text-foreground">{formatResearchScore(row.pretest)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-foreground">{formatResearchScore(row.posttest)}</td>
                  <td className="px-3 py-3"><UseStatus included={row.includedPaired} /></td>
                  <td className="px-3 py-3"><CriterionStatus included={row.includedCriterion} passed={row.passedCriterion} /></td>
                  <td className="px-3 py-3"><p className="text-xs text-muted-foreground">{row.exclusionReason ?? 'ข้อมูลครบตามกติกา'}</p><HistoryDetails items={row.history} /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">ไม่พบข้อมูลที่ตรงกับการค้นหาและตัวกรอง</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>พบ {filteredCount} คน · หน้าละ 20 คน</span>
          {totalPages > 1 && <nav className="flex flex-wrap gap-1" aria-label="หน้าข้อมูลที่ใช้">{currentPage > 1 && <Button size="sm" variant="outline" render={<Link href={resultsHref(query, filter, currentPage - 1)} />}>ก่อนหน้า</Button>}{Array.from({ length: totalPages }, (_, index) => index + 1).map(page => <Button key={page} size="sm" variant={page === currentPage ? 'default' : 'outline'} render={<Link href={resultsHref(query, filter, page)} aria-current={page === currentPage ? 'page' : undefined} />}>{page}</Button>)}{currentPage < totalPages && <Button size="sm" variant="outline" render={<Link href={resultsHref(query, filter, currentPage + 1)} />}>ถัดไป</Button>}</nav>}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card padding="lg" className="border-success/30 bg-success/5"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" /><div><h2 className="font-semibold text-foreground">สรุปการคัดเลือกข้อมูล</h2><p className="mt-2 text-sm text-muted-foreground">ก่อน–หลังใช้ {pairedCount} คู่ และไม่ใช้ {participantCount - pairedCount} คนเพราะคะแนนไม่ครบคู่</p><p className="mt-1 text-sm text-muted-foreground">เทียบเกณฑ์ใช้ {criterionCount} คน และไม่ใช้ {participantCount - criterionCount} คนเพราะไม่มีคะแนนหลังเรียน{criterionScore !== null ? ` เกณฑ์จริงคือ ${formatResearchScore(criterionScore)} คะแนน` : ''}</p></div></div></Card>
        <Card padding="lg" className="border-warning/30 bg-warning/5"><div className="flex gap-3"><LockKeyhole className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" /><div><h2 className="font-semibold text-foreground">ข้อมูลนักเรียนเป็นข้อมูลส่วนบุคคล</h2><p className="mt-2 text-sm text-muted-foreground">หน้านี้จำกัดสิทธิ์ตามห้องเรียนและส่งมาเฉพาะข้อมูลในหน้าปัจจุบัน การดาวน์โหลดข้อมูลระดับบุคคลยังไม่เปิดจนกว่าจะอนุมัติกล่องเลือกไฟล์แบบไม่ระบุตัวตน/มีชื่อ</p></div></div></Card>
      </div>
      <p className="text-right text-xs text-muted-foreground">{latestScoreUpdatedAt ? `คำนวณจากคะแนนล่าสุดเมื่อ ${formatThaiDate(latestScoreUpdatedAt)}` : 'ยังไม่มีคะแนนที่บันทึกไว้'}</p>
    </div>
  )
}

function DataMetric({ icon: Icon, label, value, suffix, tone }: { icon: typeof Users; label: string; value: number; suffix: string; tone: 'primary' | 'success' | 'accent' | 'warning' }) {
  const toneClass = tone === 'success' ? 'bg-success/10 text-success' : tone === 'warning' ? 'bg-warning/10 text-warning' : tone === 'accent' ? 'bg-primary/10 text-primary' : 'bg-tint-1/10 text-tint-1'
  return <Card padding="lg"><div className="flex items-center gap-3"><div className={cn('flex size-10 items-center justify-center rounded-xl', toneClass)}><Icon className="size-5" aria-hidden="true" /></div><div><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold text-foreground">{value}<span className="ml-1 text-base font-medium text-muted-foreground">{suffix}</span></p></div></div></Card>
}

function UseStatus({ included }: { included: boolean }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium', included ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>{included ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <CircleMinus className="size-3.5" aria-hidden="true" />}{included ? 'ใช้' : 'ไม่ใช้'}</span>
}

function CriterionStatus({ included, passed }: { included: boolean; passed: boolean | null }) {
  if (!included) return <UseStatus included={false} />
  if (passed === null) return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"><CircleMinus className="size-3.5" aria-hidden="true" />ใช้ · ยังไม่ประเมิน</span>
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium', passed ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>{passed ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <AlertTriangle className="size-3.5" aria-hidden="true" />}ใช้ · {passed ? 'ผ่าน' : 'ไม่ผ่าน'}</span>
}

function HistoryDetails({ items }: { items: ResearchDataHistoryItem[] }) {
  return (
    <details className="relative mt-2">
      <summary className="cursor-pointer text-xs font-medium text-primary hover:underline">ดูประวัติ ({items.length})</summary>
      <Card padding="sm" elevation="lg" className="absolute right-0 z-20 mt-1 w-80 max-w-[80vw] space-y-2">
        {items.length === 0 ? <p className="text-xs text-muted-foreground">ยังไม่มีประวัติการเปลี่ยนแปลง</p> : items.slice(0, 20).map(item => <div key={item.id} className="border-b border-border pb-2 text-xs last:border-0 last:pb-0"><p className="font-medium text-foreground">{item.measurementLabel} · {historyActionLabel(item.action, item.oldScore, item.newScore)}</p><p className="mt-0.5 text-muted-foreground">{sourceLabel(item.oldSource)} → {sourceLabel(item.newSource)}</p><p className="mt-0.5 text-muted-foreground">{item.actorName ?? 'ระบบ'} · {formatThaiDate(item.changedAt)}</p>{item.reason && <p className="mt-0.5 text-muted-foreground">เหตุผล: {item.reason}</p>}</div>)}
      </Card>
    </details>
  )
}

function historyActionLabel(action: EducationResearchScoreHistoryAction, oldScore: number | null, newScore: number | null): string {
  if (action === 'insert') return `เพิ่มคะแนน ${formatResearchScore(newScore)}`
  if (action === 'delete') return `ลบคะแนน ${formatResearchScore(oldScore)}`
  return `${formatResearchScore(oldScore)} → ${formatResearchScore(newScore)}`
}

function sourceLabel(source: EducationResearchSourceType | null): string {
  return source ? researchScoreSourceLabel(source) : 'ไม่มีข้อมูล'
}

function resultsHref(query: string, filter: ResearchDataFilter, page: number): string {
  const params = new URLSearchParams({ tab: 'data', filter, page: String(page) })
  if (query) params.set('query', query)
  return `?${params.toString()}`
}

function formatThreshold(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(2)}%`
}

function formatThaiDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
}
