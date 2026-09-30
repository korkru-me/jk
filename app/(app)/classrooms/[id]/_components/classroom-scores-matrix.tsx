'use client'

import {
  useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useTransition,
} from 'react'
import Link from 'next/link'
import {
  Bell, Clock, CheckCircle2, CircleDashed, MinusCircle, XCircle, Download,
  ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Folder, GripVertical,
} from 'lucide-react'
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCenter,
  useSensor, useSensors, type Announcements, type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import { toast } from 'sonner'
import { notifyNonSubmitters } from '@/lib/actions/notifications'
import { reorderAssignmentDisplayOrder } from '@/lib/actions/classrooms'
import { computePassed } from '@/lib/grading'
import { describeGroupTarget } from '@/lib/classroom-groups'
import { officialSubmissionsByStudent } from '@/lib/scoring'
import { cn, downloadTextFile, toCsv, safeFilenamePart } from '@/lib/utils'
import {
  moveVisibleAssignmentColumn, reconcileAssignmentOrder,
} from '@/lib/assignment-column-order'
import {
  UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE, type AssignmentCategory,
} from '@/lib/assignment-categories'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ExtensionDialog } from './extension-dialog'
import type { ClassroomAssignmentRow } from './classroom-assignments-tab'
import { compareAssignmentsForDisplay } from '@/lib/student-ability'
import {
  nextScoreMatrixSort, sortScoreMatrixStudents,
  type ScoreMatrixSort, type ScoreMatrixSortKey,
} from '@/lib/classroom-score-sort'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { groupPreset } from '@/app/(app)/classrooms/_components/group-colors'

const STATUS_LABEL: Record<string, string> = {
  submitted: 'ส่งแล้ว', graded: 'ส่งแล้ว', in_progress: 'กำลังทำ',
}

type TypeFilter = 'all' | 'exercise' | 'exam'

interface RealStudent {
  id: string
  full_name: string
  email: string
  grade_level?: string | null
  section_number?: number | null
  class_number?: number | null
  student_code?: string | null
}

interface SubmissionRow {
  id: string
  assignment_id: string
  student_id: string
  status: string
  total_score: number | null
  max_score: number
  submitted_at: string | null
  attempt_number: number
}

interface ExtensionRow {
  id: string
  assignment_id: string
  student_id: string
  extended_end_at: string
  note: string | null
}

interface Props {
  classroomId: string
  classroomName: string
  students: RealStudent[]
  assignments: ClassroomAssignmentRow[]
  categories: AssignmentCategory[]
  submissions: SubmissionRow[]
  extensions: ExtensionRow[]
  /** The students each กลุ่มย่อย-only งาน was handed to, keyed by assignment id. */
  audienceByAssignment?: Map<string, Set<string>>
  groupNameById?: Map<string, string>
}

const assignmentDndId = (id: string) => `assignment:${id}`
const rawDndId = (id: string) => id.slice(id.indexOf(':') + 1)

interface SortableAssignmentHeaderProps {
  assignment: ClassroomAssignmentRow
  disabled: boolean
  hasNonSubmitter: boolean
  reminding: boolean
  groupNameById: Map<string, string>
  onRemind: () => void
  sort: ScoreMatrixSort | null
  onSort: () => void
  onColumnMotion: (
    assignmentId: string,
    transform: string | undefined,
    transition: string | undefined,
  ) => void
}

function sortAria(sort: ScoreMatrixSort | null, key: ScoreMatrixSortKey): 'ascending' | 'descending' | 'none' {
  const active = sort?.key.type === key.type
    && (key.type !== 'assignment'
      || (sort?.key.type === 'assignment' && sort.key.assignmentId === key.assignmentId))
  if (!active) return 'none'
  return sort.dir === 'asc' ? 'ascending' : 'descending'
}

function SortIndicator({ value }: { value: 'ascending' | 'descending' | 'none' }) {
  if (value === 'ascending') return <ArrowUp className="size-3" aria-hidden="true" />
  if (value === 'descending') return <ArrowDown className="size-3" aria-hidden="true" />
  return <ArrowUpDown className="size-3 text-muted-foreground/60" aria-hidden="true" />
}

interface RosterSortHeaderProps {
  label: string
  sortKey: ScoreMatrixSortKey
  sort: ScoreMatrixSort
  className: string
  onSort: (key: ScoreMatrixSortKey) => void
}

function RosterSortHeader({ label, sortKey, sort, className, onSort }: RosterSortHeaderProps) {
  const value = sortAria(sort, sortKey)
  return (
    <th
      aria-sort={value}
      className={cn(
        'sticky z-20 border-b border-border bg-card px-1 py-3 text-xs font-semibold text-muted-foreground',
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onPointerDown={event => event.stopPropagation()}
        onClick={event => {
          event.stopPropagation()
          onSort(sortKey)
        }}
        className={cn(
          'h-auto max-w-full gap-1 px-1 py-1 hover:text-primary',
          value !== 'none' && 'bg-primary/10 text-primary',
        )}
        title={`เรียงตาม${label}`}
      >
        <span className="line-clamp-2 whitespace-normal text-center leading-tight">{label}</span>
        <SortIndicator value={value} />
      </Button>
    </th>
  )
}

function SortableAssignmentHeader({
  assignment, disabled, hasNonSubmitter, reminding, groupNameById, onRemind, sort, onSort,
  onColumnMotion,
}: SortableAssignmentHeaderProps) {
  const sortValue = sortAria(sort, { type: 'assignment', assignmentId: assignment.id })
  const {
    setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging, isOver,
  } = useSortable({
    id: assignmentDndId(assignment.id),
    disabled,
    data: { type: 'assignment', assignmentId: assignment.id, title: assignment.title },
  })
  const headerTransform = DndCSS.Translate.toString(transform)

  // dnd-kit calculates the exact displacement for each sortable header. The
  // score cells live in separate table rows, so mirror that same displacement
  // onto every cell in the column. The active column itself is represented by
  // the full-height DragOverlay below; only the columns making room for it
  // need this transform.
  useLayoutEffect(() => {
    onColumnMotion(assignment.id, isDragging ? undefined : headerTransform, transition)
  }, [assignment.id, headerTransform, isDragging, onColumnMotion, transition])

  return (
    <th
      ref={setNodeRef}
      aria-sort={sortValue}
      style={{ transform: headerTransform, transition }}
      className={cn(
        'min-w-32 border-b border-border bg-card px-2 py-3 text-center',
        isOver && !isDragging && 'bg-primary/5',
        isDragging && 'relative z-30 opacity-60 shadow-lg ring-1 ring-primary/30',
      )}
    >
      <div className="mx-auto flex max-w-[160px] items-start justify-center gap-0.5">
        <Button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          type="button"
          variant="ghost"
          size="icon-2xs"
          disabled={disabled}
          aria-label={`ย้ายคอลัมน์ ${assignment.title}`}
          title="ลากเพื่อสลับ"
          className="mt-0.5 shrink-0 cursor-grab touch-manipulation rounded-full text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => {
            event.stopPropagation()
            onSort()
          }}
          className="h-auto min-w-0 flex-1 whitespace-normal px-1 py-0 text-xs font-semibold text-muted-foreground hover:text-primary"
          title={`เรียงนักเรียนตาม ${assignment.title}`}
        >
          <span className="line-clamp-2">{assignment.title}</span>
          <SortIndicator value={sortValue} />
        </Button>
      </div>
      {assignment.group_ids && (
        <p className="mt-0.5 line-clamp-1 text-[10px] font-medium text-tint-1" title={describeGroupTarget(assignment.group_ids, groupNameById)}>
          เฉพาะ {describeGroupTarget(assignment.group_ids, groupNameById)}
        </p>
      )}
      <button
        type="button"
        onClick={onRemind}
        disabled={!hasNonSubmitter || reminding}
        className={cn(
          'mt-1.5 mx-auto flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors',
          hasNonSubmitter
            ? 'bg-warning/10 text-warning hover:bg-warning/15'
            : 'bg-muted text-muted-foreground/40 cursor-default',
        )}
      >
        <Bell className="w-2.5 h-2.5" />
        {reminding ? 'กำลังเตือน...' : 'เตือน'}
      </button>
    </th>
  )
}

export function ClassroomScoresMatrix({
  classroomId, classroomName, students, assignments, submissions, extensions,
  categories, audienceByAssignment, groupNameById = new Map(),
}: Props) {
  const [reminding, setReminding] = useState<string | null>(null)
  const [dialogTarget, setDialogTarget] = useState<{ assignmentId: string; studentId: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [isAssignmentOrderPending, startAssignmentOrderTransition] = useTransition()
  const defaultAssignmentIds = useMemo(
    () => assignments.slice().sort(compareAssignmentsForDisplay).map(assignment => assignment.id),
    [assignments],
  )
  const [assignmentOrder, setAssignmentOrder] = useState(defaultAssignmentIds)
  const [studentSort, setStudentSort] = useState<ScoreMatrixSort>({ key: { type: 'name' }, dir: 'asc' })
  const [draggingAssignmentId, setDraggingAssignmentId] = useState<string | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)
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
    if (categoryFilter === 'all' || categoryFilter === UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE) return
    if (!categories.some(category => category.id === categoryFilter)) setCategoryFilter('all')
  }, [categories, categoryFilter])

  const moveAssignmentCells = useCallback((
    assignmentId: string,
    transform: string | undefined,
    transition: string | undefined,
  ) => {
    const cells = tableRef.current?.querySelectorAll<HTMLTableCellElement>(
      `[data-assignment-column="${assignmentId}"]`,
    )
    if (!cells) return
    for (const cell of cells) {
      cell.style.transform = transform ?? ''
      cell.style.transition = transition ?? ''
      cell.style.willChange = transform ? 'transform' : ''
      cell.style.zIndex = transform ? '1' : ''
    }
  }, [])

  // Default order (no manual display_order set) is oldest-assigned-first. The
  // local order then tracks drag-and-drop immediately while the server saves.
  const orderedAssignments = useMemo(() => {
    const byId = new Map(assignments.map(assignment => [assignment.id, assignment]))
    return reconcileAssignmentOrder(assignmentOrder, defaultAssignmentIds)
      .flatMap(id => byId.get(id) ?? [])
  }, [assignmentOrder, assignments, defaultAssignmentIds])
  const sortedCategories = useMemo(
    () => categories.slice().sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'th')),
    [categories],
  )
  const visibleAssignments = orderedAssignments.filter(assignment => {
    if (typeFilter !== 'all' && assignment.type !== typeFilter) return false
    if (categoryFilter === 'all') return true
    if (categoryFilter === UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE) return !assignment.category_id
    return assignment.category_id === categoryFilter
  })

  // (assignmentId, studentId) -> official submission per that assignment's score_strategy
  const subKey = (aId: string, sId: string) => `${aId}::${sId}`
  const strategyByAssignment = new Map(assignments.map(a => [a.id, a.score_strategy]))
  const submissionsByAssignment = new Map<string, SubmissionRow[]>()
  for (const s of submissions) {
    const arr = submissionsByAssignment.get(s.assignment_id) ?? []
    arr.push(s)
    submissionsByAssignment.set(s.assignment_id, arr)
  }
  const bestSubmission = new Map<string, SubmissionRow>()
  for (const [assignmentId, subs] of submissionsByAssignment) {
    const strategy = strategyByAssignment.get(assignmentId) ?? 'best'
    const officialByStudent = officialSubmissionsByStudent(subs, strategy)
    for (const [studentId, official] of officialByStudent) {
      bestSubmission.set(subKey(assignmentId, studentId), { ...official.representative, total_score: official.total_score, max_score: official.max_score })
    }
  }

  function scoreFor(studentId: string, assignmentId: string): number | null {
    const submission = bestSubmission.get(subKey(assignmentId, studentId))
    if (!submission || (submission.status !== 'submitted' && submission.status !== 'graded')) return null
    if (submission.max_score <= 0) return submission.total_score ?? 0
    return (submission.total_score ?? 0) / submission.max_score
  }

  const orderedStudents = sortScoreMatrixStudents(students, studentSort, scoreFor)

  const extensionMap = new Map<string, ExtensionRow>()
  for (const e of extensions) extensionMap.set(subKey(e.assignment_id, e.student_id), e)

  function handleRemind(assignmentId: string) {
    setReminding(assignmentId)
    startTransition(async () => {
      const res = await notifyNonSubmitters(assignmentId, classroomId)
      setReminding(null)
      if (res?.error) toast.error(res.error)
      else if ((res?.notified ?? 0) === 0) toast.info('ไม่มีนักเรียนที่ต้องเตือนเพิ่ม')
      else toast.success(`เตือนนักเรียนที่ยังไม่ส่งแล้ว ${res.notified} คน`)
    })
  }

  const collisionDetection: CollisionDetection = args => closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter(container => (
      container.data.current?.type === args.active.data.current?.type
    )),
  })

  function toggleStudentSort(key: ScoreMatrixSortKey) {
    setStudentSort(current => nextScoreMatrixSort(current, key))
  }

  function handleDragStart(event: DragStartEvent) {
    if (event.active.data.current?.type === 'assignment') {
      setDraggingAssignmentId(rawDndId(String(event.active.id)))
    }
  }

  function handleDragCancel() {
    setDraggingAssignmentId(null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const type = event.active.data.current?.type
    handleDragCancel()
    if (!event.over || event.active.id === event.over.id) return

    if (type !== 'assignment') return
    const previousOrder = orderedAssignments.map(assignment => assignment.id)
    const visibleIds = visibleAssignments.map(assignment => assignment.id)
    const nextOrder = moveVisibleAssignmentColumn(
      previousOrder,
      visibleIds,
      rawDndId(String(event.active.id)),
      rawDndId(String(event.over.id)),
    )
    if (nextOrder === previousOrder) return

    setAssignmentOrder(nextOrder)
    startAssignmentOrderTransition(async () => {
      const result = await reorderAssignmentDisplayOrder(classroomId, nextOrder)
      if (!result?.error) return
      toast.error(result.error)
      setAssignmentOrder(current => (
        current.length === nextOrder.length && current.every((id, index) => id === nextOrder[index])
          ? previousOrder
          : current
      ))
    })
  }

  const assignmentTitleById = new Map(assignments.map(assignment => [assignment.id, assignment.title]))
  const announcements: Announcements = {
    onDragStart: ({ active }) => `หยิบคอลัมน์ ${assignmentTitleById.get(rawDndId(String(active.id))) ?? 'งาน'}`,
    onDragOver: ({ active, over }) => over
      ? `กำลังย้าย ${assignmentTitleById.get(rawDndId(String(active.id))) ?? 'งาน'} ไปใกล้ ${assignmentTitleById.get(rawDndId(String(over.id))) ?? 'งาน'}`
      : 'รายการอยู่นอกตำแหน่งที่วางได้',
    onDragEnd: ({ over }) => over ? 'วางคอลัมน์งานแล้ว' : 'วางรายการไว้ที่เดิม',
    onDragCancel: () => 'ยกเลิกการย้ายรายการ',
  }

  /** This งาน went to some กลุ่มย่อย only, and this student is in none of them. */
  function notGiven(assignmentId: string, studentId: string) {
    const audience = audienceByAssignment?.get(assignmentId)
    return audience !== undefined && !audience.has(studentId) && !bestSubmission.has(subKey(assignmentId, studentId))
  }

  function cellText(assignmentId: string, studentId: string) {
    const sub = bestSubmission.get(subKey(assignmentId, studentId))
    if (notGiven(assignmentId, studentId)) return 'ไม่ได้มอบหมาย'
    if (!sub || (sub.status !== 'submitted' && sub.status !== 'graded')) {
      return ''
    }
    return sub.total_score ?? 0
  }

  function exportAll() {
    // Mirrors exactly what's on screen: same columns, same order, same filter.
    const header = [
      'ลำดับ', 'นักเรียน', 'อีเมล', 'ชั้น', 'ห้อง', 'เลขที่', 'รหัสนักเรียน',
      ...visibleAssignments.map(a => a.title),
    ]
    const rows = orderedStudents.map((s, i) => [
      i + 1, s.full_name, s.email, s.grade_level ?? '', s.section_number ?? '',
      s.class_number ?? '', s.student_code ?? '',
      ...visibleAssignments.map(a => cellText(a.id, s.id)),
    ])
    const dateStr = new Date().toLocaleDateString('th-TH').replace(/\//g, '-')
    downloadTextFile(
      `คะแนน-${safeFilenamePart(classroomName)}-${dateStr}.csv`,
      toCsv([header, ...rows]),
      'text/csv;charset=utf-8;'
    )
    toast.success('ส่งออกข้อมูลคะแนนแล้ว')
  }

  function exportAssignment(assignment: ClassroomAssignmentRow) {
    const header = [
      'ลำดับ', 'นักเรียน', 'อีเมล', 'ชั้น', 'ห้อง', 'เลขที่', 'รหัสนักเรียน',
      'สถานะ', 'คะแนน', 'คะแนนเต็ม', 'ผลการประเมิน', 'ส่งเมื่อ', 'ครั้งที่', 'ขยายเวลาถึง',
    ]
    const rows = orderedStudents.map((s, i) => {
      const sub = bestSubmission.get(subKey(assignment.id, s.id))
      const submitted = sub?.status === 'submitted' || sub?.status === 'graded'
      const passed = submitted
        ? computePassed(sub!.total_score, sub!.max_score, assignment.passing_type, assignment.passing_value)
        : null
      const extension = extensionMap.get(subKey(assignment.id, s.id))
      return [
        i + 1, s.full_name, s.email, s.grade_level ?? '', s.section_number ?? '',
        s.class_number ?? '', s.student_code ?? '',
        sub ? (STATUS_LABEL[sub.status] ?? sub.status) : notGiven(assignment.id, s.id) ? 'ไม่ได้มอบหมาย' : 'ยังไม่ทำ',
        submitted ? sub!.total_score ?? 0 : '',
        submitted ? sub!.max_score : '',
        passed === null ? '' : (passed ? 'ผ่าน' : 'ไม่ผ่าน'),
        sub?.submitted_at ? new Date(sub.submitted_at).toLocaleString('th-TH') : '',
        sub?.attempt_number ?? '',
        extension ? new Date(extension.extended_end_at).toLocaleString('th-TH') : '',
      ]
    })
    const dateStr = new Date().toLocaleDateString('th-TH').replace(/\//g, '-')
    downloadTextFile(
      `คะแนน-${safeFilenamePart(assignment.title)}-${dateStr}.csv`,
      toCsv([header, ...rows]),
      'text/csv;charset=utf-8;'
    )
    toast.success('ส่งออกข้อมูลงานนี้แล้ว')
  }

  if (assignments.length === 0) {
    return (
      <Card edge="ring" className="py-12 text-center text-sm text-muted-foreground">
        ยังไม่มีงานที่มอบหมายให้ห้องนี้
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filter chips + export */}
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { key: 'all', label: 'ทั้งหมด' },
            { key: 'exercise', label: 'แบบฝึกหัด' },
            { key: 'exam', label: 'ข้อสอบ' },
          ] as { key: TypeFilter; label: string }[]).map(f => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                typeFilter === f.key ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {f.label}
            </button>
          ))}
          <Select
            value={categoryFilter}
            onValueChange={value => { if (value !== null) setCategoryFilter(value) }}
          >
            <SelectTrigger size="sm" className="min-w-36 rounded-full bg-muted/60">
              <Folder className="text-muted-foreground" />
              <SelectValue>
                {value => {
                  if (value === 'all') return 'ทุกกลุ่มงาน'
                  if (value === UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE) return 'ยังไม่จัดกลุ่ม'
                  return sortedCategories.find(category => category.id === value)?.name ?? 'ทุกกลุ่มงาน'
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                <SelectItem value="all">ทุกกลุ่มงาน</SelectItem>
                {sortedCategories.map(category => {
                  const preset = groupPreset(category.color)
                  return (
                    <SelectItem key={category.id} value={category.id}>
                      <span className={cn('size-2.5 rounded-full', preset.solid)} aria-hidden="true" />
                      {category.name}
                    </SelectItem>
                  )
                })}
                <SelectItem value={UNCATEGORIZED_ASSIGNMENT_CATEGORY_VALUE}>
                  <span className="size-2.5 rounded-full bg-muted-foreground/50" aria-hidden="true" />
                  ยังไม่จัดกลุ่ม
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {visibleAssignments.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-accent transition-all outline-none">
              <Download className="w-3.5 h-3.5" /> ส่งออกข้อมูล <ChevronDown className="w-3 h-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-64">
              <DropdownMenuItem onClick={exportAll}>
                <Download className="w-3.5 h-3.5 text-muted-foreground" /> ส่งออกทั้งหมด (ตามตารางนี้)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>ส่งออกเฉพาะงาน</DropdownMenuLabel>
                {visibleAssignments.map(a => (
                  <DropdownMenuItem key={a.id} onClick={() => exportAssignment(a)}>
                    <span className="truncate">{a.title}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <GripVertical className="w-3.5 h-3.5 shrink-0" />
        กดหัวตารางเพื่อเรียงนักเรียน หรือกดค้างแล้วลากหัวงานซ้าย–ขวาเพื่อจัดลำดับคอลัมน์
        {isAssignmentOrderPending && <span className="font-medium text-primary">กำลังบันทึก...</span>}
      </p>

      {visibleAssignments.length === 0 ? (
        <Card edge="ring" className="py-12 text-center text-sm text-muted-foreground">
          ไม่พบงานที่ตรงกับตัวกรอง
        </Card>
      ) : (
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: 'กด Space เพื่อหยิบรายการ ใช้ปุ่มลูกศรเพื่อเลื่อน แล้วกด Space อีกครั้งเพื่อวาง หรือกด Escape เพื่อยกเลิก',
          },
        }}
      >
      <SortableContext items={visibleAssignments.map(assignment => assignmentDndId(assignment.id))} strategy={horizontalListSortingStrategy}>
      <Card edge="ring" className="overflow-x-auto">
        {/* border-separate (not -collapse): sticky positioning on table
            cells doesn't reliably paint over a collapsed border seam, which
            let scrolled-under content show through the gap between the
            sticky ลำดับ/นักเรียน columns. */}
        <table ref={tableRef} className="w-full text-sm border-separate border-spacing-0">
          <thead>
            {/* Row-divider borders live on the cells, not the <tr> — the
                separated-borders table model (needed above) doesn't render
                borders set directly on rows. */}
            <tr>
              <th className="sticky left-0 z-20 w-10 min-w-10 max-w-10 border-b border-border bg-card px-1 py-3 text-center text-xs font-semibold text-muted-foreground">
                ลำดับ
              </th>
              <RosterSortHeader
                label="นักเรียน"
                sortKey={{ type: 'name' }}
                sort={studentSort}
                onSort={toggleStudentSort}
                className="left-10 w-40 min-w-40 max-w-40 text-left"
              />
              <RosterSortHeader
                label="ชั้น"
                sortKey={{ type: 'grade' }}
                sort={studentSort}
                onSort={toggleStudentSort}
                className="left-[calc(var(--spacing)*50)] w-14 min-w-14 max-w-14 text-center"
              />
              <RosterSortHeader
                label="ห้อง"
                sortKey={{ type: 'section' }}
                sort={studentSort}
                onSort={toggleStudentSort}
                className="left-64 w-12 min-w-12 max-w-12 text-center"
              />
              <RosterSortHeader
                label="เลขที่"
                sortKey={{ type: 'number' }}
                sort={studentSort}
                onSort={toggleStudentSort}
                className="left-[calc(var(--spacing)*76)] w-12 min-w-12 max-w-12 text-center"
              />
              <RosterSortHeader
                label="รหัสนักเรียน"
                sortKey={{ type: 'code' }}
                sort={studentSort}
                onSort={toggleStudentSort}
                className="left-[calc(var(--spacing)*88)] w-18 min-w-18 max-w-18 text-center"
              />
              {visibleAssignments.map(a => {
                const hasNonSubmitter = orderedStudents.some(s => {
                  if (notGiven(a.id, s.id)) return false
                  const sub = bestSubmission.get(subKey(a.id, s.id))
                  return !sub || (sub.status !== 'submitted' && sub.status !== 'graded')
                })
                return (
                  <SortableAssignmentHeader
                    key={a.id}
                    assignment={a}
                    disabled={isAssignmentOrderPending}
                    hasNonSubmitter={hasNonSubmitter}
                    reminding={reminding === a.id}
                    groupNameById={groupNameById}
                    onRemind={() => handleRemind(a.id)}
                    sort={studentSort}
                    onSort={() => toggleStudentSort({ type: 'assignment', assignmentId: a.id })}
                    onColumnMotion={moveAssignmentCells}
                  />
                )
              })}
            </tr>
          </thead>
          <tbody>
            {orderedStudents.map((student, index) => (
              <tr key={student.id} className="group/row hover:bg-muted/50">
                <td className="sticky left-0 z-10 w-10 min-w-10 max-w-10 border-b border-border bg-card px-1 py-2.5 text-center text-xs tabular-nums text-muted-foreground transition-colors group-hover/row:bg-muted">
                  {index + 1}
                </td>
                <td className="sticky left-10 z-10 w-40 min-w-40 max-w-40 border-b border-border bg-card px-2.5 py-2.5 transition-colors group-hover/row:bg-muted">
                  <p className="truncate text-sm font-medium text-foreground" title={student.full_name}>{student.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground" title={student.email}>{student.email}</p>
                </td>
                <td className="sticky left-[calc(var(--spacing)*50)] z-10 w-14 min-w-14 max-w-14 border-b border-border bg-card px-1 py-2.5 text-center text-xs text-muted-foreground transition-colors group-hover/row:bg-muted" title={student.grade_level ?? undefined}>
                  <span className="block truncate">{student.grade_level || '—'}</span>
                </td>
                <td className="sticky left-64 z-10 w-12 min-w-12 max-w-12 border-b border-border bg-card px-1 py-2.5 text-center text-xs tabular-nums text-muted-foreground transition-colors group-hover/row:bg-muted">
                  {student.section_number ?? '—'}
                </td>
                <td className="sticky left-[calc(var(--spacing)*76)] z-10 w-12 min-w-12 max-w-12 border-b border-border bg-card px-1 py-2.5 text-center text-xs tabular-nums text-muted-foreground transition-colors group-hover/row:bg-muted">
                  {student.class_number ?? '—'}
                </td>
                <td className="sticky left-[calc(var(--spacing)*88)] z-10 w-18 min-w-18 max-w-18 border-b border-border bg-card px-1 py-2.5 text-center text-xs tabular-nums text-muted-foreground transition-colors group-hover/row:bg-muted" title={student.student_code ?? undefined}>
                  <span className="block truncate">{student.student_code || '—'}</span>
                </td>
                {visibleAssignments.map(a => {
                  const sub = bestSubmission.get(subKey(a.id, student.id))
                  const extension = extensionMap.get(subKey(a.id, student.id))
                  const submitted = sub?.status === 'submitted' || sub?.status === 'graded'
                  const inProgress = sub?.status === 'in_progress'
                  const passed = submitted
                    ? computePassed(sub!.total_score, sub!.max_score, a.passing_type, a.passing_value)
                    : null

                  if (notGiven(a.id, student.id)) {
                    return (
                      <td key={a.id} data-assignment-column={a.id} className={cn(
                        'px-3 py-2.5 text-center border-b border-border bg-muted/40',
                        draggingAssignmentId === a.id && 'bg-primary/10 opacity-40',
                      )}>
                        <span className="text-[11px] text-muted-foreground/60">ไม่ได้มอบหมาย</span>
                      </td>
                    )
                  }

                  return (
                    <td key={a.id} data-assignment-column={a.id} className={cn(
                      'px-3 py-2.5 text-center group relative border-b border-border',
                      draggingAssignmentId === a.id && 'bg-primary/5 opacity-40',
                    )}>
                      {submitted ? (
                        <Link
                          href={`/submissions/${sub!.id}`}
                          className={`flex items-center justify-center gap-1 hover:underline ${
                            passed === false ? 'text-destructive' : 'text-success'
                          }`}
                        >
                          {passed === false ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          <span className="text-xs font-semibold">
                            {sub!.total_score ?? 0}/{sub!.max_score}
                          </span>
                        </Link>
                      ) : inProgress ? (
                        <div className="flex items-center justify-center gap-1 text-primary">
                          <CircleDashed className="w-3.5 h-3.5" />
                          <span className="text-xs">กำลังทำ</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1 text-muted-foreground/40">
                          <MinusCircle className="w-3.5 h-3.5" />
                          <span className="text-xs">ยังไม่ทำ</span>
                        </div>
                      )}

                      {!submitted && (
                        <button
                          onClick={() => setDialogTarget({ assignmentId: a.id, studentId: student.id })}
                          className={`mt-0.5 flex items-center gap-0.5 mx-auto text-[10px] transition-colors ${
                            extension ? 'text-tint-1 font-medium' : 'text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-tint-1'
                          }`}
                        >
                          <Clock className="w-2.5 h-2.5" />
                          {extension ? 'ขยายเวลาแล้ว' : 'ขยายเวลา'}
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {draggingAssignmentId && (() => {
          const assignment = assignments.find(item => item.id === draggingAssignmentId)
          if (!assignment) return null
          return (
            <Card
              edge="ring"
              aria-hidden="true"
              className="w-32 cursor-grabbing overflow-hidden bg-card shadow-xl ring-2 ring-primary/30"
            >
              <div className="flex min-h-28 items-center justify-center gap-1 px-2 py-3 text-center">
                <GripVertical className="size-4 shrink-0 text-primary" />
                <p className="line-clamp-2 text-xs font-semibold text-foreground">{assignment.title}</p>
              </div>
              <div className="max-h-[calc(100dvh-12rem)] overflow-hidden">
                {orderedStudents.map(student => {
                  const sub = bestSubmission.get(subKey(assignment.id, student.id))
                  const submitted = sub?.status === 'submitted' || sub?.status === 'graded'
                  const inProgress = sub?.status === 'in_progress'
                  const passed = submitted
                    ? computePassed(sub!.total_score, sub!.max_score, assignment.passing_type, assignment.passing_value)
                    : null

                  return (
                    <div
                      key={student.id}
                      className="flex min-h-14 items-center justify-center border-t border-border px-2 py-2 text-center"
                    >
                      {notGiven(assignment.id, student.id) ? (
                        <span className="text-[11px] text-muted-foreground/60">ไม่ได้มอบหมาย</span>
                      ) : submitted ? (
                        <span className={cn(
                          'flex items-center gap-1 text-xs font-semibold',
                          passed === false ? 'text-destructive' : 'text-success',
                        )}>
                          {passed === false ? <XCircle className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
                          {sub!.total_score ?? 0}/{sub!.max_score}
                        </span>
                      ) : inProgress ? (
                        <span className="flex items-center gap-1 text-xs text-primary">
                          <CircleDashed className="size-3.5" /> กำลังทำ
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground/40">
                          <MinusCircle className="size-3.5" /> ยังไม่ทำ
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>
          )
        })()}
      </DragOverlay>
      </DndContext>
      )}

      {dialogTarget && (() => {
        const assignment = assignments.find(a => a.id === dialogTarget.assignmentId)
        const student = students.find(s => s.id === dialogTarget.studentId)
        const existing = extensionMap.get(subKey(dialogTarget.assignmentId, dialogTarget.studentId))
        if (!assignment || !student) return null
        return (
          <ExtensionDialog
            assignmentId={assignment.id}
            assignmentTitle={assignment.title}
            studentId={student.id}
            studentName={student.full_name}
            currentExtension={existing ? { extended_end_at: existing.extended_end_at, note: existing.note } : undefined}
            onClose={() => setDialogTarget(null)}
          />
        )
      })()}
    </div>
  )
}
