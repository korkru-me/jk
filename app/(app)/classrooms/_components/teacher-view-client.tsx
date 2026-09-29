'use client'

import { useEffect, useMemo, useState, useTransition, type ComponentProps } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, CheckSquare, X, Trash2, BookOpen, Users, GraduationCap, GripVertical } from 'lucide-react'
import {
  DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import {
  bulkDeleteClassrooms, duplicateClassroom, reorderClassrooms, togglePinClassroom,
} from '@/lib/actions/classrooms'
import { ClassroomCard } from './classroom-card'
import { HomeroomBanner } from './homeroom-banner'
import type { Classroom } from '@/lib/types'
import { Card } from '@/components/ui/card'

interface Props {
  classrooms: Classroom[]
  studentCountMap: Record<string, number>
  assignmentCountMap: Record<string, number>
  totalStudents: number
  totalAssignments: number
  trashedCount: number
}

export function TeacherViewClient({
  classrooms, studentCountMap, assignmentCountMap,
  totalStudents, totalAssignments, trashedCount,
}: Props) {
  const router = useRouter()
  const [isSelecting, setIsSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [orderedSubjects, setOrderedSubjects] = useState(
    () => classrooms.filter(c => c.classroom_type !== 'homeroom'),
  )
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [, startPinTransition] = useTransition()
  const [, startOrderTransition] = useTransition()
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const homeroomClassrooms = classrooms.filter(c => c.classroom_type === 'homeroom')
  useEffect(() => {
    setOrderedSubjects(classrooms.filter(c => c.classroom_type !== 'homeroom'))
  }, [classrooms])
  const pinnedSubjects = useMemo(() => orderedSubjects.filter(c => c.pinned_at), [orderedSubjects])
  const movableSubjects = useMemo(() => orderedSubjects.filter(c => !c.pinned_at), [orderedSubjects])

  function handleTogglePin(id: string, currentlyPinned: boolean) {
    startPinTransition(async () => {
      const res = await togglePinClassroom(id, !currentlyPinned)
      if (res?.error) toast.error(res.error)
      else toast.success(currentlyPinned ? 'เลิกปักหมุดแล้ว' : 'ปักหมุดห้องเรียนแล้ว')
    })
  }

  function handleDuplicate(id: string) {
    setDuplicatingId(id)
    startTransition(async () => {
      const res = await duplicateClassroom(id)
      setDuplicatingId(null)
      if ('error' in res) { toast.error(res.error); return }
      toast.success(
        res.copiedAssignments > 0
          ? `คัดลอกห้องเรียนแล้ว · งาน ${res.copiedAssignments} ชิ้นถูกเก็บเป็นแบบร่าง`
          : 'คัดลอกห้องเรียนแล้ว',
      )
      router.refresh()
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const previous = movableSubjects
    const oldIndex = previous.findIndex(classroom => classroom.id === active.id)
    const newIndex = previous.findIndex(classroom => classroom.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const nextMovable = arrayMove(previous, oldIndex, newIndex)
    setOrderedSubjects([...pinnedSubjects, ...nextMovable])
    startOrderTransition(async () => {
      const res = await reorderClassrooms(nextMovable.map(classroom => classroom.id))
      if (res?.error) {
        setOrderedSubjects([...pinnedSubjects, ...previous])
        toast.error(res.error)
      }
    })
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(classrooms.map(c => c.id)))
  }

  function exitSelection() {
    setIsSelecting(false)
    setSelected(new Set())
  }

  function handleBulkDelete() {
    startTransition(async () => {
      const res = await bulkDeleteClassrooms([...selected])
      if (res?.error) { toast.error(res.error); return }
      toast.success(`ย้าย ${selected.size} ห้องเรียนไปถังขยะแล้ว`)
      exitSelection()
    })
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">ห้องเรียนของฉัน</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{classrooms.length} ห้องเรียน</p>
        </div>
        <div className="flex items-center gap-2">
          {trashedCount > 0 && (
            <Link
              href="/classrooms/trash"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-muted-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              ถังขยะ
              <span className="bg-muted text-muted-foreground text-xs font-semibold px-1.5 py-0.5 rounded-full">{trashedCount}</span>
            </Link>
          )}
          {!isSelecting ? (
            <>
              {classrooms.length > 0 && (
                <button
                  onClick={() => setIsSelecting(true)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-muted-foreground px-3 py-1.5 rounded-lg hover:bg-muted border border-border transition-colors"
                >
                  <CheckSquare className="w-4 h-4" />
                  เลือก
                </button>
              )}
              <Link href="/classrooms/new" className={cn(buttonVariants(), 'gap-2 shadow-sm')}>
                <Plus className="w-4 h-4" />
                สร้างห้องเรียน
              </Link>
            </>
          ) : (
            <button
              onClick={exitSelection}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-muted-foreground px-3 py-1.5 rounded-lg hover:bg-muted border border-border transition-colors"
            >
              <X className="w-4 h-4" />
              ยกเลิก
            </button>
          )}
        </div>
      </div>

      {/* Selection mode sub-bar */}
      {isSelecting && (
        <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-xl px-4 py-2.5">
          <span className="text-sm font-medium text-primary">
            เลือกแล้ว {selected.size} ห้องเรียน
          </span>
          <Button variant="link" size="xs"
            onClick={selected.size === classrooms.length ? () => setSelected(new Set()) : selectAll} className="hover:text-primary">
            {selected.size === classrooms.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
          </Button>
        </div>
      )}

      {/* Summary stats */}
      {classrooms.length > 0 && !isSelecting && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'ห้องเรียน', value: classrooms.length, icon: BookOpen, color: 'bg-primary/10 text-primary' },
            { label: 'นักเรียนรวม', value: totalStudents, icon: Users, color: 'bg-tint-1/10 text-tint-1' },
            { label: 'งานทั้งหมด', value: totalAssignments, icon: BookOpen, color: 'bg-warning/10 text-warning' },
          ].map(s => {
            const Icon = s.icon
            return (
              <Card edge="ring" padding="md" className="flex items-center gap-3" key={s.label}>
                <div className={`w-9 h-9 rounded-xl ${s.color} flex items-center justify-center shrink-0`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground leading-none">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {classrooms.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-border rounded-2xl bg-muted/50">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">ยังไม่มีห้องเรียน</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">สร้างห้องเรียนแรกของคุณเพื่อเริ่มมอบหมายงานให้นักเรียน</p>
          <Link href="/classrooms/new" className={cn(buttonVariants(), 'gap-2')}>
            <Plus className="w-4 h-4" />
            สร้างห้องเรียน
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {homeroomClassrooms.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <GraduationCap className="w-3.5 h-3.5" /> ห้อง Homeroom
              </div>
              <div className="space-y-3">
                {homeroomClassrooms.map((c) => (
                  <HomeroomBanner
                    key={c.id}
                    classroom={c}
                    studentCount={studentCountMap[c.id] ?? 0}
                    isSelecting={isSelecting}
                    isSelected={selected.has(c.id)}
                    onToggle={() => toggleSelect(c.id)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {homeroomClassrooms.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <BookOpen className="w-3.5 h-3.5" /> ห้องเรียนวิชา
              </div>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={movableSubjects.map(c => c.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {pinnedSubjects.map(c => (
                    <ClassroomCard
                      key={c.id}
                      classroom={c}
                      studentCount={studentCountMap[c.id] ?? 0}
                      assignmentCount={assignmentCountMap[c.id] ?? 0}
                      isSelecting={isSelecting}
                      isSelected={selected.has(c.id)}
                      onToggle={() => toggleSelect(c.id)}
                      onTogglePin={() => handleTogglePin(c.id, true)}
                      onDuplicate={() => handleDuplicate(c.id)}
                      isDuplicating={duplicatingId === c.id}
                    />
                  ))}
                  {movableSubjects.map(c => (
                    <SortableClassroomCard
                      key={c.id}
                      classroom={c}
                      studentCount={studentCountMap[c.id] ?? 0}
                      assignmentCount={assignmentCountMap[c.id] ?? 0}
                      isSelecting={isSelecting}
                      isSelected={selected.has(c.id)}
                      onToggle={() => toggleSelect(c.id)}
                      onTogglePin={() => handleTogglePin(c.id, false)}
                      onDuplicate={() => handleDuplicate(c.id)}
                      isDuplicating={duplicatingId === c.id}
                    />
                  ))}
                  {!isSelecting && (
                    <Link
                      href="/classrooms/new"
                      className="group flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border p-8 transition-colors hover:border-primary/20 hover:bg-primary/10"
                    >
                      <div className="flex size-10 items-center justify-center rounded-full bg-muted transition-colors group-hover:bg-primary/10">
                        <Plus className="size-5 text-muted-foreground transition-colors group-hover:text-primary" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-primary">สร้างห้องเรียนใหม่</p>
                    </Link>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      )}

      {/* Bulk action bar — sticky bottom */}
      {isSelecting && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-foreground text-background px-5 py-3 rounded-2xl shadow-2xl">
            <span className="text-sm font-medium">{selected.size} ห้องเรียน</span>
            <div className="w-px h-4 bg-card/20" />
            <button
              onClick={handleBulkDelete}
              disabled={isPending}
              className="flex items-center gap-1.5 text-sm hover:text-destructive transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              ย้ายไปถังขยะ
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SortableClassroomCard(props: ComponentProps<typeof ClassroomCard>) {
  const disabled = props.isSelecting || !!props.classroom.pinned_at
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: props.classroom.id, disabled })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'relative opacity-80 shadow-xl')}
    >
      <ClassroomCard
        {...props}
        dragHandle={!disabled ? (
          <IconButton
            type="button"
            label={`ลากเพื่อเปลี่ยนลำดับ ${props.classroom.name}`}
            size="sm"
            className="absolute left-2.5 top-2.5 z-20 flex size-8 cursor-grab touch-none items-center justify-center rounded-lg bg-card/85 text-muted-foreground transition-colors hover:bg-card hover:text-foreground active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </IconButton>
        ) : undefined}
      />
    </div>
  )
}
