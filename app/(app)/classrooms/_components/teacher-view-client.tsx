'use client'

import { useEffect, useState, useTransition, type ComponentProps } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, CheckSquare, X, Trash2, BookOpen, School, Users, GraduationCap, GripVertical } from 'lucide-react'
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
  bulkDeleteClassrooms, deleteClassroom, reorderClassrooms,
} from '@/lib/actions/classrooms'
import { ClassroomCard } from './classroom-card'
import type { Classroom } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { ClassroomCoverPattern } from '@/components/classrooms/classroom-cover-pattern'
import { useConfirm } from '@/components/ui/confirm-dialog'

interface Props {
  classrooms: Classroom[]
  studentCountMap: Record<string, number>
  assignmentCountMap: Record<string, number>
  totalStudents: number
  totalAssignments: number
}

export function TeacherViewClient({
  classrooms, studentCountMap, assignmentCountMap,
  totalStudents, totalAssignments,
}: Props) {
  const router = useRouter()
  const [isSelecting, setIsSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [orderedSubjects, setOrderedSubjects] = useState(
    () => classrooms.filter(c => c.classroom_type !== 'homeroom'),
  )
  const [confirm, confirmDialog] = useConfirm()
  const [isPending, startTransition] = useTransition()
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

  function handleDuplicate(id: string) {
    router.push(`/classrooms/new?copyFrom=${encodeURIComponent(id)}`)
  }

  async function handleDelete(classroom: Classroom) {
    const accepted = await confirm({
      title: `ย้าย “${classroom.name}” ไปถังขยะ?`,
      description: 'ห้องเรียนและข้อมูลภายในจะถูกซ่อนทันที คุณยังกู้คืนได้จากถังขยะภายใน 30 วัน ก่อนระบบลบถาวร',
      confirmLabel: 'ย้ายไปถังขยะ',
      variant: 'destructive',
    })
    if (!accepted) return
    startTransition(async () => {
      const res = await deleteClassroom(classroom.id)
      if (res?.error) { toast.error(res.error); return }
      toast.success(`ย้าย “${classroom.name}” ไปถังขยะแล้ว`)
      router.refresh()
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const previous = orderedSubjects
    const oldIndex = previous.findIndex(classroom => classroom.id === active.id)
    const newIndex = previous.findIndex(classroom => classroom.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const nextSubjects = arrayMove(previous, oldIndex, newIndex)
    setOrderedSubjects(nextSubjects)
    startOrderTransition(async () => {
      const res = await reorderClassrooms(nextSubjects.map(classroom => classroom.id))
      if (res?.error) {
        setOrderedSubjects(previous)
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

  async function handleBulkDelete() {
    const count = selected.size
    const accepted = await confirm({
      title: `ย้ายห้องเรียน ${count} ห้องไปถังขยะ?`,
      description: 'ห้องเรียนและข้อมูลภายในจะถูกซ่อนทันที คุณยังกู้คืนได้จากถังขยะภายใน 30 วัน ก่อนระบบลบถาวร',
      confirmLabel: 'ย้ายไปถังขยะ',
      variant: 'destructive',
    })
    if (!accepted) return
    startTransition(async () => {
      const res = await bulkDeleteClassrooms([...selected])
      if (res?.error) { toast.error(res.error); return }
      toast.success(`ย้าย ${count} ห้องเรียนไปถังขยะแล้ว`)
      exitSelection()
    })
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card padding="md" className="@container/classrooms-header relative isolate overflow-hidden border-primary/20 bg-primary/5" data-classrooms-header>
        <ClassroomCoverPattern patternKey="korkru-deer" placement="end" className="pointer-events-none absolute inset-0 size-full text-primary opacity-15" />
        <div className="relative flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">ห้องเรียนของฉัน</h1>
            <ul aria-label="สรุปห้องเรียน" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/75 @min-[30rem]/classrooms-header:text-sm">
              {[
                { value: classrooms.length, label: 'ห้องเรียน', icon: School },
                { value: totalStudents, label: 'นักเรียน', unit: 'คน', icon: Users },
                { value: totalAssignments, label: 'งานทั้งหมด', icon: BookOpen },
              ].map(({ value, label, unit, icon: Icon }) => <li key={label} className="flex items-center gap-1.5">
                <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                <span>{label} <strong className="font-semibold text-foreground">{value.toLocaleString('th-TH')}</strong>{unit && ` ${unit}`}</span>
              </li>)}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isSelecting ? <>
              {classrooms.length > 0 && <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => setIsSelecting(true)}>
                <CheckSquare data-icon="inline-start" /> เลือก
              </Button>}
              <Link href="/classrooms/new" className={cn(buttonVariants({ size: 'sm' }), 'min-h-[44px] gap-1.5')}>
                <Plus aria-hidden="true" className="size-4" /> สร้างห้องเรียน
              </Link>
            </> : <Button variant="outline" size="sm" className="min-h-[44px]" onClick={exitSelection}>
              <X data-icon="inline-start" /> ยกเลิก
            </Button>}
          </div>
          {isSelecting && <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-t border-primary/15 pt-2">
            <span className="text-sm font-medium text-foreground">เลือกแล้ว {selected.size} ห้องเรียน</span>
            <Button variant="link" size="sm" className="min-h-[44px]" onClick={selected.size === classrooms.length ? () => setSelected(new Set()) : selectAll}>
              {selected.size === classrooms.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
            </Button>
          </div>}
        </div>
      </Card>

      {/* Empty state */}
      {classrooms.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-border rounded-2xl bg-muted/50">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <School className="size-8 text-primary" aria-hidden="true" />
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
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {homeroomClassrooms.map((c) => (
                  <ClassroomCard
                    key={c.id}
                    classroom={c}
                    studentCount={studentCountMap[c.id] ?? 0}
                    assignmentCount={assignmentCountMap[c.id] ?? 0}
                    isSelecting={isSelecting}
                    isSelected={selected.has(c.id)}
                    onToggle={() => toggleSelect(c.id)}
                    onDuplicate={() => handleDuplicate(c.id)}
                    onDelete={() => handleDelete(c)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {homeroomClassrooms.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <School className="size-3.5" aria-hidden="true" /> ห้องเรียนวิชา
              </div>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={orderedSubjects.map(c => c.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {orderedSubjects.map(c => (
                    <SortableClassroomCard
                      key={c.id}
                      classroom={c}
                      studentCount={studentCountMap[c.id] ?? 0}
                      assignmentCount={assignmentCountMap[c.id] ?? 0}
                      isSelecting={isSelecting}
                      isSelected={selected.has(c.id)}
                      onToggle={() => toggleSelect(c.id)}
                      onDuplicate={() => handleDuplicate(c.id)}
                      onDelete={() => handleDelete(c)}
                    />
                  ))}
                  {!isSelecting && (
                    <Link
                      href="/classrooms/new"
                      className="group flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-5 transition-colors hover:border-primary/20 hover:bg-primary/10"
                    >
                      <div className="flex size-9 items-center justify-center rounded-full bg-muted transition-colors group-hover:bg-primary/10">
                        <Plus className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
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
      {confirmDialog}
    </div>
  )
}

function SortableClassroomCard(props: ComponentProps<typeof ClassroomCard>) {
  const disabled = props.isSelecting
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: props.classroom.id, disabled })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'relative opacity-80')}
    >
      <ClassroomCard
        {...props}
        dragHandle={!disabled ? (
          <IconButton
            type="button"
            label={`ลากเพื่อเปลี่ยนลำดับ ${props.classroom.name}`}
            size="sm"
            className="absolute left-3 top-4 z-20 flex size-8 cursor-grab touch-none items-center justify-center rounded-lg bg-card/85 text-muted-foreground transition-colors hover:bg-card hover:text-foreground active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden="true" />
          </IconButton>
        ) : undefined}
      />
    </div>
  )
}
