'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BookOpen, Clock, Folder, Repeat, SlidersHorizontal, Target } from 'lucide-react'
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
import { groupAssignmentsByCategory, type AssignmentCategory } from '@/lib/assignment-categories'
import { isCompleted, type StudentAssignmentRow } from './assignment-status'
import { studentAssignmentCardState } from './student-assignment-card-state'

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
  return { label: `ส่ง ${formatThaiDate(endAt, { dateStyle: 'short' })}`, variant: diff < 3 * 86400000 ? 'statusWarning' as const : 'outline' as const }
}

export function AssignmentList({ assignments, categories, classroomDescription, assignmentHrefs, initialNow }: {
  assignments: StudentAssignmentRow[]
  categories: AssignmentCategory[]
  classroomDescription?: string | null
  /** Synthetic local previews can route to a read-only fixture detail. */
  assignmentHrefs?: Record<string, string>
  initialNow?: string
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilterKey>('all')
  const now = initialNow ? Date.parse(initialNow) : Date.now()
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
  const sections = groupAssignmentsByCategory(visible, categories)

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
              <section key={section.category?.id ?? 'uncategorized'} className="flex min-w-0 flex-col gap-2">
                {categories.length > 0 && (
                  <div className="flex min-w-0 items-center gap-1.5 px-1">
                    <Folder className={cn('size-3.5 shrink-0', preset?.text ?? 'text-muted-foreground')} aria-hidden="true" />
                    <h3 className="min-w-0 break-words text-xs font-semibold">{section.category?.name ?? 'งานอื่น ๆ'}</h3>
                    <span className="shrink-0 text-xs text-muted-foreground">{section.assignments.length} งาน</span>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-2 @min-[42rem]:grid-cols-2">
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
  const due = dueInfo(a.end_at, now)
  const type = TYPE_CFG[a.type] ?? TYPE_CFG.exam
  const TypeIcon = type.icon
  const passingThreshold = formatPassingThreshold(a.passing_type, a.passing_value)

  return (
    <Link href={href ?? state.href} prefetch={false} aria-label={`${state.actionLabel}: ${a.title}`} title={a.title} className="group block h-full min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" data-student-assignment-card>
      <Card radius="md" interactive className="relative flex h-full min-w-0 items-start gap-2.5 overflow-hidden py-3 pl-4 pr-3 group-hover:border-primary/30">
        <span className={cn('absolute inset-y-3 left-0 w-[3px] rounded-r-full', cover?.solid ?? 'bg-primary')} aria-hidden="true" />
        <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', cover ? `${cover.surface} ${cover.text}` : 'bg-muted text-foreground')}><TypeIcon className="size-4" aria-hidden="true" /></span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 items-start gap-2">
            <p className="min-w-0 flex-1 text-sm font-semibold leading-snug line-clamp-2">{a.title}</p>
            <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className={cn('font-medium', cover?.textMuted ?? 'text-foreground/75')}>{type.label}</span>
            <span className="flex items-center gap-1"><BookOpen className="size-3" aria-hidden="true" />{assignmentSizeLabel(a)}</span>
            {a.duration_minutes != null && <span className="flex items-center gap-1"><Clock className="size-3" aria-hidden="true" />{a.duration_minutes} นาที</span>}
            {passingThreshold && !isCompleted(a) && <span className="flex items-center gap-1 text-foreground/75"><Target className="size-3" aria-hidden="true" />เกณฑ์ {passingThreshold}</span>}
            {a.max_attempts != null && <span className="flex items-center gap-1"><Repeat className="size-3" aria-hidden="true" />{a.attempts_used}/{a.max_attempts} ครั้ง</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {state.statusLabel && <Badge variant={state.statusVariant}>{state.statusLabel}</Badge>}
            {!isCompleted(a) && <Badge variant={due.variant} title={a.end_at ? formatThaiDateTime(a.end_at) : undefined}><Clock aria-hidden="true" />{due.label}</Badge>}
            {state.score && <span className="text-xs font-semibold">{a.has_in_progress ? 'คะแนนเดิม ' : ''}{state.score.total}/{state.score.max}</span>}
            {state.finished && state.canShowScore && !state.score && <span className="text-xs text-muted-foreground">รอครูตรวจ</span>}
            {state.canRetry && <span className="text-xs font-medium text-foreground/75">{a.retry_scope === 'wrong_only' ? 'แก้ข้อที่ยังไม่เต็ม' : 'ลองใหม่ได้'}{state.remaining != null ? ` · เหลือ ${state.remaining} ครั้ง` : ''}</span>}
          </div>
        </div>
      </Card>
    </Link>
  )
}
