'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Eye,
  FileInput,
  FileSpreadsheet,
  FlaskConical,
  Info,
  KeyRound,
  LockKeyhole,
  Pencil,
  School,
  Users,
} from 'lucide-react'
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
  updateEducationResearchProjectDetails,
  updateEducationResearchSchedule,
} from '@/lib/actions/education-research'
import { cn } from '@/lib/utils'
import type { EducationResearchProject, EducationResearchProjectStatus } from '@/lib/types'
import type { ResearchMeasurementSummary } from '../page'
import { ResearchProjectNav } from './research-project-nav'

type ProjectWithClassroom = EducationResearchProject & {
  classrooms: { id: string; name: string } | null
}

const STATUS_LABEL: Record<EducationResearchProjectStatus, string> = {
  draft: 'ฉบับร่าง',
  collecting_pretest: 'กำลังเก็บคะแนนก่อนเรียน',
  teaching: 'กำลังจัดการเรียนรู้',
  collecting_posttest: 'กำลังเก็บคะแนนหลังเรียน',
  ready_for_analysis: 'พร้อมวิเคราะห์',
  completed: 'เสร็จสิ้น',
  archived: 'เก็บถาวร',
}

export function ResearchProjectOverview({
  project,
  measurements,
  participantCount,
  pairedScoreCount,
  canManage,
}: {
  project: ProjectWithClassroom
  measurements: ResearchMeasurementSummary[]
  participantCount: number
  pairedScoreCount: number
  canManage: boolean
}) {
  const pretest = measurements.find(item => item.measurement_type === 'pretest') ?? null
  const posttest = measurements.find(item => item.measurement_type === 'posttest') ?? null
  const pretestCount = pretest?.score_count ?? 0
  const posttestCount = posttest?.score_count ?? 0
  const [editOpen, setEditOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/research" className="hover:text-foreground hover:underline">วิจัยการศึกษา</Link>
          {' / ภาพรวมโครงการ'}
        </p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{project.title}</h1>
              <span className="rounded-full border border-primary/25 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
                {STATUS_LABEL[project.status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{project.topic}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5">
                <School className="size-4 text-primary" aria-hidden="true" />
                {project.classrooms?.name ?? 'ไม่พบห้องเรียน'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5">
                <Users className="size-4 text-primary" aria-hidden="true" />
                {participantCount} นักเรียน
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil aria-hidden="true" /> แก้ไขโครงการ
              </Button>
            )}
            {project.classrooms && (
              <Button variant="outline" render={<Link href={`/classrooms/${project.classroom_id}`} />}>
                <School aria-hidden="true" /> เปิดห้องเรียน
              </Button>
            )}
          </div>
        </div>
      </div>

      <ResearchProjectNav projectId={project.id} active="overview" />

      <NextActionCard pretest={pretest} posttest={posttest} canManage={canManage} />

      <section aria-labelledby="score-progress-heading">
        <h2 id="score-progress-heading" className="mb-3 text-lg font-semibold text-foreground">ความคืบหน้าการเก็บคะแนน</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <ProgressCard label="ก่อนเรียน" value={pretestCount} total={participantCount} tone="success" />
          <ProgressCard label="หลังเรียน" value={posttestCount} total={participantCount} tone="warning" />
          <ProgressCard label="คู่คะแนนพร้อมใช้" value={pairedScoreCount} total={participantCount} tone="primary" />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="exam-heading">
          <h2 id="exam-heading" className="mb-3 text-lg font-semibold text-foreground">ข้อสอบและการเก็บคะแนน</h2>
          <div className="space-y-4">
            {pretest && <MeasurementCard measurement={pretest} canManage={canManage} />}
            {posttest && <MeasurementCard measurement={posttest} canManage={canManage} />}
          </div>
        </section>

        <aside className="space-y-4">
          <Card padding="lg">
            <h2 className="font-semibold text-foreground">ทางลัด</h2>
            <div className="mt-3 space-y-2">
              {project.classrooms && (
                <Button className="w-full justify-start" variant="ghost" render={<Link href={`/classrooms/${project.classroom_id}`} />}>
                  <School aria-hidden="true" /> เปิดห้องเรียน <ArrowRight className="ml-auto" aria-hidden="true" />
                </Button>
              )}
              <Button className="w-full justify-start" variant="ghost" render={<Link href={`/research/${project.id}/data`} />}>
                <ClipboardCheck aria-hidden="true" /> ตรวจรายชื่อและคะแนน <ArrowRight className="ml-auto" aria-hidden="true" />
              </Button>
              <Button className="w-full justify-start" variant="ghost" disabled title="เปิดเมื่อคะแนนก่อนและหลังพร้อม">
                <FlaskConical aria-hidden="true" /> ดูผลวิเคราะห์ <span className="ml-auto text-xs">ขั้นถัดไป</span>
              </Button>
            </div>
          </Card>
          <Card padding="lg" className="border-primary/20 bg-primary/5">
            <div className="flex gap-3">
              <Info className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                ผลวิเคราะห์จะเปิดใช้เมื่อข้อมูลคะแนนพร้อม ระบบไม่นับคะแนนที่ขาดเป็นศูนย์ และใช้เฉพาะนักเรียนที่มีคะแนนก่อน–หลังเป็นคู่เดียวกัน
              </p>
            </div>
          </Card>
        </aside>
      </div>

      <EditProjectDialog project={project} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  )
}

function NextActionCard({
  pretest,
  posttest,
  canManage,
}: {
  pretest: ResearchMeasurementSummary | null
  posttest: ResearchMeasurementSummary | null
  canManage: boolean
}) {
  const target = pretest?.assignments?.status === 'draft'
    ? pretest
    : posttest?.assignments?.status === 'draft'
      ? posttest
      : null
  const [scheduleOpen, setScheduleOpen] = useState(false)

  if (!target) {
    return (
      <Card padding="lg" className="border-success/30 bg-success/5">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          <div><p className="font-semibold text-foreground">การตั้งค่ารอบคะแนนพร้อมแล้ว</p><p className="mt-1 text-sm text-muted-foreground">ตรวจสอบกำหนดการแต่ละรอบด้านล่าง และให้นักเรียนเข้าทำจากหน้าห้องเรียน</p></div>
        </div>
      </Card>
    )
  }

  return (
    <>
      <Card padding="lg" className="border-primary/30 bg-primary/5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <CalendarClock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="font-semibold text-foreground">สิ่งที่ต้องทำต่อ</p>
              <p className="mt-1 text-sm text-muted-foreground">{target.measurement_type === 'pretest' ? 'กำหนดเวลาและเผยแพร่ข้อสอบก่อนเรียน' : 'กำหนดเวลาและเผยแพร่ข้อสอบหลังเรียน'}</p>
            </div>
          </div>
          {canManage && <Button onClick={() => setScheduleOpen(true)}><CalendarClock aria-hidden="true" /> จัดการกำหนดการ</Button>}
        </div>
      </Card>
      {target.assignments && <ScheduleDialog measurement={target} open={scheduleOpen} onOpenChange={setScheduleOpen} />}
    </>
  )
}

function ProgressCard({ label, value, total, tone }: { label: string; value: number; total: number; tone: 'success' | 'warning' | 'primary' }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0
  const toneClass = tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-primary'
  return (
    <Card padding="lg">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}<span className="text-base font-medium text-muted-foreground">/{total}</span></p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', toneClass)} style={{ width: `${Math.min(100, percent)}%` }} /></div>
      <p className="mt-2 text-xs text-muted-foreground">{percent}% จากรายชื่อที่ตรึงไว้</p>
    </Card>
  )
}

function MeasurementCard({ measurement, canManage }: { measurement: ResearchMeasurementSummary; canManage: boolean }) {
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const isPretest = measurement.measurement_type === 'pretest'
  const assignment = measurement.assignments
  const sourceIcon = measurement.source_type === 'korkru_exam' ? ClipboardCheck : measurement.source_type === 'excel' ? FileSpreadsheet : FileInput
  const SourceIcon = sourceIcon

  return (
    <Card padding="lg">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', isPretest ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
            <SourceIcon className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isPretest ? 'ข้อสอบก่อนเรียน' : 'ข้อสอบหลังเรียน'}</p>
              {assignment && <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', assignment.status === 'published' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>{assignment.status === 'published' ? 'เผยแพร่แล้ว' : 'ฉบับร่าง'}</span>}
              {assignment?.access_code && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"><KeyRound className="size-3" aria-hidden="true" /> ใช้รหัสเข้า</span>}
            </div>
            <h3 className="mt-1 truncate font-semibold text-foreground">{assignment?.title ?? sourceTypeLabel(measurement.source_type)}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {measurement.source_type === 'korkru_exam'
                ? `${measurement.snapshot_question_ids.length} ข้อ · ${formatScore(measurement.max_score)} คะแนน · ${measurement.duration_minutes ?? assignment?.duration_minutes ?? '—'} นาที`
                : `${sourceTypeLabel(measurement.source_type)} · ${formatScore(measurement.max_score)} คะแนน`}
            </p>
            {measurement.source_type === 'korkru_exam' && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="สำเนาที่ตรึงไว้จะไม่เปลี่ยนตามโจทย์ต้นฉบับ">
                <LockKeyhole className="size-3.5 text-primary" aria-hidden="true" /> สำเนาข้อสอบถูกตรึงไว้แล้ว
              </p>
            )}
            {assignment && <p className="mt-2 text-xs text-muted-foreground">{scheduleSummary(assignment)}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {assignment && <Button variant="outline" render={<Link href={`/assignments/${assignment.id}/preview`} />}><Eye aria-hidden="true" /> มุมมองนักเรียน</Button>}
          {assignment && canManage && <Button variant="outline" onClick={() => setScheduleOpen(true)}><CalendarClock aria-hidden="true" /> จัดการกำหนดการ</Button>}
        </div>
      </div>
      {assignment && <ScheduleDialog measurement={measurement} open={scheduleOpen} onOpenChange={setScheduleOpen} />}
    </Card>
  )
}

function ScheduleDialog({ measurement, open, onOpenChange }: { measurement: ResearchMeasurementSummary; open: boolean; onOpenChange: (open: boolean) => void }) {
  const assignment = measurement.assignments
  const initialMode = assignment?.status === 'draft' ? 'draft' : assignment?.start_at ? 'scheduled' : 'immediate'
  const [publishMode, setPublishMode] = useState<'draft' | 'immediate' | 'scheduled'>(initialMode)
  const [startAt, setStartAt] = useState(toDateTimeLocal(assignment?.start_at))
  const [endAt, setEndAt] = useState(toDateTimeLocal(assignment?.end_at))
  const [accessCode, setAccessCode] = useState(assignment?.access_code ?? '')
  const [pending, startTransition] = useTransition()

  if (!assignment) return null

  function save() {
    startTransition(async () => {
      const result = await updateEducationResearchSchedule({
        measurement_id: measurement.id,
        publish_mode: publishMode,
        start_at: publishMode === 'scheduled' ? toIso(startAt) : null,
        end_at: publishMode === 'draft' ? null : toIso(endAt),
        access_code: accessCode.trim().toUpperCase() || null,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('บันทึกกำหนดการแล้ว')
      onOpenChange(false)
    })
  }

  function generateCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const values = crypto.getRandomValues(new Uint32Array(8))
    setAccessCode([...values].map(value => alphabet[value % alphabet.length]).join(''))
  }

  async function copyCode() {
    if (!accessCode) return
    await navigator.clipboard.writeText(accessCode.toUpperCase())
    toast.success('คัดลอกรหัสแล้ว')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>จัดการกำหนดการและรหัสเข้า</DialogTitle>
          <DialogDescription>{measurement.measurement_type === 'pretest' ? 'ข้อสอบก่อนเรียน' : 'ข้อสอบหลังเรียน'} · {assignment.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-foreground">การเผยแพร่</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {([['draft', 'เก็บเป็นฉบับร่าง'], ['immediate', 'เผยแพร่ทันที'], ['scheduled', 'กำหนดเวลา']] as const).map(([value, label]) => (
                <label key={value} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm', publishMode === value && 'border-primary bg-primary/5')}>
                  <input type="radio" name={`publish-${measurement.id}`} checked={publishMode === value} onChange={() => setPublishMode(value)} /> {label}
                </label>
              ))}
            </div>
          </fieldset>
          {publishMode === 'scheduled' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor={`start-${measurement.id}`}>เปิด</Label><Input id={`start-${measurement.id}`} type="datetime-local" value={startAt} onChange={event => setStartAt(event.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor={`end-${measurement.id}`}>ปิด</Label><Input id={`end-${measurement.id}`} type="datetime-local" value={endAt} onChange={event => setEndAt(event.target.value)} /></div>
            </div>
          )}
          {publishMode === 'immediate' && (
            <div className="space-y-1.5"><Label htmlFor={`optional-end-${measurement.id}`}>เวลาปิด (ไม่บังคับ)</Label><Input id={`optional-end-${measurement.id}`} type="datetime-local" value={endAt} onChange={event => setEndAt(event.target.value)} /></div>
          )}
          <div className="space-y-2">
            <Label htmlFor={`code-${measurement.id}`}>รหัสเข้าข้อสอบ (ไม่บังคับ แต่แนะนำ)</Label>
            <div className="flex gap-2"><Input id={`code-${measurement.id}`} value={accessCode} maxLength={12} placeholder="เช่น M41-PRE" onChange={event => setAccessCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} /><Button type="button" variant="outline" onClick={copyCode} disabled={!accessCode} aria-label="คัดลอกรหัส"><Copy aria-hidden="true" /></Button></div>
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">4–12 ตัว ใช้อักษรอังกฤษ ตัวเลข หรือขีดกลาง ครูเปลี่ยนภายหลังได้</p><Button type="button" size="sm" variant="outline" onClick={generateCode}>สร้างรหัสสุ่ม</Button></div>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
            นักเรียนต้องล็อกอิน อยู่ในห้องเรียน อยู่ในช่วงเวลาที่เปิด และกรอกรหัสถูกต้อง จึงเริ่มทำข้อสอบได้
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>ยกเลิก</Button>
          <Button onClick={save} disabled={pending}>{pending ? 'กำลังบันทึก…' : publishMode === 'draft' ? 'บันทึกเป็นฉบับร่าง' : 'บันทึกกำหนดการ'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditProjectDialog({ project, open, onOpenChange }: { project: ProjectWithClassroom; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [title, setTitle] = useState(project.title)
  const [topic, setTopic] = useState(project.topic)
  const [threshold, setThreshold] = useState(String(project.passing_threshold_percent))
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const result = await updateEducationResearchProjectDetails({ project_id: project.id, title, topic, passing_threshold_percent: Number(threshold) })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('บันทึกข้อมูลโครงการแล้ว')
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>แก้ไขโครงการ</DialogTitle><DialogDescription>แก้ชื่อ เรื่องที่สอน และเกณฑ์ผ่าน โดยไม่เปลี่ยนห้องเรียนหรือสำเนาข้อสอบที่ตรึงไว้</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="research-title">ชื่อโครงการ</Label><Input id="research-title" value={title} onChange={event => setTitle(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="research-topic">เรื่อง/หน่วยการเรียนรู้</Label><Textarea id="research-topic" value={topic} onChange={event => setTopic(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="research-threshold">เกณฑ์ผ่านหลังเรียน (ร้อยละ)</Label><Input id="research-threshold" type="number" min="1" max="100" step="0.01" value={threshold} onChange={event => setThreshold(event.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>ยกเลิก</Button><Button onClick={save} disabled={pending || !title.trim() || !topic.trim()}>{pending ? 'กำลังบันทึก…' : 'บันทึก'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function sourceTypeLabel(sourceType: ResearchMeasurementSummary['source_type']): string {
  return sourceType === 'korkru_exam' ? 'ข้อสอบ KorKru' : sourceType === 'manual' ? 'กรอกคะแนนบนเว็บ' : sourceType === 'excel' ? 'นำเข้าจาก Excel' : 'ยังไม่กำหนดแหล่งคะแนน'
}

function formatScore(value: number | null): string {
  if (value === null) return '—'
  return Number.isInteger(Number(value)) ? String(Number(value)) : Number(value).toFixed(2)
}

function scheduleSummary(assignment: NonNullable<ResearchMeasurementSummary['assignments']>): string {
  if (assignment.status === 'draft') return 'ยังไม่เผยแพร่ให้นักเรียน'
  if (!assignment.start_at && !assignment.end_at) return 'เผยแพร่แล้ว · เปิดทำได้ทันที'
  const formatter = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' })
  if (assignment.start_at && assignment.end_at) return `${formatter.format(new Date(assignment.start_at))} – ${formatter.format(new Date(assignment.end_at))}`
  if (assignment.start_at) return `เปิด ${formatter.format(new Date(assignment.start_at))}`
  return `ปิด ${formatter.format(new Date(assignment.end_at!))}`
}

function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function toIso(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
