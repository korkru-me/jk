'use client'

import { useEffect, useId, useMemo, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  BookOpenCheck,
  BarChart3,
  Pencil,
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
import { TeacherAssignmentCardContent, TeacherWorkCard, statusConfig } from './teacher-assignment-card'
import { TYPE_CFG } from '@/lib/assignment-display'
import { setAssignmentCategory } from '@/lib/actions/assignment-categories'
import { reorderAssignmentDisplayOrder } from '@/lib/actions/classrooms'
import { reorderClassroomWork, setPracticeLibraryCategory } from '@/lib/actions/classroom-work'
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
import { PracticeLibraryListActions } from '@/app/(app)/practice/_components/practice-library-list-actions'
import type { ClassroomPracticeLibrariesResult, ClassroomPracticeLibraryItem } from '@/lib/classroom-practice-libraries'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { ClassroomRecentWork } from '@/components/assignments/classroom-recent-work'
import type { RecentClassroomWorkResult } from '@/lib/classroom-recent-work'

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

type ClassroomWorkRow = (ClassroomAssignmentRow & { kind: 'assignment' }) | (
  ClassroomPracticeLibraryItem & {
    kind: 'practice'
    type: 'practice'
    libraryId: string
    category_id: string | null
    display_order: number | null
  }
)
const PRACTICE_TYPE_CFG = { label: 'คลังฝึก', bg: 'bg-primary/10', text: 'text-primary', icon: BookOpenCheck }
const workTypeConfig = (type: string) => type === 'practice' ? PRACTICE_TYPE_CFG : TYPE_CFG[type] ?? TYPE_CFG.exam

function SortableAssignmentRow({
  assignmentId,
  categoryId,
  title,
  disabled,
  freezeLayout,
  tone,
  children,
}: {
  assignmentId: string
  categoryId: string | null
  title: string
  disabled: boolean
  freezeLayout: boolean
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
  } = useSortable({
    id: assignmentId,
    disabled,
    data: { type: 'assignment', assignmentId, categoryId },
  })

  return (
    <TeacherWorkCard
      ref={setNodeRef}
      tone={tone}
      style={{
        transform: isDragging || freezeLayout ? undefined : DndCSS.Transform.toString(transform),
        transition: freezeLayout ? undefined : transition,
      }}
      dragHandle={(
        <Button
          ref={setActivatorNodeRef}
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`ลากเพื่อเปลี่ยนลำดับหรือย้ายกลุ่ม ${title}`}
          title={disabled ? 'กำลังบันทึก หรือยังไม่รองรับการย้ายงานนี้' : 'กดค้างแล้วลากเพื่อเรียงหรือย้ายกลุ่ม'}
          disabled={disabled}
          className="absolute right-2 top-2 z-10 cursor-grab touch-none text-muted-foreground hover:bg-primary/10 hover:text-primary active:cursor-grabbing pointer-coarse:size-[44px]"
          {...attributes}
          {...listeners}
        >
          <GripVertical />
        </Button>
      )}
    >
      {children}
    </TeacherWorkCard>
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
  practiceLibraries?: ClassroomPracticeLibrariesResult | null
  recentWork?: RecentClassroomWorkResult | null
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
  practiceLibraries,
  recentWork,
}: Props) {
  const workItems = useMemo<ClassroomWorkRow[]>(() => [
    ...assignments.map(assignment => ({ ...assignment, kind: 'assignment' as const })),
    ...(practiceLibraries?.items ?? []).map(library => ({
      ...library, id: `practice:${library.id}`, libraryId: library.id,
      kind: 'practice' as const, type: 'practice' as const,
      category_id: library.categoryId ?? null, display_order: library.displayOrder ?? null,
    })),
  ], [assignments, practiceLibraries?.items])
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [categories, setCategories] = useState(initialCategories)
  const [categoryByAssignment, setCategoryByAssignment] = useState<Record<string, string | null>>(
    () => Object.fromEntries(workItems.map(assignment => [
      assignment.id,
      normalizeAssignmentCategoryId(assignment.category_id, initialCategories),
    ])),
  )
  const [isPending, startTransition] = useTransition()
  const [isOrderPending, startOrderTransition] = useTransition()
  const [draggingAssignmentId, setDraggingAssignmentId] = useState<string | null>(null)
  const [dragTargetCategoryId, setDragTargetCategoryId] = useState<string | null | undefined>(undefined)
  const defaultAssignmentIds = useMemo(
    () => workItems
      .map((assignment, index) => ({ assignment, index }))
      .sort((a, b) => (
        (a.assignment.display_order ?? Number.MAX_SAFE_INTEGER)
          - (b.assignment.display_order ?? Number.MAX_SAFE_INTEGER)
        || a.index - b.index
      ))
      .map(({ assignment }) => assignment.id),
    [workItems],
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

  useEffect(() => {
    setCategoryByAssignment(current => Object.fromEntries(workItems.map(work => [
      work.id,
      Object.hasOwn(current, work.id) ? current[work.id] : normalizeAssignmentCategoryId(work.category_id, initialCategories),
    ])))
  }, [workItems, initialCategories])

  const categoryItems = useMemo(() => assignmentCategorySelectItems(categories), [categories])

  const rows = useMemo(() => {
    const byId = new Map(workItems.map(assignment => [assignment.id, assignment]))
    return reconcileAssignmentOrder(assignmentOrder, defaultAssignmentIds)
      .flatMap(id => byId.get(id) ?? [])
      .map(assignment => ({
        ...assignment,
        category_id: normalizeAssignmentCategoryId(categoryByAssignment[assignment.id], categories),
      }))
  }, [assignmentOrder, workItems, categories, categoryByAssignment, defaultAssignmentIds])
  const filtered = rows.filter(assignment => typeFilter === 'all' || assignment.type === typeFilter)
  const layoutBlocked = (practiceLibraries?.items.length ?? 0) > 0 && practiceLibraries?.layoutAvailable === false
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
      const result = await persistCategory(assignmentId, categoryId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setCategoryByAssignment(current => ({ ...current, [assignmentId]: categoryId }))
      toast.success(categoryId ? 'ย้ายงานเข้ากลุ่มแล้ว' : 'ย้ายงานไปยังไม่จัดกลุ่มแล้ว')
    })
  }

  function persistCategory(workId: string, categoryId: string | null) {
    if (onSetAssignmentCategory) return onSetAssignmentCategory(workId, categoryId)
    return workId.startsWith('practice:')
      ? setPracticeLibraryCategory(classroomId, workId.slice(9), categoryId)
      : setAssignmentCategory(classroomId, workId, categoryId)
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
        : practiceLibraries && practiceLibraries.layoutAvailable !== false && !practiceLibraries.error
          ? await reorderClassroomWork(classroomId, nextOrder)
          : await reorderAssignmentDisplayOrder(classroomId, nextOrder.filter(id => !id.startsWith('practice:')))
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
      const result = await persistCategory(assignmentId, targetCategoryId)
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

  function categoryPicker(work: ClassroomWorkRow) {
    return <Select
      items={categoryItems}
      value={work.category_id ?? UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE}
      onValueChange={value => moveToCategory(work.id, value)}
      disabled={isPending || isOrderPending || (work.kind === 'practice' && layoutBlocked)}
    >
      <SelectTrigger size="sm" className="w-40 max-w-full" aria-label={`กลุ่มของ ${work.title}`}>
        <Folder />
        <SelectValue>{value => categoryItems.find(item => item.value === value)?.label ?? 'ยังไม่จัดกลุ่ม'}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end"><SelectGroup>
        {categoryItems.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
      </SelectGroup></SelectContent>
    </Select>
  }

  const assignmentById = new Map(rows.map(assignment => [assignment.id, assignment]))
  const draggingAssignment = draggingAssignmentId ? assignmentById.get(draggingAssignmentId) ?? null : null
  const draggingTypeCfg = draggingAssignment
    ? workTypeConfig(draggingAssignment.type)
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
    <div className="flex min-w-0 flex-col gap-3" data-classroom-work-list>
      {recentWork && <ClassroomRecentWork result={recentWork} />}

      <div className="flex flex-wrap items-center gap-2" data-classroom-work-toolbar>
        <AssignmentTypeFilter value={typeFilter} onValueChange={setTypeFilter} includePractice={!!practiceLibraries} />

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

      {practiceLibraries?.error && <Alert variant="destructive"><AlertTitle>แสดงคลังฝึกไม่สำเร็จ</AlertTitle><AlertDescription>{practiceLibraries.error}</AlertDescription></Alert>}

      {filtered.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GripVertical className="size-3.5 shrink-0" aria-hidden="true" />
          กดค้างที่ตัวจับแล้วลากขึ้น–ลงเพื่อเรียง หรือวางในกรอบกลุ่มงานเพื่อย้ายกลุ่ม ระบบจะบันทึกให้อัตโนมัติ
          {(isOrderPending || isPending) && <span className="font-medium text-primary">กำลังบันทึก...</span>}
        </p>
      )}

      {filtered.length === 0 && categories.length === 0 ? (
        <Card edge="ring" className="py-12 text-center text-sm text-muted-foreground">
          {workItems.length === 0 ? 'ยังไม่มีงานที่มอบหมายให้ห้องนี้' : 'ไม่พบงานที่ตรงกับตัวกรอง'}
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
                    showHeader
                    isDropTarget={
                      draggingAssignmentId !== null
                      && dragTargetCategoryId !== undefined
                      && dragTargetCategoryId === (section.category?.id ?? null)
                    }
                  >
                  {section.assignments.map(assignment => {
                    const statusCfg = statusConfig(assignment.status)
                    const typeCfg = workTypeConfig(assignment.type)
                    const TypeIcon = typeCfg.icon
                    if (assignment.kind === 'practice') {
                      const practiceStatus = {
                        ...statusCfg,
                        description: assignment.status === 'published'
                          ? 'นักเรียนในห้องสามารถเปิดคลังฝึกและฝึกซ้ำได้'
                          : assignment.status === 'closed' ? 'ปิดคลังฝึกแล้ว นักเรียนจึงเข้าใช้คลังนี้ไม่ได้' : 'ยังไม่แสดงคลังฝึกให้นักเรียนเห็นจนกว่าจะเผยแพร่',
                      }
                      return <SortableAssignmentRow key={assignment.id}
                        assignmentId={assignment.id} categoryId={assignment.category_id} title={assignment.title}
                        disabled={isOrderPending || isPending || layoutBlocked} freezeLayout={!sortingWithinCategory}
                        tone={typeCfg.bg}
                      >
                        <div className="flex flex-col gap-3 px-2" data-classroom-practice-row>
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                            <Link href={`/practice/${assignment.libraryId}/edit`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', typeCfg.bg)}>
                                <TypeIcon className={cn('size-4', typeCfg.text)} aria-hidden="true" />
                              </div>
                              <div className="min-w-0">
                                <p className="line-clamp-2 text-sm font-medium leading-snug" title={assignment.title}>{assignment.title}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">{assignment.questionCount} ข้อ · ฝึกซ้ำได้ · ไม่มีคะแนน</p>
                              </div>
                            </Link>
                            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                              {categoryPicker(assignment)}
                              <Badge variant="secondary">คลังฝึก</Badge>
                              <Badge variant={statusCfg.badge} title={practiceStatus.description}>{statusCfg.label}</Badge>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-muted/40 p-1 md:justify-end">
                            <Button variant="ghost" size="sm" render={<Link href={`/practice/${assignment.libraryId}/progress`} />}>
                              <BarChart3 data-icon="inline-start" /> ดูความคืบหน้า
                            </Button>
                            <Button variant="ghost" size="sm" render={<Link href={`/practice/${assignment.libraryId}/edit`} />}>
                              <Pencil data-icon="inline-start" /> แก้ไขการตั้งค่า
                            </Button>
                            <PracticeLibraryListActions id={assignment.libraryId} title={assignment.title} status={assignment.status} canManage />
                          </div>
                        </div>
                      </SortableAssignmentRow>
                    }
                    return (
                      <SortableAssignmentRow
                        key={assignment.id}
                        assignmentId={assignment.id}
                        categoryId={assignment.category_id ?? null}
                        title={assignment.title}
                        disabled={isOrderPending || isPending}
                        freezeLayout={!sortingWithinCategory}
                        tone={typeCfg.bg}
                      >
                        <TeacherAssignmentCardContent
                          assignment={assignment}
                          classroomId={classroomId}
                          submissions={submissions}
                          studentCount={studentCount}
                          audience={audienceByAssignment?.get(assignment.id)}
                          groupNameById={groupNameById}
                          pendingReview={pendingReviewByAssignment?.[assignment.id]}
                          categoryPicker={categoryPicker(assignment)}
                          hasDragHandle
                        />
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
                className={cn('pointer-events-none flex w-[30rem] max-w-[calc(100vw-2rem)] items-center gap-3 p-3 ring-primary/40', draggingTypeCfg.bg)}
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
