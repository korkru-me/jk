'use client'

import { useState, useTransition, type ComponentProps, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ClipboardCheck, Clock, Copy, Eye, Folder, Grid3x3, RefreshCw, Target, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { TYPE_CFG } from '@/lib/assignment-display'
import { assignmentCopyHref } from '@/lib/assignment-creation'
import { assignmentSizeLabel } from '@/lib/assignment-size-label'
import { formatPassingThreshold } from '@/lib/grading'
import { SCORE_STRATEGY_LABELS } from '@/lib/scoring'
import { computeAssignmentProgress } from '@/lib/classroom-progress'
import { describeGroupTarget } from '@/lib/classroom-groups'
import { assignmentCategorySelectItems, normalizeAssignmentCategoryId, UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE, type AssignmentCategory } from '@/lib/assignment-categories'
import { setAssignmentCategory } from '@/lib/actions/assignment-categories'
import type { ClassroomAssignmentRow, ClassroomAssignmentSubmissionRow } from './classroom-assignments-tab'

const STATUS_CFG = {
  draft: {
    label: 'ฉบับร่าง',
    description: 'ยังไม่แสดงให้นักเรียนเห็น จนกว่าครูจะเผยแพร่งานชุดนี้',
    badge: 'statusWarning',
  },
  published: {
    label: 'เผยแพร่แล้ว',
    description: 'นักเรียนที่ได้รับมอบหมายสามารถเปิดและทำงานชุดนี้ได้',
    badge: 'statusSuccess',
  },
  closed: {
    label: 'ปิดแล้ว',
    description: 'ปิดรับการทำงานแล้ว นักเรียนจึงเริ่มทำรอบใหม่ไม่ได้',
    badge: 'statusDestructive',
  },
} as const

export function statusConfig(status: string) {
  return STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.draft
}

/** Shared surface for the overview and sortable work list. */
export function TeacherWorkCard({ tone, dragHandle, children, className, ...props }: ComponentProps<typeof Card> & {
  tone: string
  dragHandle?: ReactNode
}) {
  return (
    <Card {...props} radius="md" data-assignment-row className={cn(
      'relative flex h-full min-w-0 shrink-0 overflow-hidden px-3 py-2 transition-[background-color,box-shadow,opacity] [&_.text-muted-foreground]:text-foreground/75',
      tone, className,
    )}>
      {dragHandle}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </Card>
  )
}

interface ContentProps {
  assignment: ClassroomAssignmentRow
  classroomId: string
  submissions: ClassroomAssignmentSubmissionRow[]
  studentCount: number
  audience?: Set<string> | null
  groupNameById?: Map<string, string>
  pendingReview?: number
  categoryPicker: ReactNode
  hasDragHandle?: boolean
}

/** Identical metadata and actions wherever the teacher sees an assignment. */
export function TeacherAssignmentCardContent({
  assignment, classroomId, submissions, studentCount, audience = null,
  groupNameById = new Map(), pendingReview = 0, categoryPicker, hasDragHandle = false,
}: ContentProps) {
  const typeCfg = TYPE_CFG[assignment.type] ?? TYPE_CFG.exam
  const TypeIcon = typeCfg.icon
  const typeVariant = (typeCfg as typeof typeCfg & { variant?: ComponentProps<typeof Badge>['variant'] }).variant ?? 'outline'
  const statusCfg = statusConfig(assignment.status)
  const passingThreshold = formatPassingThreshold(assignment.passing_type, assignment.passing_value)
  const stats = computeAssignmentProgress(assignment, submissions, audience)
  const expected = audience?.size ?? studentCount
  const gradeHref = `/assignments/${assignment.id}/results${pendingReview > 0 ? '?pending=1' : ''}`
  return (
    <div data-teacher-assignment-content className="flex h-full min-w-0 flex-col gap-1.5">
      <Link href={`/assignments/${assignment.id}`} className={cn('flex min-w-0 items-start gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring', hasDragHandle && 'pr-8 pointer-coarse:pr-12')}>
        <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', typeCfg.bg)}>
          <TypeIcon className={cn('size-4', typeCfg.text)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 flex-[1_1_12rem] line-clamp-2 text-sm font-semibold leading-snug text-foreground" title={assignment.title}>
              {assignment.title}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <Badge variant={typeVariant}>{typeCfg.label}</Badge>
              <Badge variant={statusCfg.badge} title={statusCfg.description}>{statusCfg.label}</Badge>
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs text-muted-foreground">{assignmentSizeLabel(assignment)}</span>
            {assignment.group_ids && (
              <span className="flex items-center gap-0.5 text-xs font-medium text-tint-1">
                <Grid3x3 className="size-3" /> เฉพาะ {describeGroupTarget(assignment.group_ids, groupNameById)}
              </span>
            )}
            {assignment.max_attempts != null && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <RefreshCw className="size-3" /> ทำได้ {assignment.max_attempts} ครั้ง
              </span>
            )}
            {passingThreshold && (
              <span className="flex items-center gap-0.5 text-xs font-medium text-foreground">
                <Target className="size-3 text-warning" /> เกณฑ์ผ่าน {passingThreshold}
              </span>
            )}
            {assignment.max_attempts !== 1 && (
              <span className="text-xs text-muted-foreground">· เก็บ{SCORE_STRATEGY_LABELS[assignment.score_strategy]}</span>
            )}
            {assignment.end_at && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <Clock className="size-3" /> {new Date(assignment.end_at).toLocaleDateString('th-TH')}
              </span>
            )}
            {assignment.status !== 'draft' && (
              assignment.type === 'exercise' ? (
                <span className="flex items-center gap-0.5 text-xs font-medium text-foreground">
                  <CheckCircle2 className="size-3 text-success" /> ทำเสร็จ {stats.completed}/{expected} คน
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-0.5 text-xs text-primary">
                    <Users className="size-3" /> เข้าทำ {stats.attempted}/{expected} คน
                  </span>
                  {passingThreshold && (
                    <span className="flex items-center gap-0.5 text-xs font-medium text-foreground">
                      <CheckCircle2 className="size-3 text-success" /> ผ่าน {stats.passed}/{expected} คน
                    </span>
                  )}
                </>
              )
            )}
            {pendingReview > 0 && (
              <span className="flex items-center gap-0.5 text-xs font-medium text-foreground">
                <ClipboardCheck className="size-3 text-warning" /> รอตรวจ {pendingReview} ชิ้น
              </span>
            )}
          </div>
        </div>
      </Link>

      <div className="mt-auto flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1 border-t border-border/60 pt-1.5">
        {categoryPicker}
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            render={(
              <Link
                href={`/assignments/${assignment.id}/preview`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`ดู ${assignment.title} ในมุมนักเรียน`}
                title="เปิดตัวอย่างในมุมนักเรียน"
              />
            )}
          >
            <Eye data-icon="inline-start" />
            ดูในมุมนักเรียน
          </Button>
          <Button variant="ghost" size="sm" render={<Link href={gradeHref} />}>
            <ClipboardCheck data-icon="inline-start" />
            ตรวจให้คะแนน
            {pendingReview > 0 && <span className="text-xs font-semibold text-foreground">{pendingReview}</span>}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            render={<Link href={assignmentCopyHref(classroomId, assignment.id)} />}
          >
            <Copy data-icon="inline-start" /> ทำสำเนา
          </Button>
        </div>
      </div>
    </div>
  )
}

export function AssignmentCategoryPicker({ title, value, categories, disabled, onValueChange }: {
  title: string
  value: string | null
  categories: AssignmentCategory[]
  disabled?: boolean
  onValueChange: (value: string | null) => void
}) {
  const items = assignmentCategorySelectItems(categories)
  const selected = normalizeAssignmentCategoryId(value, categories)
  const label = items.find(item => item.value === (selected ?? UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE))?.label ?? 'ยังไม่จัดกลุ่ม'
  return <Select items={items} value={selected ?? UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE} onValueChange={onValueChange} disabled={disabled}>
    <SelectTrigger size="sm" className="w-36 min-w-0 max-w-full shrink-0" aria-label={`กลุ่มของ ${title}`} title={`กลุ่มงาน: ${label}`}>
      <Folder />
      <SelectValue className="min-w-0">{() => <span className="truncate">{label}</span>}</SelectValue>
    </SelectTrigger>
    <SelectContent align="start" alignItemWithTrigger={false} className="w-max max-w-[calc(100vw-2rem)]"><SelectGroup>
      {items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
    </SelectGroup></SelectContent>
  </Select>
}

/** Overview keeps the work list's category action without enabling reordering. */
export function TeacherAssignmentCard({ categories, onSetAssignmentCategory, ...props }: Omit<ContentProps, 'categoryPicker' | 'hasDragHandle'> & {
  categories: AssignmentCategory[]
  onSetAssignmentCategory?: (assignmentId: string, categoryId: string | null) => Promise<{ ok: boolean; error?: string }>
}) {
  const { assignment, classroomId } = props
  const router = useRouter()
  const [savedCategory, setSavedCategory] = useState<{ source: string | null; value: string | null } | null>(null)
  const [pending, startTransition] = useTransition()
  const source = assignment.category_id ?? null
  const categoryId = savedCategory?.source === source ? savedCategory.value : source
  const type = TYPE_CFG[assignment.type] ?? TYPE_CFG.exam
  function move(value: string | null) {
    if (value === null) return
    const next = value === UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE ? null : value
    startTransition(async () => {
      try {
        const result = onSetAssignmentCategory
          ? await onSetAssignmentCategory(assignment.id, next)
          : await setAssignmentCategory(classroomId, assignment.id, next)
        if (!result.ok) { toast.error(result.error ?? 'ย้ายกลุ่มไม่สำเร็จ'); return }
        setSavedCategory({ source, value: next })
        toast.success(next ? 'ย้ายงานเข้ากลุ่มแล้ว' : 'ย้ายงานไปยังไม่จัดกลุ่มแล้ว')
        if (!onSetAssignmentCategory) router.refresh()
      } catch {
        toast.error('ย้ายกลุ่มไม่สำเร็จ กรุณาลองใหม่')
      }
    })
  }
  return <TeacherWorkCard tone={type.bg}>
    <TeacherAssignmentCardContent {...props} categoryPicker={<AssignmentCategoryPicker title={assignment.title} value={categoryId} categories={categories} disabled={pending} onValueChange={move} />} />
  </TeacherWorkCard>
}
