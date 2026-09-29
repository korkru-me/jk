'use client'

import { useEffect, useId, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Bell, Clock, CheckCircle2, CircleDashed, MinusCircle, XCircle, Download,
  ChevronDown, Folder, GripVertical, Info,
} from 'lucide-react'
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCenter,
  useSensor, useSensors, type Announcements, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
import type { StudentProfileRow } from './homeroom-overview'
import type { SortKey as StudentTableSortKey, SortDir as StudentTableSortDir } from './student-table'
import { sortStudents, STUDENT_SORT_LABEL, type StudentSortKey } from '@/lib/student-sort'
import { compareAssignmentsForDisplay } from '@/lib/student-ability'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { groupPreset } from '@/app/(app)/classrooms/_components/group-colors'

const STATUS_LABEL: Record<string, string> = {
  submitted: 'ส่งแล้ว', graded: 'ส่งแล้ว', in_progress: 'กำลังทำ',
}

type TypeFilter = 'all' | 'exercise' | 'exam'

interface RealStudent { id: string; full_name: string; email: string }

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
  profiles?: Record<string, StudentProfileRow>
  /** The students each กลุ่มย่อย-only งาน was handed to, keyed by assignment id. */
  audienceByAssignment?: Map<string, Set<string>>
  groupNameById?: Map<string, string>
  /** Same sort state driving the "นักเรียน" tab, so both tabs show
   *  students in the same order. Falls back to name when the active sort
   *  is one of that tab's local-only columns (score/status — sample data
   *  with no counterpart here). */
  sortKey: StudentTableSortKey
  sortDir: StudentTableSortDir
  onViewStudents?: () => void
}

interface SortableAssignmentHeaderProps {
  assignment: ClassroomAssignmentRow
  disabled: boolean
  hasNonSubmitter: boolean
  reminding: boolean
  groupNameById: Map<string, string>
  onRemind: () => void
}

function SortableAssignmentHeader({
  assignment, disabled, hasNonSubmitter, reminding, groupNameById, onRemind,
}: SortableAssignmentHeaderProps) {
  const {
    setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging, isOver,
  } = useSortable({ id: assignment.id, disabled, data: { title: assignment.title } })

  return (
    <th
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'px-3 py-3 text-center min-w-[140px] border-b border-border bg-card',
        isOver && !isDragging && 'bg-primary/5',
        isDragging && 'relative z-30 opacity-60 shadow-lg ring-1 ring-primary/30',
      )}
    >
      <Button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        variant="ghost"
        size="xs"
        disabled={disabled}
        aria-label={`ย้ายคอลัมน์ ${assignment.title}`}
        title="กดค้างแล้วลากซ้าย–ขวาเพื่อสลับคอลัมน์"
        className="mx-auto mb-1 cursor-grab touch-manipulation rounded-full px-2 text-[10px] text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical data-icon="inline-start" />
        ลากเพื่อสลับ
      </Button>
      <Link href={`/assignments/${assignment.id}`} className="text-xs font-semibold text-muted-foreground hover:text-primary line-clamp-2">
        {assignment.title}
      </Link>
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

function isSyncableSortKey(key: StudentTableSortKey): key is StudentSortKey {
  return key in STUDENT_SORT_LABEL
}

export function ClassroomScoresMatrix({
  classroomId, classroomName, students, assignments, submissions, extensions, profiles = {},
  categories, audienceByAssignment, groupNameById = new Map(), sortKey, sortDir, onViewStudents,
}: Props) {
  const [reminding, setReminding] = useState<string | null>(null)
  const [dialogTarget, setDialogTarget] = useState<{ assignmentId: string; studentId: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [isOrderPending, startOrderTransition] = useTransition()
  const defaultAssignmentIds = useMemo(
    () => assignments.slice().sort(compareAssignmentsForDisplay).map(assignment => assignment.id),
    [assignments],
  )
  const [assignmentOrder, setAssignmentOrder] = useState(defaultAssignmentIds)
  const [draggingAssignmentId, setDraggingAssignmentId] = useState<string | null>(null)
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

  // Mirror the same student order as the "นักเรียน" tab. If that tab is
  // currently sorted by one of its local-only columns (score/status —
  // sample data with no counterpart here), fall back to name.
  const effectiveSortKey: StudentSortKey = isSyncableSortKey(sortKey) ? sortKey : 'name'
  const orderedStudents = sortStudents(students, profiles, effectiveSortKey, sortDir)
  const sortLabel = STUDENT_SORT_LABEL[effectiveSortKey]

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

  function handleColumnDragStart(event: DragStartEvent) {
    setDraggingAssignmentId(String(event.active.id))
  }

  function handleColumnDragEnd(event: DragEndEvent) {
    setDraggingAssignmentId(null)
    if (!event.over || event.active.id === event.over.id) return

    const previousOrder = orderedAssignments.map(assignment => assignment.id)
    const visibleIds = visibleAssignments.map(assignment => assignment.id)
    const nextOrder = moveVisibleAssignmentColumn(
      previousOrder,
      visibleIds,
      String(event.active.id),
      String(event.over.id),
    )
    if (nextOrder === previousOrder) return

    setAssignmentOrder(nextOrder)
    startOrderTransition(async () => {
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
    onDragStart: ({ active }) => `หยิบคอลัมน์ ${assignmentTitleById.get(String(active.id)) ?? 'งาน'}`,
    onDragOver: ({ active, over }) => over
      ? `กำลังย้าย ${assignmentTitleById.get(String(active.id)) ?? 'งาน'} ไปใกล้ ${assignmentTitleById.get(String(over.id)) ?? 'งาน'}`
      : 'คอลัมน์อยู่นอกตำแหน่งที่วางได้',
    onDragEnd: ({ active, over }) => over
      ? `วาง ${assignmentTitleById.get(String(active.id)) ?? 'งาน'} แล้ว`
      : 'วางคอลัมน์ไว้ที่เดิม',
    onDragCancel: ({ active }) => `ยกเลิกการย้าย ${assignmentTitleById.get(String(active.id)) ?? 'งาน'}`,
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
    const header = ['ลำดับ', 'นักเรียน', 'อีเมล', ...visibleAssignments.map(a => a.title)]
    const rows = orderedStudents.map((s, i) => [
      i + 1, s.full_name, s.email,
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
    const header = ['ลำดับ', 'นักเรียน', 'อีเมล', 'สถานะ', 'คะแนน', 'คะแนนเต็ม', 'ผลการประเมิน', 'ส่งเมื่อ', 'ครั้งที่', 'ขยายเวลาถึง']
    const rows = orderedStudents.map((s, i) => {
      const sub = bestSubmission.get(subKey(assignment.id, s.id))
      const submitted = sub?.status === 'submitted' || sub?.status === 'graded'
      const passed = submitted
        ? computePassed(sub!.total_score, sub!.max_score, assignment.passing_type, assignment.passing_value)
        : null
      const extension = extensionMap.get(subKey(assignment.id, s.id))
      return [
        i + 1, s.full_name, s.email,
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
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                <SelectItem value="all">ทุกหมวดงาน</SelectItem>
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
                  ยังไม่จัดหมวด
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
        <Info className="w-3.5 h-3.5 shrink-0" />
        รายชื่อเรียงตาม<strong className="font-semibold text-muted-foreground">{sortLabel}</strong> ({sortDir === 'asc' ? 'น้อยไปมาก' : 'มากไปน้อย'}) ตามที่ตั้งไว้ที่แท็บ
        {onViewStudents ? (
          <Button variant="link" size="sm" onClick={onViewStudents}>
            &ldquo;นักเรียน&rdquo;
          </Button>
        ) : (
          <span className="font-medium text-muted-foreground">&ldquo;นักเรียน&rdquo;</span>
        )}
        — ไปเปลี่ยนได้ที่นั่น
      </p>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <GripVertical className="w-3.5 h-3.5 shrink-0" />
        กดค้างที่ <strong className="font-semibold text-foreground">ลากเพื่อสลับ</strong> แล้วลากซ้าย–ขวา ลำดับของทั้งคอลัมน์จะบันทึกอัตโนมัติ
        {isOrderPending && <span className="font-medium text-primary">กำลังบันทึก...</span>}
      </p>

      {visibleAssignments.length === 0 ? (
        <Card edge="ring" className="py-12 text-center text-sm text-muted-foreground">
          ไม่พบงานที่ตรงกับตัวกรอง
        </Card>
      ) : (
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleColumnDragStart}
        onDragEnd={handleColumnDragEnd}
        onDragCancel={() => setDraggingAssignmentId(null)}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: 'กด Space เพื่อหยิบคอลัมน์ ใช้ปุ่มลูกศรซ้ายหรือขวาเพื่อเลื่อน แล้วกด Space อีกครั้งเพื่อวาง หรือกด Escape เพื่อยกเลิก',
          },
        }}
      >
      <SortableContext items={visibleAssignments.map(assignment => assignment.id)} strategy={horizontalListSortingStrategy}>
      <Card edge="ring" className="overflow-x-auto">
        {/* border-separate (not -collapse): sticky positioning on table
            cells doesn't reliably paint over a collapsed border seam, which
            let scrolled-under content show through the gap between the
            sticky ลำดับ/นักเรียน columns. */}
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            {/* Row-divider borders live on the cells, not the <tr> — the
                separated-borders table model (needed above) doesn't render
                borders set directly on rows. */}
            <tr>
              <th className="sticky left-0 z-20 bg-card text-center px-2 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-16 min-w-16 max-w-16 border-b border-border">
                ลำดับ
              </th>
              <th className="sticky left-16 z-20 bg-card text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-[180px] border-b border-border">
                นักเรียน
              </th>
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
                    disabled={isOrderPending}
                    hasNonSubmitter={hasNonSubmitter}
                    reminding={reminding === a.id}
                    groupNameById={groupNameById}
                    onRemind={() => handleRemind(a.id)}
                  />
                )
              })}
            </tr>
          </thead>
          <tbody>
            {orderedStudents.map((student, index) => (
              <tr key={student.id} className="hover:bg-muted/50">
                <td className="sticky left-0 z-10 bg-card px-2 py-2.5 text-center text-sm text-muted-foreground w-16 min-w-16 max-w-16 border-b border-border">
                  {index + 1}
                </td>
                <td className="sticky left-16 z-10 bg-card px-4 py-2.5 border-b border-border">
                  <p className="text-sm font-medium text-foreground truncate max-w-[160px]">{student.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[160px]">{student.email}</p>
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
                      <td key={a.id} className={cn(
                        'px-3 py-2.5 text-center border-b border-border bg-muted/40',
                        draggingAssignmentId === a.id && 'bg-primary/10',
                      )}>
                        <span className="text-[11px] text-muted-foreground/60">ไม่ได้มอบหมาย</span>
                      </td>
                    )
                  }

                  return (
                    <td key={a.id} className={cn(
                      'px-3 py-2.5 text-center group relative border-b border-border',
                      draggingAssignmentId === a.id && 'bg-primary/5',
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
        {draggingAssignmentId && (
          <Card edge="ring" className="max-w-56 cursor-grabbing bg-card px-4 py-3 shadow-xl ring-2 ring-primary/30">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <GripVertical className="size-3.5 text-primary" />
              <span className="truncate">{assignmentTitleById.get(draggingAssignmentId) ?? 'งาน'}</span>
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">กำลังย้ายทั้งคอลัมน์</p>
          </Card>
        )}
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
