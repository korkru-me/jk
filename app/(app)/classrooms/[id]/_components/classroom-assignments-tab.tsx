'use client'

import { useEffect, useId, useMemo, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Copy,
  Eye,
  Folder,
  GripVertical,
  Grid3x3,
  Pencil,
  RefreshCw,
  Target,
  Users,
} from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import { toast } from 'sonner'
import { TYPE_CFG } from '@/lib/assignment-display'
import { setAssignmentCategory } from '@/lib/actions/assignment-categories'
import { reorderAssignmentDisplayOrder } from '@/lib/actions/classrooms'
import { assignmentCopyHref } from '@/lib/assignment-creation'
import { moveVisibleAssignmentColumn, reconcileAssignmentOrder } from '@/lib/assignment-column-order'
import { SCORE_STRATEGY_LABELS } from '@/lib/scoring'
import { formatPassingThreshold } from '@/lib/grading'
import { assignmentSizeLabel } from '@/lib/assignment-size-label'
import { computeAssignmentProgress } from '@/lib/classroom-progress'
import { describeGroupTarget } from '@/lib/classroom-groups'
import {
  assignmentCategorySelectItems,
  groupAssignmentsByCategory,
  normalizeAssignmentCategoryId,
  UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE,
  type AssignmentCategory,
} from '@/lib/assignment-categories'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AssignmentCreationMenu } from '@/components/assignments/assignment-creation-menu'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { groupPreset } from '@/app/(app)/classrooms/_components/group-colors'
import { AssignmentCategoryManager } from './assignment-category-manager'

export interface ClassroomAssignmentRow {
  id: string
  title: string
  type: string
  mode: string
  status: string
  start_at: string | null
  end_at: string | null
  question_ids: string[]
  random_question_count: number | null
  completion_rule: string | null
  streak_target: number | null
  created_at: string
  passing_type: 'score' | 'percent' | null
  passing_value: number | null
  max_attempts: number | null
  score_strategy: 'best' | 'average' | 'latest'
  display_order?: number | null
  /** กลุ่มย่อย this room's link hands the งาน to; null = ทั้งห้อง. */
  group_ids?: string[] | null
  /** กลุ่มของงานในห้องนี้; null = ยังไม่จัดกลุ่ม. */
  category_id?: string | null
}

export interface ClassroomAssignmentSubmissionRow {
  assignment_id: string
  student_id: string
  status: string
  total_score: number | null
  max_score: number
  attempt_number: number
}

type TypeFilter = 'all' | 'exercise' | 'exam'

const STATUS_CFG = {
  draft: {
    label: 'ฉบับร่าง',
    badge: 'statusWarning',
    row: 'border-l-warning bg-card hover:bg-muted/30',
  },
  published: {
    label: 'เผยแพร่แล้ว',
    badge: 'statusSuccess',
    row: 'border-l-success bg-card hover:bg-muted/30',
  },
  closed: {
    label: 'ปิดแล้ว',
    badge: 'statusDestructive',
    row: 'border-l-destructive bg-card hover:bg-muted/30',
  },
} as const

function statusConfig(status: string) {
  return STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.draft
}

function SortableAssignmentRow({
  assignmentId,
  title,
  disabled,
  tone,
  children,
}: {
  assignmentId: string
  title: string
  disabled: boolean
  tone: string
  children: ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: assignmentId, disabled })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: DndCSS.Transform.toString(transform), transition }}
      className={cn(
        'flex gap-2 border-l-4 px-2 py-3 transition-[background-color,box-shadow,opacity]',
        tone,
        isDragging && 'relative z-10 opacity-75 shadow-md',
      )}
    >
      <Button
        ref={setActivatorNodeRef}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`ลากเพื่อเปลี่ยนลำดับ ${title}`}
        title="กดค้างแล้วลากเพื่อสลับลำดับ"
        disabled={disabled}
        className="mt-0.5 cursor-grab touch-none text-muted-foreground hover:bg-primary/10 hover:text-primary active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical />
      </Button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

interface Props {
  classroomId: string
  assignments: ClassroomAssignmentRow[]
  categories: AssignmentCategory[]
  submissions: ClassroomAssignmentSubmissionRow[]
  studentCount: number
  /** The students each กลุ่มย่อย-only งาน was handed to, keyed by assignment id. */
  audienceByAssignment?: Map<string, Set<string>>
  groupNameById?: Map<string, string>
  /** Hand-ins still waiting for a teacher's score, keyed by assignment id. */
  pendingReviewByAssignment?: Record<string, number>
  /** QA workbenches can keep reorder writes in memory instead of touching Supabase. */
  onReorderAssignments?: (orderedAssignmentIds: string[]) => Promise<{ error?: string }>
}

export function ClassroomAssignmentsTab({
  classroomId,
  assignments,
  categories: initialCategories,
  submissions,
  studentCount,
  audienceByAssignment,
  groupNameById = new Map(),
  pendingReviewByAssignment,
  onReorderAssignments,
}: Props) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [categories, setCategories] = useState(initialCategories)
  const [categoryByAssignment, setCategoryByAssignment] = useState<Record<string, string | null>>(
    () => Object.fromEntries(assignments.map(assignment => [
      assignment.id,
      normalizeAssignmentCategoryId(assignment.category_id, initialCategories),
    ])),
  )
  const [isPending, startTransition] = useTransition()
  const [isOrderPending, startOrderTransition] = useTransition()
  const defaultAssignmentIds = useMemo(
    () => assignments
      .map((assignment, index) => ({ assignment, index }))
      .sort((a, b) => (
        (a.assignment.display_order ?? Number.MAX_SAFE_INTEGER)
          - (b.assignment.display_order ?? Number.MAX_SAFE_INTEGER)
        || a.index - b.index
      ))
      .map(({ assignment }) => assignment.id),
    [assignments],
  )
  const [assignmentOrder, setAssignmentOrder] = useState(defaultAssignmentIds)
  const dndId = useId()
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    setAssignmentOrder(current => reconcileAssignmentOrder(current, defaultAssignmentIds))
  }, [defaultAssignmentIds])

  const categoryItems = useMemo(() => assignmentCategorySelectItems(categories), [categories])

  const rows = useMemo(() => {
    const byId = new Map(assignments.map(assignment => [assignment.id, assignment]))
    return reconcileAssignmentOrder(assignmentOrder, defaultAssignmentIds)
      .flatMap(id => byId.get(id) ?? [])
      .map(assignment => ({
        ...assignment,
        category_id: normalizeAssignmentCategoryId(categoryByAssignment[assignment.id], categories),
      }))
  }, [assignmentOrder, assignments, categories, categoryByAssignment, defaultAssignmentIds])
  const filtered = rows.filter(assignment => typeFilter === 'all' || assignment.type === typeFilter)
  const sections = groupAssignmentsByCategory(filtered, categories)
  const assignmentCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const categoryId of Object.values(categoryByAssignment)) {
      if (categoryId) counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1)
    }
    return counts
  }, [categoryByAssignment])

  function moveToCategory(assignmentId: string, value: string | null) {
    if (value === null) return
    const categoryId = value === UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE ? null : value
    startTransition(async () => {
      const result = await setAssignmentCategory(classroomId, assignmentId, categoryId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setCategoryByAssignment(current => ({ ...current, [assignmentId]: categoryId }))
      toast.success(categoryId ? 'ย้ายงานเข้ากลุ่มแล้ว' : 'ย้ายงานไปยังไม่จัดกลุ่มแล้ว')
    })
  }

  function handleCategoriesChange(nextCategories: AssignmentCategory[]) {
    const known = new Set(nextCategories.map(category => category.id))
    setCategories(nextCategories)
    setCategoryByAssignment(current => Object.fromEntries(
      Object.entries(current).map(([assignmentId, categoryId]) => [
        assignmentId,
        categoryId && known.has(categoryId) ? categoryId : null,
      ]),
    ))
  }

  function handleAssignmentDragEnd(visibleIds: string[], event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return
    const previousOrder = rows.map(assignment => assignment.id)
    const nextOrder = moveVisibleAssignmentColumn(
      previousOrder,
      visibleIds,
      String(event.active.id),
      String(event.over.id),
    )
    if (nextOrder === previousOrder) return

    setAssignmentOrder(nextOrder)
    startOrderTransition(async () => {
      const result = onReorderAssignments
        ? await onReorderAssignments(nextOrder)
        : await reorderAssignmentDisplayOrder(classroomId, nextOrder)
      if (!result?.error) return
      toast.error(result.error)
      setAssignmentOrder(current => (
        current.length === nextOrder.length && current.every((id, index) => id === nextOrder[index])
          ? previousOrder
          : current
      ))
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          value={[typeFilter]}
          onValueChange={values => {
            const next = values.at(-1)
            if (next === 'all' || next === 'exercise' || next === 'exam') setTypeFilter(next)
          }}
          aria-label="กรองประเภทงาน"
          size="sm"
          spacing={1}
          className="rounded-xl bg-muted p-1"
        >
          <ToggleGroupItem value="all">ทั้งหมด</ToggleGroupItem>
          <ToggleGroupItem value="exercise">แบบฝึกหัด</ToggleGroupItem>
          <ToggleGroupItem value="exam">ข้อสอบ</ToggleGroupItem>
        </ToggleGroup>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <AssignmentCategoryManager
            classroomId={classroomId}
            categories={categories}
            assignmentCounts={assignmentCounts}
            onChange={handleCategoriesChange}
          />
          <AssignmentCreationMenu classroomId={classroomId} size="sm" />
        </div>
      </div>

      {filtered.length > 1 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GripVertical className="size-3.5 shrink-0" aria-hidden="true" />
          กดค้างที่ตัวจับแล้วลากขึ้น–ลงเพื่อสลับลำดับงาน ระบบจะบันทึกให้อัตโนมัติ
          {isOrderPending && <span className="font-medium text-primary">กำลังบันทึก...</span>}
        </p>
      )}

      {filtered.length === 0 ? (
        <Card edge="ring" className="py-12 text-center text-sm text-muted-foreground">
          {assignments.length === 0 ? 'ยังไม่มีงานที่มอบหมายให้ห้องนี้' : 'ไม่พบงานที่ตรงกับตัวกรอง'}
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {sections.map(section => {
            const preset = section.category ? groupPreset(section.category.color) : null
            const sectionKey = section.category?.id ?? UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE
            const sectionIds = section.assignments.map(assignment => assignment.id)
            return (
              <DndContext
                key={sectionKey}
                id={`${dndId}-${sectionKey}`}
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={event => handleAssignmentDragEnd(sectionIds, event)}
                accessibility={{
                  screenReaderInstructions: {
                    draggable: 'กด Space เพื่อหยิบงาน ใช้ปุ่มลูกศรเพื่อเลื่อน แล้วกด Space อีกครั้งเพื่อวาง หรือกด Escape เพื่อยกเลิก',
                  },
                }}
              >
                <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
                  <Card edge="ring" className="overflow-hidden">
                {categories.length > 0 && (
                  <div className={cn(
                    'flex items-center gap-2 border-b px-4 py-2.5',
                    preset?.surface ?? 'bg-muted/40',
                  )}>
                    <Folder className={cn('size-4', preset?.text ?? 'text-muted-foreground')} aria-hidden="true" />
                    <h3 className={cn('text-sm font-semibold', preset?.text ?? 'text-muted-foreground')}>
                      {section.category?.name ?? 'ยังไม่จัดกลุ่ม'}
                    </h3>
                    <span className={cn('text-xs', preset?.textMuted ?? 'text-muted-foreground')}>
                      {section.assignments.length} งาน
                    </span>
                  </div>
                )}
                <div className="divide-y divide-border">
                  {section.assignments.map(assignment => {
                    const statusCfg = statusConfig(assignment.status)
                    const typeCfg = TYPE_CFG[assignment.type] ?? TYPE_CFG.exam
                    const TypeIcon = typeCfg.icon
                    const passingThreshold = formatPassingThreshold(assignment.passing_type, assignment.passing_value)
                    const audience = audienceByAssignment?.get(assignment.id) ?? null
                    const stats = computeAssignmentProgress(assignment, submissions, audience)
                    const expected = audience?.size ?? studentCount
                    const pendingReview = pendingReviewByAssignment?.[assignment.id] ?? 0
                    const gradeHref = pendingReview > 0
                      ? `/assignments/${assignment.id}/results?pending=1`
                      : `/assignments/${assignment.id}/results`

                    return (
                      <SortableAssignmentRow
                        key={assignment.id}
                        assignmentId={assignment.id}
                        title={assignment.title}
                        disabled={isOrderPending}
                        tone={statusCfg.row}
                      >
                        <div className="flex flex-col gap-3 px-2">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                          <Link href={`/assignments/${assignment.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                            <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', typeCfg.bg)}>
                              <TypeIcon className={cn('size-4', typeCfg.text)} />
                            </div>
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground" title={assignment.title}>
                                {assignment.title}
                              </p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2">
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

                          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                            <Select
                              items={categoryItems}
                              value={assignment.category_id ?? UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE}
                              onValueChange={value => moveToCategory(assignment.id, value)}
                              disabled={isPending}
                            >
                              <SelectTrigger size="sm" className="w-40 max-w-full" aria-label={`กลุ่มของ ${assignment.title}`}>
                                <Folder />
                                <SelectValue>
                                  {value => categoryItems.find(item => item.value === value)?.label ?? 'ยังไม่จัดกลุ่ม'}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent align="end">
                                <SelectGroup>
                                  {categoryItems.map(item => (
                                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', typeCfg.bg, typeCfg.text)}>
                              {typeCfg.label}
                            </span>
                            <Badge variant={statusCfg.badge}>
                              {statusCfg.label}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-muted/40 p-1 md:justify-end">
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
                            render={<Link href={`/assignments/${assignment.id}/edit`} />}
                          >
                            <Pencil data-icon="inline-start" /> แก้ไขรายละเอียด
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
                      </SortableAssignmentRow>
                    )
                  })}
                </div>
                  </Card>
                </SortableContext>
              </DndContext>
            )
          })}
        </div>
      )}
    </div>
  )
}
