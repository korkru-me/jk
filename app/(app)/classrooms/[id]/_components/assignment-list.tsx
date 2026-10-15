'use client'

import { useState } from 'react'
import { ArrowRight, BookOpen, CheckCircle2, CircleAlert, Clock, Folder, Repeat, SlidersHorizontal, Target } from 'lucide-react'
import { TYPE_CFG } from '@/lib/assignment-display'
import { cn } from '@/lib/utils'
import { assignmentSizeLabel } from '@/lib/assignment-size-label'
import { formatPassingThreshold } from '@/lib/grading'
import { formatThaiDate, formatThaiDateTime } from '@/lib/thai-time'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { coverOf, parseDescription, type CoverPreset } from '../../_components/classroom-meta'
import { groupPreset } from '../../_components/group-colors'
import type { AssignmentCategory } from '@/lib/assignment-categories'
import { isCompleted, type StudentAssignmentRow } from './assignment-status'
import { studentAssignmentCardState } from './student-assignment-card-state'
import { orderStudentClassroomWork } from '@/lib/student-classroom-work'
import { studentWorkSeverity, STUDENT_WORK_STATUS_DESCRIPTION } from '@/lib/student-work-status'
import { SEVERITY_DOT } from '@/lib/calendar-display'
import { WorkStatusLegend } from '@/components/student/work-status-legend'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export type { StudentAssignmentRow }
type StatusFilterKey = 'all' | 'pending' | 'done'
type TypeFilterKey = 'all' | 'exercise' | 'exam'
const TYPE_OPTIONS = [
  { value: 'all', label: 'ทุกประเภท' }, { value: 'exercise', label: 'แบบฝึกหัด' }, { value: 'exam', label: 'ข้อสอบ' },
] as const

function dueInfo(endAt: string | null, now: number) {
  if (!endAt) return { label: 'ไม่มีกำหนดส่ง', variant: 'outline' as const }
  const diff = Date.parse(endAt) - now
  if (diff < 0) return { label: 'เลยกำหนดส่งแล้ว', variant: 'statusDestructive' as const }
  if (diff < 86400000) return { label: `เหลือ ${Math.max(1, Math.ceil(diff / 3600000))} ชม.`, variant: 'statusWarning' as const }
  return { label: `ส่ง ${formatThaiDate(endAt, { dateStyle: 'short' })}`, variant: studentWorkSeverity(endAt, false, now) === 'soon' ? 'statusWarning' as const : 'outline' as const }
}

export function AssignmentList({ assignments, categories, classroomDescription, assignmentHrefs, initialNow, now: sharedNow }: {
  assignments: StudentAssignmentRow[]
  categories: AssignmentCategory[]
  classroomDescription?: string | null
  /** Synthetic local previews can route to a read-only fixture detail. */
  assignmentHrefs?: Record<string, string>
  initialNow?: string
  now?: number
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilterKey>('all')
  const now = sharedNow ?? (initialNow ? Date.parse(initialNow) : Date.now())
  const cover = coverOf(parseDescription(classroomDescription ?? null))
  const pending = assignments.filter(a => !isCompleted(a))
  const done = assignments.filter(isCompleted)
  const statusFilters = [
    { key: 'all', label: 'ทั้งหมด', count: assignments.length },
    { key: 'pending', label: 'ต้องทำ', count: pending.length },
    { key: 'done', label: 'ส่งแล้ว', count: done.length },
  ] as const
  const byStatus = statusFilter === 'pending' ? pending : statusFilter === 'done' ? done : assignments
  const counts = { all: byStatus.length, exercise: byStatus.filter(a => a.type === 'exercise').length, exam: byStatus.filter(a => a.type === 'exam').length }
  const visible = typeFilter === 'all' ? byStatus : byStatus.filter(a => a.type === typeFilter)
  const sections = orderStudentClassroomWork(visible, assignments, categories)

  return (
    <div className="@container flex min-w-0 flex-col gap-3" data-student-assignment-list>
      <div className="flex flex-wrap items-center gap-2" data-assignment-toolbar>
        <ToggleGroup value={[statusFilter]} onValueChange={values => {
          const next = values.at(-1)
          if (next === 'all' || next === 'pending' || next === 'done') setStatusFilter(next)
        }} aria-label="กรองสถานะงาน" variant="primary" size="sm" spacing={0} className="max-w-full rounded-lg bg-muted/50 p-[2px]">
          {statusFilters.map(filter => (
            <ToggleGroupItem key={filter.key} value={filter.key}>
              {filter.label}<span className="tabular-nums">{filter.count}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Select value={typeFilter} onValueChange={value => {
          if (value === 'all' || value === 'exercise' || value === 'exam') setTypeFilter(value)
        }}>
          <SelectTrigger size="sm" aria-label="กรองประเภทงาน" className="min-w-[9rem] @min-[34rem]:ml-auto">
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            <SelectValue>{value => TYPE_OPTIONS.find(option => option.value === value)?.label ?? 'ทุกประเภท'}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end" alignItemWithTrigger={false}>
            <SelectGroup>
              {TYPE_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}<span className="ml-auto tabular-nums">{counts[option.value]}</span></SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground">{visible.length} งาน</p>
        <WorkStatusLegend compact />
      </div>
      {visible.length === 0 ? (
        <Card edge="dashed" padding="md" className="text-center text-sm text-muted-foreground">
          {statusFilter === 'pending' && typeFilter === 'all' ? 'ทำครบทุกงานแล้ว ไม่มีงานค้าง' : statusFilter === 'done' && typeFilter === 'all' ? 'ยังไม่มีงานที่ส่งแล้ว' : 'ไม่มีงานตรงกับตัวกรองที่เลือก'}
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {sections.map(section => {
            const preset = section.category ? groupPreset(section.category.color) : null
            return (
              <section key={section.category?.id ?? 'uncategorized'} className="flex min-w-0 flex-col gap-2" data-assignment-group={section.category?.id ?? 'uncategorized'}>
                {categories.length > 0 && (
                  <div className={cn('flex min-w-0 items-center gap-2 rounded-lg px-3 py-2', preset?.surface ?? 'bg-muted')}>
                    <Folder className={cn('size-4 shrink-0', preset?.text ?? 'text-muted-foreground')} aria-hidden="true" />
                    <h3 className={cn('min-w-0 break-words text-sm font-bold', preset?.text)}>{section.category?.name ?? 'งานอื่น ๆ'}</h3>
                    <span className="ml-auto shrink-0 text-xs font-medium text-foreground/75">{section.assignments.length} งาน</span>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-2 @min-[30rem]:grid-cols-2 @min-[46rem]:grid-cols-3">
                  {section.assignments.map(a => <StudentAssignmentCard key={a.id} assignment={a} cover={cover} now={now} href={assignmentHrefs?.[a.id]} />)}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StudentAssignmentCard({ assignment: a, cover, now, href }: { assignment: StudentAssignmentRow; cover: CoverPreset | null; now: number; href?: string }) {
  const state = studentAssignmentCardState(a, now)
  const completed = isCompleted(a)
  const severity = studentWorkSeverity(a.end_at, completed, now)
  const needsAttention = severity === 'soon' || severity === 'overdue'
  const due = dueInfo(a.end_at, now)
  const type = TYPE_CFG[a.type] ?? TYPE_CFG.exam
  const TypeIcon = type.icon
  const passingThreshold = formatPassingThreshold(a.passing_type, a.passing_value)

  return (
    <Tooltip>
    {/* Enter through a document GET so a stale/pending client router cannot
        strand the student on the classroom. Starting still requires POST. */}
    <TooltipTrigger render={<a href={href ?? state.href} />} aria-label={`${state.actionLabel}: ${a.title} · ${STUDENT_WORK_STATUS_DESCRIPTION[severity]}`} className="group block h-full min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" data-student-assignment-card data-assignment-id={a.id} data-work-status={severity}>
      <Card radius="md" interactive className={cn('relative flex h-full min-w-0 items-start gap-2.5 overflow-hidden py-3 pl-4 pr-3 [&_.text-muted-foreground]:text-foreground/75', type.bg, completed ? 'border-success/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--success)_12%,transparent),0_3px_14px_color-mix(in_oklab,var(--success)_10%,transparent)] group-hover:border-success/60' : 'group-hover:border-primary/30')}>
        <span className={cn('absolute inset-y-3 left-0 w-[3px] rounded-r-full', SEVERITY_DOT[severity])} aria-hidden="true" data-work-status-stripe={severity} />
        <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', cover ? `${cover.surface} ${cover.text}` : 'bg-muted text-foreground')}><TypeIcon className="size-4" aria-hidden="true" /></span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 items-start gap-2">
            <p className="min-w-0 flex-1 text-sm font-semibold leading-snug line-clamp-2">{a.title}</p>
            {needsAttention ? (
              <Badge variant={severity === 'overdue' ? 'statusDestructive' : 'statusWarning'} className={cn('size-7 rounded-full border-2 p-0 motion-safe:animate-pulse motion-reduce:animate-none [&>svg]:size-5!', severity === 'overdue' ? 'bg-destructive text-background' : 'bg-warning/20 text-foreground')} aria-hidden="true" data-work-deadline-alert={severity}>
                <CircleAlert strokeWidth={2.5} />
              </Badge>
            ) : completed ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))]" aria-hidden="true" data-work-completed /> : <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />}
          </div>
          <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-xs', completed ? 'text-foreground/75' : 'text-muted-foreground')}>
            <span className={cn('font-medium', cover?.textMuted ?? 'text-foreground/75')}>{type.label}</span>
            <span className="flex items-center gap-1"><BookOpen className="size-3" aria-hidden="true" />{assignmentSizeLabel(a)}</span>
            {a.duration_minutes != null && <span className="flex items-center gap-1"><Clock className="size-3" aria-hidden="true" />{a.duration_minutes} นาที</span>}
            {passingThreshold && !completed && <span className="flex items-center gap-1 text-foreground/75"><Target className="size-3" aria-hidden="true" />เกณฑ์ {passingThreshold}</span>}
            {a.max_attempts != null && <span className="flex items-center gap-1"><Repeat className="size-3" aria-hidden="true" />{a.attempts_used}/{a.max_attempts} ครั้ง</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {completed ? <Badge variant="statusSuccess"><CheckCircle2 aria-hidden="true" />ส่งแล้ว</Badge> : state.statusLabel && <Badge variant={state.statusVariant}>{state.statusLabel}</Badge>}
            {!completed && <Badge variant={due.variant} title={a.end_at ? formatThaiDateTime(a.end_at) : undefined}>
              <Clock aria-hidden="true" />{due.label}
            </Badge>}
            {state.score && <span className="text-xs font-semibold">{a.has_in_progress ? 'คะแนนเดิม ' : ''}{state.score.total}/{state.score.max}</span>}
            {state.finished && state.canShowScore && !state.score && <span className={cn('text-xs', completed ? 'text-foreground/75' : 'text-muted-foreground')}>รอครูตรวจ</span>}
            {state.canRetry && <span className="text-xs font-medium text-foreground/75">{a.retry_scope === 'wrong_only' ? 'แก้ข้อที่ยังไม่เต็ม' : 'ลองใหม่ได้'}{state.remaining != null ? ` · เหลือ ${state.remaining} ครั้ง` : ''}</span>}
          </div>
        </div>
      </Card>
    </TooltipTrigger>
    <TooltipContent role="tooltip"><span className={cn('size-1.5 shrink-0 rounded-full', SEVERITY_DOT[severity])} aria-hidden="true" />{STUDENT_WORK_STATUS_DESCRIPTION[severity]}</TooltipContent>
    </Tooltip>
  )
}
