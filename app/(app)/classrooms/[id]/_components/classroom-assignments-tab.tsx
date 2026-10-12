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
  RefreshCw,
  Target,
  Users,
} from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  type SortingStrategy,
} from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import { toast } from 'sonner'
import { TYPE_CFG } from '@/lib/assignment-display'
import { setAssignmentCategory } from '@/lib/actions/assignment-categories'
import { reorderAssignmentDisplayOrder } from '@/lib/actions/classrooms'
import { assignmentCopyHref } from '@/lib/assignment-creation'
import {
  moveVisibleAssignmentAfter,
  moveVisibleAssignmentColumn,
  reconcileAssignmentOrder,
} from '@/lib/assignment-column-order'
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { AssignmentCreationMenu } from '@/components/assignments/assignment-creation-menu'
import { AssignmentTypeFilter, type AssignmentTypeFilterValue } from '@/components/assignments/assignment-type-filter'
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

type TypeFilter = AssignmentTypeFilterValue

const STATUS_CFG = {
  draft: {
    label: 'ฉบับร่าง',
    description: 'ยังไม่แสดงให้นักเรียนเห็น จนกว่าครูจะเผยแพร่งานชุดนี้',
    badge: 'statusWarning',
    dot: 'bg-warning',
    row: 'border-l-warning bg-card hover:bg-muted/30',
  },
  published: {
    label: 'เผยแพร่แล้ว',
    description: 'นักเรียนที่ได้รับมอบหมายสามารถเปิดและทำงานชุดนี้ได้',
    badge: 'statusSuccess',
    dot: 'bg-success',
    row: 'border-l-success bg-card hover:bg-muted/30',
  },
  closed: {
    label: 'ปิดแล้ว',
    description: 'ปิดรับการทำงานแล้ว นักเรียนจึงเริ่มทำรอบใหม่ไม่ได้',
    badge: 'statusDestructive',
    dot: 'bg-destructive',
    row: 'border-l-destructive bg-card hover:bg-muted/30',
  },
} as const

function statusConfig(status: string) {
  return STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.draft
}

function SortableAssignmentRow({
  assignmentId,
  categoryId,
  title,
  disabled,
  freezeLayout,
  tone,
  status,
  children,
}: {
  assignmentId: string
  categoryId: string | null
  title: string
  disabled: boolean
  freezeLayout: boolean
  tone: string
  status: ReturnType<typeof statusConfig>
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
  } = useSortable({
    id: assignmentId,
    disabled,
    data: { type: 'assignment', assignmentId, categoryId },
  })

  return (
    <div
      ref={setNodeRef}
      data-assignment-row
      style={{
        // The overlay follows the pointer; the original row keeps its place.
        transform: isDragging || freezeLayout ? undefined : DndCSS.Transform.toString(transform),
        transition: freezeLayout ? undefined : transition,
      }}
      className={cn(
        'relative flex gap-2 border-l-4 py-3 pr-2 pl-3 transition-[background-color,box-shadow,opacity]',
        tone,
      )}
    >
      <HoverCard>
        <HoverCardTrigger
          delay={140}
          closeDelay={80}
          render={(
            <button
              type="button"
              aria-label={`สถานะ ${status.label}: ${status.description}`}
              className="absolute inset-y-0 left-0 w-3 cursor-help outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            />
          )}
        />
        <HoverCardContent side="right" align="start">
          <div className="flex items-center gap-2">
            <span className={cn('size-2.5 shrink-0 rounded-full', status.dot)} aria-hidden="true" />
            <p className="font-semibold text-foreground">สถานะ: {status.label}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{status.description}</p>
        </HoverCardContent>
      </HoverCard>
      <Button
        ref={setActivatorNodeRef}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`ลากเพื่อเปลี่ยนลำดับหรือย้ายกลุ่ม ${title}`}
        title="กดค้างแล้วลากเพื่อเรียงหรือย้ายกลุ่ม"
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

const categoryDropId = (categoryId: string | null) => (
  `assignment-category:${categoryId ?? UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE}`
)

const stationaryAssignmentStrategy: SortingStrategy = () => null

/** Prefer a row when the pointer is over one; otherwise the surrounding
 * category card becomes the drop target, including when that card is empty. */
const assignmentCollision: CollisionDetection = args => {
  const within = pointerWithin(args)
  if (within.length > 0) {
    const assignments = within.filter(collision => (
      args.droppableContainers.find(container => container.id === collision.id)?.data.current?.type === 'assignment'
    ))
    if (assignments.length > 0) return assignments
    const categories = within.filter(collision => (
      args.droppableContainers.find(container => container.id === collision.id)?.data.current?.type === 'category'
    ))
    if (categories.length > 0) return categories
  }
  const intersections = rectIntersection(args)
  return intersections.length > 0 ? intersections : closestCenter(args)
}

interface AssignmentCategoryCardProps {
  category: AssignmentCategory | null
  assignmentCount: number
  showHeader: boolean
  isDropTarget: boolean
  children: ReactNode
}

function AssignmentCategoryCard({
  category,
  assignmentCount,
  showHeader,
  isDropTarget,
  children,
}: AssignmentCategoryCardProps) {
  const preset = category ? groupPreset(category.color) : null
  const { setNodeRef } = useDroppable({
    id: categoryDropId(category?.id ?? null),
    data: { type: 'category', categoryId: category?.id ?? null },
  })

  return (
    <Card
      ref={setNodeRef}
      edge="ring"
      role="group"
      aria-label={`กลุ่มงาน ${category?.name ?? 'ยังไม่จัดกลุ่ม'} ${assignmentCount} งาน`}
      data-assignment-category-id={category?.id ?? UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE}
      className={cn(
        'relative overflow-hidden transition-shadow',
        isDropTarget && '[&_[data-assignment-row]]:bg-transparent',
      )}
    >
      {isDropTarget && (
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0',
            preset?.surface ?? 'border-primary/20 bg-primary/10',
          )}
        />
      )}
      <div className="relative">
        {showHeader && (
          <div className={cn(
            'flex items-center gap-2 border-b px-4 py-2.5',
            preset?.surface ?? 'bg-muted/40',
          )}>
            <Folder className={cn('size-4', preset?.text ?? 'text-muted-foreground')} aria-hidden="true" />
            <h3 className={cn('text-sm font-semibold', preset?.text ?? 'text-muted-foreground')}>
              {category?.name ?? 'ยังไม่จัดกลุ่ม'}
            </h3>
            <span className={cn('text-xs', preset?.textMuted ?? 'text-muted-foreground')}>
              {assignmentCount} งาน
            </span>
          </div>
        )}
        <div className={cn('divide-y divide-border', assignmentCount === 0 && 'min-h-24')}>
          {assignmentCount === 0 ? (
            <div className="flex min-h-24 items-center justify-center gap-2 px-4 py-6 text-center text-xs text-muted-foreground">
              <Folder className="size-4 shrink-0" aria-hidden="true" />
              ยังไม่มีงาน · ลากงานมาวางในกลุ่มนี้ได้
            </div>
          ) : children}
        </div>
      </div>
    </Card>
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
  /** QA workbenches can keep category writes in memory instead of touching Supabase. */
  onSetAssignmentCategory?: (
    assignmentId: string,
    categoryId: string | null,
  ) => Promise<{ ok: boolean; error?: string }>
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
  onSetAssignmentCategory,
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
  const [draggingAssignmentId, setDraggingAssignmentId] = useState<string | null>(null)
  const [dragTargetCategoryId, setDragTargetCategoryId] = useState<string | null | undefined>(undefined)
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
  const sections = groupAssignmentsByCategory(filtered, categories, true)
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
      const result = onSetAssignmentCategory
        ? await onSetAssignmentCategory(assignmentId, categoryId)
        : await setAssignmentCategory(classroomId, assignmentId, categoryId)
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

  function saveAssignmentOrder(previousOrder: string[], nextOrder: string[]) {
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

  function handleAssignmentDragStart(event: DragStartEvent) {
    if (event.active.data.current?.type === 'assignment') {
      setDraggingAssignmentId(String(event.active.id))
      setDragTargetCategoryId(undefined)
    }
  }

  function handleAssignmentDragOver(event: DragOverEvent) {
    const overData = event.over?.data.current
    if (overData?.type === 'category' || overData?.type === 'assignment') {
      setDragTargetCategoryId(overData.categoryId as string | null)
      return
    }
    setDragTargetCategoryId(undefined)
  }

  function handleAssignmentDragEnd(event: DragEndEvent) {
    setDraggingAssignmentId(null)
    setDragTargetCategoryId(undefined)
    if (!event.over || event.active.data.current?.type !== 'assignment') return

    const assignmentId = String(event.active.id)
    const overData = event.over.data.current
    const targetCategoryId = overData?.type === 'category' || overData?.type === 'assignment'
      ? (overData.categoryId as string | null)
      : undefined
    if (targetCategoryId === undefined) return

    const previousCategoryId = normalizeAssignmentCategoryId(categoryByAssignment[assignmentId], categories)
    const previousOrder = rows.map(assignment => assignment.id)
    const categoryChanged = previousCategoryId !== targetCategoryId
    const visibleIds = filtered
      .filter(assignment => assignment.category_id === previousCategoryId)
      .map(assignment => assignment.id)
    let nextOrder = previousOrder

    if (categoryChanged) {
      // Cross-group drops always append, even over an existing row or with a type filter.
      const lastAssignmentId = rows
        .filter(assignment => assignment.id !== assignmentId && assignment.category_id === targetCategoryId)
        .at(-1)?.id
      if (lastAssignmentId) {
        nextOrder = moveVisibleAssignmentAfter(previousOrder, previousOrder, assignmentId, lastAssignmentId)
      }
    } else if (overData?.type === 'assignment' && assignmentId !== String(event.over.id)) {
      nextOrder = moveVisibleAssignmentColumn(previousOrder, visibleIds, assignmentId, String(event.over.id))
    }

    const orderChanged = nextOrder.length === previousOrder.length
      && nextOrder.some((id, index) => id !== previousOrder[index])

    if (orderChanged) saveAssignmentOrder(previousOrder, nextOrder)
    if (!categoryChanged) return

    setCategoryByAssignment(current => ({ ...current, [assignmentId]: targetCategoryId }))
    startTransition(async () => {
      const result = onSetAssignmentCategory
        ? await onSetAssignmentCategory(assignmentId, targetCategoryId)
        : await setAssignmentCategory(classroomId, assignmentId, targetCategoryId)
      if (result.ok) {
        const categoryName = targetCategoryId
          ? categories.find(category => category.id === targetCategoryId)?.name
          : 'ยังไม่จัดกลุ่ม'
        toast.success(categoryName ? `ย้ายงานไป “${categoryName}” แล้ว` : 'ย้ายงานแล้ว')
        return
      }

      toast.error(result.error)
      setCategoryByAssignment(current => (
        current[assignmentId] === targetCategoryId
          ? { ...current, [assignmentId]: previousCategoryId }
          : current
      ))
    })
  }

  function categoryName(categoryId: string | null) {
    return categoryId
      ? categories.find(category => category.id === categoryId)?.name ?? 'กลุ่มงาน'
      : 'ยังไม่จัดกลุ่ม'
  }

  const assignmentById = new Map(rows.map(assignment => [assignment.id, assignment]))
  const draggingAssignment = draggingAssignmentId ? assignmentById.get(draggingAssignmentId) ?? null : null
  const draggingTypeCfg = draggingAssignment
    ? TYPE_CFG[draggingAssignment.type] ?? TYPE_CFG.exam
    : TYPE_CFG.exam
  const DraggingTypeIcon = draggingTypeCfg.icon
  const dragTargetName = dragTargetCategoryId === undefined ? null : categoryName(dragTargetCategoryId)
  const announcements: Announcements = {
    onDragStart: ({ active }) => `หยิบงาน ${assignmentById.get(String(active.id))?.title ?? 'งาน'}`,
    onDragOver: ({ active, over }) => over
      ? `${assignmentById.get(String(active.id))?.title ?? 'งาน'} อยู่เหนือ ${categoryName((over.data.current?.categoryId as string | null) ?? null)}`
      : 'งานอยู่นอกกลุ่มที่วางได้',
    onDragEnd: ({ active, over }) => over
      ? `วาง ${assignmentById.get(String(active.id))?.title ?? 'งาน'} ใน ${categoryName((over.data.current?.categoryId as string | null) ?? null)}`
      : 'วางงานไว้ที่เดิม',
    onDragCancel: ({ active }) => `ยกเลิกการย้าย ${assignmentById.get(String(active.id))?.title ?? 'งาน'}`,
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <AssignmentTypeFilter value={typeFilter} onValueChange={setTypeFilter} />

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

      {filtered.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GripVertical className="size-3.5 shrink-0" aria-hidden="true" />
          กดค้างที่ตัวจับแล้วลากขึ้น–ลงเพื่อเรียง หรือวางในกรอบกลุ่มงานเพื่อย้ายกลุ่ม ระบบจะบันทึกให้อัตโนมัติ
          {(isOrderPending || isPending) && <span className="font-medium text-primary">กำลังบันทึก...</span>}
        </p>
      )}

      {filtered.length === 0 && categories.length === 0 ? (
        <Card edge="ring" className="py-12 text-center text-sm text-muted-foreground">
          {assignments.length === 0 ? 'ยังไม่มีงานที่มอบหมายให้ห้องนี้' : 'ไม่พบงานที่ตรงกับตัวกรอง'}
        </Card>
      ) : (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={assignmentCollision}
          onDragStart={handleAssignmentDragStart}
          onDragOver={handleAssignmentDragOver}
          onDragEnd={handleAssignmentDragEnd}
          onDragCancel={() => {
            setDraggingAssignmentId(null)
            setDragTargetCategoryId(undefined)
          }}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable: 'กด Space เพื่อหยิบงาน ใช้ปุ่มลูกศรเพื่อเลือกตำแหน่งหรือกลุ่ม แล้วกด Space อีกครั้งเพื่อวาง หรือกด Escape เพื่อยกเลิก',
            },
          }}
        >
            <div className="flex flex-col gap-3">
              {sections.map(section => {
                const sectionKey = section.category?.id ?? UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE
                const sectionCategoryId = section.category?.id ?? null
                const sortingWithinCategory = draggingAssignmentId !== null
                  && categoryByAssignment[draggingAssignmentId] === sectionCategoryId
                  && dragTargetCategoryId === sectionCategoryId
                return (
                  <SortableContext
                    key={sectionKey}
                    items={section.assignments.map(assignment => assignment.id)}
                    strategy={sortingWithinCategory ? verticalListSortingStrategy : stationaryAssignmentStrategy}
                  >
                  <AssignmentCategoryCard
                    category={section.category}
                    assignmentCount={section.assignments.length}
                    showHeader={categories.length > 0}
                    isDropTarget={
                      draggingAssignmentId !== null
                      && dragTargetCategoryId !== undefined
                      && dragTargetCategoryId === (section.category?.id ?? null)
                    }
                  >
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
                        categoryId={assignment.category_id ?? null}
                        title={assignment.title}
                        disabled={isOrderPending || isPending}
                        freezeLayout={!sortingWithinCategory}
                        tone={statusCfg.row}
                        status={statusCfg}
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
                            render={<Link href={assignmentCopyHref(classroomId, assignment.id)} />}
                          >
                            <Copy data-icon="inline-start" /> ทำสำเนา
                          </Button>
                        </div>
                        </div>
                      </SortableAssignmentRow>
                    )
                  })}
                  </AssignmentCategoryCard>
                  </SortableContext>
                )
              })}
            </div>
          <DragOverlay dropAnimation={null}>
            {draggingAssignment && (
              <Card
                radius="md"
                edge="ring"
                elevation="lg"
                className="pointer-events-none flex w-[30rem] max-w-[calc(100vw-2rem)] items-center gap-3 p-3 ring-primary/40"
              >
                <div className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-lg',
                  draggingTypeCfg.bg,
                )}>
                  <DraggingTypeIcon className={cn('size-4', draggingTypeCfg.text)} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{draggingAssignment.title}</p>
                  <p className="mt-0.5 text-xs font-medium text-primary">
                    {dragTargetName ? `ย้ายไป “${dragTargetName}”` : 'ลากไปยังกลุ่มงานที่ต้องการ'}
                  </p>
                </div>
              </Card>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}
