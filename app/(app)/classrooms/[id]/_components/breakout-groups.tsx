'use client'

import { useId, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor,
  closestCenter, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors,
  type Announcements, type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Search, UserPlus, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  GROUP_COLOR_IDS, GROUP_NAME_MAX, MAX_GROUPS_PER_CLASSROOM,
  defaultGroupName, isGroupColorId, nextGroupColor, normalizeGroupName,
  filterGroupStudents, GROUP_STUDENT_FILTER_ALL, GROUP_STUDENT_FILTER_MISSING,
  type ClassroomGroup, type GroupColorId,
} from '@/lib/classroom-groups'
import { useGroupActions } from './group-actions-context'
import {
  AddStudentsDialog, CreateGroupDialog, groupPreset, type GroupStudent,
} from './group-dialogs'

/** The room's กลุ่มย่อย, held by the classroom page so it outlives tab switches. */
export interface GroupState {
  groups: ClassroomGroup[]
  /** student id → group id; a student with no entry is ยังไม่ได้จัดกลุ่ม. */
  members: Record<string, string>
}

interface Props {
  classroomId: string
  students: GroupStudent[]
  state: GroupState
  setState: Dispatch<SetStateAction<GroupState>>
  /** Owner or admin/manage co-teacher. A view co-teacher only looks. */
  canManage: boolean
  /** Titles of งาน handed to each group, for the warning before a delete. */
  assignmentTitlesByGroup: Map<string, string[]>
}

type DragItem = { type: 'student'; id: string } | { type: 'group'; id: string }

const POOL_ID = 'pool'
const rosterCollator = new Intl.Collator('th', { numeric: true, sensitivity: 'base' })

/**
 * Students are dropped on whatever the pointer is inside — a group card or
 * the "ยังไม่ได้จัดกลุ่ม" pool. A group being reordered only ever lands among
 * the other groups. The keyboard has no pointer, so it falls back to overlap.
 */
const collision: CollisionDetection = args => {
  if (args.active.data.current?.type === 'group') {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(c => c.data.current?.type === 'group'),
    })
  }
  const within = pointerWithin(args)
  return within.length > 0 ? within : rectIntersection(args)
}

function withMembers(members: Record<string, string>, studentIds: string[], groupId: string | null) {
  const next = { ...members }
  for (const id of studentIds) {
    if (groupId) next[id] = groupId
    else delete next[id]
  }
  return next
}

/** First grapheme of the name — Thai marks stay attached to their consonant. */
function initialOf(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const Segmenter = (Intl as typeof Intl & { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (Segmenter) {
    const first = new Segmenter('th', { granularity: 'grapheme' }).segment(trimmed)[Symbol.iterator]().next()
    if (!first.done) return first.value.segment
  }
  return trimmed.slice(0, 1)
}

export function BreakoutGroups({ classroomId, students, state, setState, canManage, assignmentTitlesByGroup }: Props) {
  const [createOpen, setCreateOpen] = useState(false)
  const [pickerGroupId, setPickerGroupId] = useState<string | null>(null)
  const [busy, setBusy] = useState<'create' | null>(null)
  const [dragging, setDragging] = useState<DragItem | null>(null)
  const [poolQuery, setPoolQuery] = useState('')
  const [poolGrade, setPoolGrade] = useState(GROUP_STUDENT_FILTER_ALL)
  const [poolSection, setPoolSection] = useState(GROUP_STUDENT_FILTER_ALL)
  const [confirm, confirmDialog] = useConfirm()
  // dnd-kit numbers its screen-reader hint ids with a module counter, which
  // differs between the server render and the browser; a stable id avoids the
  // hydration mismatch.
  const dndId = useId()
  const {
    createClassroomGroup, deleteClassroomGroup, moveStudentsToGroup,
    reorderClassroomGroups, updateClassroomGroup,
  } = useGroupActions()

  const { groups } = state
  const groupsById = useMemo(() => new Map(groups.map(g => [g.id, g])), [groups])
  const studentsById = useMemo(() => new Map(students.map(s => [s.id, s])), [students])
  // A member row whose group is gone (deleted in another tab) counts as ungrouped.
  const groupOf = (studentId: string) => {
    const g = state.members[studentId]
    return g && groupsById.has(g) ? g : null
  }
  const unassigned = students.filter(s => !groupOf(s.id))
  const membersByGroup = new Map<string, GroupStudent[]>()
  for (const s of students) {
    const g = groupOf(s.id)
    if (g) membersByGroup.set(g, [...(membersByGroup.get(g) ?? []), s])
  }

  const sensors = useSensors(
    // Mouse: a press only becomes a drag once it moves, so clicks on a group's
    // name or buttons still work. Touch: press and hold, so a swipe scrolls.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ── Mutations: optimistic, rolled back if the server says no ──────────────

  function moveStudents(studentIds: string[], groupId: string | null) {
    if (studentIds.length === 0) return Promise.resolve(true)
    const previous = new Map(studentIds.map(id => [id, state.members[id] ?? null]))
    setState(s => ({ ...s, members: withMembers(s.members, studentIds, groupId) }))
    return moveStudentsToGroup(classroomId, studentIds, groupId).then(res => {
      if (res.ok) return true
      toast.error(res.error)
      setState(s => {
        const members = { ...s.members }
        for (const [id, g] of previous) {
          // Only undo what this call changed; a later move of the same
          // student is left alone.
          if ((members[id] ?? null) !== groupId) continue
          if (g) members[id] = g
          else delete members[id]
        }
        return { ...s, members }
      })
      return false
    })
  }

  async function handleCreate(input: { name: string; color: GroupColorId }) {
    setBusy('create')
    const res = await createClassroomGroup(classroomId, input)
    setBusy(null)
    if (!res.ok) { toast.error(res.error); return }
    setState(s => ({ ...s, groups: [...s.groups, res.group] }))
    setCreateOpen(false)
    toast.success(`เพิ่ม “${res.group.name}” แล้ว`)
  }

  function patchGroup(groupId: string, patch: Partial<Pick<ClassroomGroup, 'name' | 'color'>>) {
    const before = groupsById.get(groupId)
    if (!before) return
    setState(s => ({ ...s, groups: s.groups.map(g => (g.id === groupId ? { ...g, ...patch } : g)) }))
    updateClassroomGroup(classroomId, groupId, patch).then(res => {
      if (res.ok) return
      toast.error(res.error)
      setState(s => ({
        ...s,
        groups: s.groups.map(g => (g.id === groupId ? { ...g, name: before.name, color: before.color } : g)),
      }))
    })
  }

  async function handleDelete(group: ClassroomGroup) {
    const count = membersByGroup.get(group.id)?.length ?? 0
    const titles = assignmentTitlesByGroup.get(group.id) ?? []
    const ok = await confirm({
      title: `ลบ “${group.name}” ใช่ไหม?`,
      description: (
        <div className="space-y-2">
          <p>
            {count > 0
              ? <>นักเรียน {count} คนในกลุ่มนี้จะกลับไปอยู่ที่ “ยังไม่ได้จัดกลุ่ม” — ไม่มีใครถูกลบออกจากห้องเรียน</>
              : <>กลุ่มนี้ยังไม่มีนักเรียน</>}
          </p>
          {titles.length > 0 && (
            <p className="text-warning">
              มีงาน {titles.length} ชิ้นที่มอบหมายให้กลุ่มนี้ ({titles.slice(0, 3).join(', ')}{titles.length > 3 ? ' …' : ''})
              หลังลบ นักเรียนกลุ่มนี้ที่ยังไม่ได้เริ่มทำจะมองไม่เห็นงานนั้นแล้ว
            </p>
          )}
          <p>ลบแล้วกู้คืนไม่ได้</p>
        </div>
      ),
      confirmLabel: 'ลบกลุ่ม',
      cancelLabel: 'ไม่ลบ',
      variant: 'destructive',
    })
    if (!ok) return

    const snapshot = state
    setState(s => ({
      groups: s.groups.filter(g => g.id !== group.id),
      members: Object.fromEntries(Object.entries(s.members).filter(([, g]) => g !== group.id)),
    }))
    const res = await deleteClassroomGroup(classroomId, group.id)
    if (!res.ok) {
      toast.error(res.error)
      setState(snapshot)
      return
    }
    toast.success(`ลบ “${group.name}” แล้ว`)
  }

  function handleReorder(fromId: string, toId: string) {
    const from = groups.findIndex(g => g.id === fromId)
    const to = groups.findIndex(g => g.id === toId)
    if (from < 0 || to < 0 || from === to) return
    const previous = groups
    const next = arrayMove(groups, from, to).map((g, position) => ({ ...g, position }))
    setState(s => ({ ...s, groups: next }))
    reorderClassroomGroups(classroomId, next.map(g => g.id)).then(res => {
      if (res.ok) return
      toast.error(res.error)
      setState(s => ({ ...s, groups: previous }))
    })
  }

  async function handlePick(groupId: string, change: { add: string[]; remove: string[] }) {
    const group = groupsById.get(groupId)
    setPickerGroupId(null)
    const results = await Promise.all([moveStudents(change.add, groupId), moveStudents(change.remove, null)])
    if (results.every(Boolean) && group) toast.success(`อัปเดตรายชื่อ “${group.name}” แล้ว`)
  }

  // ── Drag and drop ────────────────────────────────────────────────────────

  function onDragStart({ active }: DragStartEvent) {
    const type = active.data.current?.type
    if (type === 'student') setDragging({ type, id: active.data.current?.studentId as string })
    else if (type === 'group') setDragging({ type, id: String(active.id) })
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null)
    if (!over) return
    const type = active.data.current?.type
    if (type === 'group') {
      if (over.data.current?.type === 'group') handleReorder(String(active.id), String(over.id))
      return
    }
    if (type !== 'student') return
    const studentId = active.data.current?.studentId as string
    const target = over.id === POOL_ID ? null : over.data.current?.type === 'group' ? String(over.id) : undefined
    if (target === undefined || target === groupOf(studentId)) return
    moveStudents([studentId], target)
  }

  function nameOfDroppable(id: string | number) {
    if (id === POOL_ID) return 'ยังไม่ได้จัดกลุ่ม'
    return groupsById.get(String(id))?.name ?? ''
  }
  function nameOfActive(data: Record<string, unknown> | undefined, id: string | number) {
    if (data?.type === 'student') return studentsById.get(data.studentId as string)?.full_name ?? 'นักเรียน'
    return groupsById.get(String(id))?.name ?? 'กลุ่ม'
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => `หยิบ ${nameOfActive(active.data.current, active.id)}`,
    onDragOver: ({ active, over }) => over
      ? `${nameOfActive(active.data.current, active.id)} อยู่เหนือ ${nameOfDroppable(over.id)}`
      : `${nameOfActive(active.data.current, active.id)} ไม่ได้อยู่เหนือกลุ่มใด`,
    onDragEnd: ({ active, over }) => over
      ? `วาง ${nameOfActive(active.data.current, active.id)} ที่ ${nameOfDroppable(over.id)}`
      : `วาง ${nameOfActive(active.data.current, active.id)} ที่เดิม`,
    onDragCancel: ({ active }) => `ยกเลิกการย้าย ${nameOfActive(active.data.current, active.id)}`,
  }

  const draggedStudent = dragging?.type === 'student' ? studentsById.get(dragging.id) : undefined
  const pickerGroup = pickerGroupId ? groupsById.get(pickerGroupId) ?? null : null
  const gradeLevels = useMemo(() => Array.from(new Set(
    students.map(student => student.grade_level?.trim()).filter((value): value is string => !!value),
  )).sort(rosterCollator.compare), [students])
  const sections = useMemo(() => Array.from(new Set(
    students.map(student => student.section_number).filter((value): value is number => value !== null),
  )).sort((a, b) => a - b), [students])
  const poolShown = filterGroupStudents(unassigned, {
    query: poolQuery,
    gradeLevel: poolGrade,
    sectionNumber: poolSection,
  })

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {canManage && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreateOpen(true)}
            disabled={groups.length >= MAX_GROUPS_PER_CLASSROOM}
          >
            <Plus data-icon="inline-start" /> เพิ่มกลุ่ม
          </Button>
        )}
        <p className="ml-auto text-xs text-muted-foreground">
          {canManage
            ? 'กดค้างแล้วลากชื่อนักเรียนไปวางในกลุ่ม · ลากหัวกลุ่มเพื่อสลับตำแหน่ง'
            : 'คุณดูการจัดกลุ่มได้อย่างเดียว'}
        </p>
      </div>

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: 'กด Space เพื่อหยิบกลุ่ม ใช้ปุ่มลูกศรเพื่อเลื่อนตำแหน่ง แล้วกด Space อีกครั้งเพื่อวาง หรือกด Escape เพื่อยกเลิก',
          },
        }}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[17rem_1fr]">
          {/* Unassigned pool */}
          <UnassignedPool
            students={poolShown}
            total={unassigned.length}
            query={poolQuery}
            onQuery={setPoolQuery}
            gradeFilter={poolGrade}
            onGradeFilter={setPoolGrade}
            sectionFilter={poolSection}
            onSectionFilter={setPoolSection}
            gradeLevels={gradeLevels}
            sections={sections}
            hasMissingGrade={students.some(student => !student.grade_level?.trim())}
            hasMissingSection={students.some(student => student.section_number === null)}
            canManage={canManage}
            highlight={dragging?.type === 'student'}
          />

          {/* Groups */}
          {groups.length === 0 ? (
            <Card edge="dashed" className="flex min-h-40 flex-col items-center justify-center gap-2 p-6 text-center">
              <Users className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">ห้องนี้ยังไม่มีกลุ่มย่อย</p>
              <p className="text-xs text-muted-foreground">
                {canManage ? 'กด “เพิ่มกลุ่ม” แล้วตั้งชื่อตามเป้าหมายการจัดกลุ่มของคุณ' : 'ครูผู้สอนยังไม่ได้แบ่งกลุ่ม'}
              </p>
            </Card>
          ) : (
            <SortableContext items={groups.map(g => g.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 content-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {groups.map(group => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    members={membersByGroup.get(group.id) ?? []}
                    canManage={canManage}
                    studentDragging={dragging?.type === 'student'}
                    onRename={name => patchGroup(group.id, { name })}
                    onRecolor={color => patchGroup(group.id, { color })}
                    onDelete={() => handleDelete(group)}
                    onPick={() => setPickerGroupId(group.id)}
                  />
                ))}
              </div>
            </SortableContext>
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {draggedStudent && <ChipBody student={draggedStudent} className="cursor-grabbing shadow-lg ring-2 ring-primary/40" />}
        </DragOverlay>
      </DndContext>

      <CreateGroupDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        suggestedName={defaultGroupName(groups.map(g => g.name))}
        suggestedColor={nextGroupColor(groups.map(g => g.color))}
        pending={busy === 'create'}
        onSubmit={handleCreate}
      />
      <AddStudentsDialog
        open={pickerGroup !== null}
        onOpenChange={open => { if (!open) setPickerGroupId(null) }}
        group={pickerGroup}
        students={students}
        members={Object.fromEntries(students.flatMap(s => {
          const g = groupOf(s.id)
          return g ? [[s.id, g]] : []
        }))}
        groupsById={groupsById}
        onSubmit={change => pickerGroup && handlePick(pickerGroup.id, change)}
      />
      {confirmDialog}
    </div>
  )
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function UnassignedPool({
  students, total, query, onQuery,
  gradeFilter, onGradeFilter, sectionFilter, onSectionFilter,
  gradeLevels, sections, hasMissingGrade, hasMissingSection,
  canManage, highlight,
}: {
  students: GroupStudent[]
  total: number
  query: string
  onQuery: (q: string) => void
  gradeFilter: string
  onGradeFilter: (value: string) => void
  sectionFilter: string
  onSectionFilter: (value: string) => void
  gradeLevels: string[]
  sections: number[]
  hasMissingGrade: boolean
  hasMissingSection: boolean
  canManage: boolean
  highlight: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: POOL_ID, data: { type: 'pool' } })
  const gradeItems = [
    { value: GROUP_STUDENT_FILTER_ALL, label: 'ทุกระดับชั้น' },
    ...gradeLevels.map(grade => ({ value: grade, label: grade })),
    ...(hasMissingGrade ? [{ value: GROUP_STUDENT_FILTER_MISSING, label: 'ไม่ระบุชั้น' }] : []),
  ]
  const sectionItems = [
    { value: GROUP_STUDENT_FILTER_ALL, label: 'ทุกห้อง' },
    ...sections.map(section => ({ value: String(section), label: `ห้อง ${section}` })),
    ...(hasMissingSection ? [{ value: GROUP_STUDENT_FILTER_MISSING, label: 'ไม่ระบุห้อง' }] : []),
  ]
  return (
    <Card
      ref={setNodeRef}
      edge="dashed"
      className={cn(
        'flex flex-col self-start border-2 bg-muted/50 p-3 transition-colors lg:sticky lg:top-4',
        highlight && 'border-primary/30',
        isOver && highlight && 'border-primary bg-primary/10',
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <Users className="size-4 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-semibold text-muted-foreground">ยังไม่ได้จัดกลุ่ม</p>
        <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {students.length === total ? total : `${students.length}/${total}`}
        </span>
      </div>
      <div className="mb-2 grid grid-cols-2 gap-1.5">
        <Select items={gradeItems} value={gradeFilter} onValueChange={value => { if (value !== null) onGradeFilter(value) }}>
          <SelectTrigger size="sm" className="w-full min-w-0 bg-background" aria-label="กรองตามระดับชั้น">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectGroup>
              {gradeItems.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select items={sectionItems} value={sectionFilter} onValueChange={value => { if (value !== null) onSectionFilter(value) }}>
          <SelectTrigger size="sm" className="w-full min-w-0 bg-background" aria-label="กรองตามห้อง">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectGroup>
              {sectionItems.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {(total > 8 || query) && (
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={e => onQuery(e.target.value)}
            placeholder="ค้นหาชื่อ..."
            aria-label="ค้นหาชื่อนักเรียนที่ยังไม่ได้จัดกลุ่ม"
            className="h-7 bg-background pl-8 text-xs"
          />
        </div>
      )}
      <div className="flex max-h-72 flex-wrap content-start gap-1.5 overflow-y-auto lg:max-h-[calc(100dvh-16rem)]">
        {students.map(s => <StudentChip key={s.id} student={s} canManage={canManage} />)}
        {total === 0 && (
          <p className="text-xs italic text-muted-foreground">นักเรียนทุกคนอยู่ในกลุ่มแล้ว</p>
        )}
        {total > 0 && students.length === 0 && (
          <p className="text-xs text-muted-foreground">ไม่พบนักเรียนตามตัวกรอง</p>
        )}
      </div>
    </Card>
  )
}

function GroupCard({
  group, members, canManage, studentDragging, onRename, onRecolor, onDelete, onPick,
}: {
  group: ClassroomGroup
  members: GroupStudent[]
  canManage: boolean
  studentDragging: boolean
  onRename: (name: string) => void
  onRecolor: (color: GroupColorId) => void
  onDelete: () => void
  onPick: () => void
}) {
  const [editing, setEditing] = useState(false)
  const {
    setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging, isOver,
  } = useSortable({ id: group.id, data: { type: 'group' }, disabled: !canManage })
  const preset = groupPreset(group.color)

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'flex min-h-36 flex-col border-2 p-3 transition-shadow',
        preset.surface,
        isOver && studentDragging && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        isDragging && 'relative z-10 opacity-70 shadow-lg',
      )}
    >
      {/* Header — press and drag anywhere on it (outside the name editor) to
          move the whole group; the grip is the keyboard handle. */}
      <div
        {...(canManage && !editing ? listeners : {})}
        className={cn(
          'mb-2 flex items-center gap-1 [-webkit-touch-callout:none]',
          canManage && !editing && 'cursor-grab touch-manipulation select-none active:cursor-grabbing',
        )}
      >
        {canManage && (
          <IconButton
            ref={setActivatorNodeRef}
            {...attributes}
            label={`ย้ายตำแหน่ง ${group.name}`}
            size="2xs"
            className={cn('-ml-1 cursor-grab text-muted-foreground active:cursor-grabbing', preset.textMuted)}
          >
            <GripVertical />
          </IconButton>
        )}

        {canManage ? (
          <GroupColorMenu group={group} onRecolor={onRecolor} />
        ) : (
          <span className={cn('size-3 shrink-0 rounded-full', preset.solid)} aria-hidden="true" />
        )}

        {editing ? (
          <GroupNameEditor
            initial={group.name}
            onDone={name => {
              setEditing(false)
              if (name && name !== group.name) onRename(name)
            }}
          />
        ) : canManage ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setEditing(true)}
            title="กดเพื่อเปลี่ยนชื่อกลุ่ม"
            className={cn('h-6 min-w-0 justify-start px-1 text-sm font-bold hover:bg-background/60', preset.text)}
          >
            <span className="truncate">{group.name}</span>
          </Button>
        ) : (
          <span className={cn('min-w-0 truncate px-1 text-sm font-bold', preset.text)}>{group.name}</span>
        )}

        {!editing && (
          <span className={cn('shrink-0 text-xs', preset.textMuted)}>{members.length} คน</span>
        )}

        {canManage && !editing && (
          <IconButton
            onClick={onDelete}
            label={`ลบ ${group.name}`}
            size="2xs"
            className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
          >
            <X />
          </IconButton>
        )}
      </div>

      {/* Members — the card keeps its size; a long list scrolls inside it. */}
      <div className="flex max-h-40 flex-1 flex-wrap content-start gap-1 overflow-y-auto">
        {members.map(s => <StudentChip key={s.id} student={s} canManage={canManage} />)}
        {members.length === 0 && (
          <p className="px-1 text-xs italic text-muted-foreground">
            {canManage ? 'ลากนักเรียนมาวางที่นี่ หรือกดเพิ่มนักเรียนด้านล่าง' : 'ยังไม่มีนักเรียน'}
          </p>
        )}
      </div>

      {canManage && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onPick}
          className={cn('mt-2 self-start px-1.5 hover:bg-background/60', preset.text)}
        >
          <UserPlus data-icon="inline-start" /> เพิ่มนักเรียน
        </Button>
      )}
    </Card>
  )
}

function GroupNameEditor({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(initial)
  function commit() {
    onDone(normalizeGroupName(value))
  }
  return (
    <Input
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        if (e.key === 'Escape') { e.preventDefault(); onDone(null) }
      }}
      maxLength={GROUP_NAME_MAX}
      aria-label="ชื่อกลุ่ม"
      className="h-7 min-w-0 flex-1 bg-background text-sm font-bold"
      autoFocus
      onFocus={e => e.currentTarget.select()}
    />
  )
}

function GroupColorMenu({ group, onRecolor }: { group: ClassroomGroup; onRecolor: (color: GroupColorId) => void }) {
  const preset = groupPreset(group.color)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`เปลี่ยนสีของ ${group.name} (ตอนนี้สี${preset.label})`}
        title="เปลี่ยนสีกลุ่ม"
        className="flex size-6 shrink-0 items-center justify-center rounded-md outline-none hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn('size-3.5 rounded-full ring-2 ring-background', preset.solid)} />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>สีของกลุ่ม</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={group.color}
            onValueChange={value => { if (isGroupColorId(value) && value !== group.color) onRecolor(value) }}
          >
            {GROUP_COLOR_IDS.map(id => {
              const p = groupPreset(id)
              return (
                <DropdownMenuRadioItem key={id} value={id}>
                  <span className={cn('size-3.5 rounded-full', p.solid)} aria-hidden="true" />
                  {p.label}
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function StudentChip({ student, canManage }: { student: GroupStudent; canManage: boolean }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `student:${student.id}`,
    data: { type: 'student', studentId: student.id },
    disabled: !canManage,
  })
  // Keyboard users move students with "เพิ่มนักเรียน" instead — a hundred
  // chips as separate tab stops would bury everything after them.
  return (
    <div ref={setNodeRef} {...listeners}>
      <HoverCard>
        <HoverCardTrigger delay={180} closeDelay={80} render={<div />}>
          <ChipBody
            student={student}
            className={cn(
              canManage && 'cursor-grab touch-manipulation hover:border-primary/30 active:cursor-grabbing',
              isDragging && 'opacity-40',
            )}
          />
        </HoverCardTrigger>
        <StudentDetails student={student} />
      </HoverCard>
    </div>
  )
}

function StudentDetails({ student }: { student: GroupStudent }) {
  const rows = [
    ['ชั้น', student.grade_level?.trim() || 'ไม่ระบุ'],
    ['ห้อง', student.section_number === null ? 'ไม่ระบุ' : String(student.section_number)],
    ['เลขที่', student.class_number === null ? 'ไม่ระบุ' : String(student.class_number)],
    ['รหัสนักเรียน', student.student_code?.trim() || 'ไม่ระบุ'],
  ]
  return (
    <HoverCardContent side="top" align="start" className="w-60">
      <p className="truncate font-semibold text-foreground">{student.full_name}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="truncate text-right font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </HoverCardContent>
  )
}

function ChipBody({ student, className }: { student: GroupStudent; className?: string }) {
  return (
    <div
      className={cn(
        'flex max-w-full select-none items-center gap-1.5 rounded-lg border border-border bg-background px-1.5 py-1 transition-colors [-webkit-touch-callout:none]',
        className,
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary" aria-hidden="true">
        {initialOf(student.full_name)}
      </span>
      <span className="truncate text-xs text-foreground">{student.full_name}</span>
    </div>
  )
}
