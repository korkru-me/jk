'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Users, BookOpen, CalendarRange, Check, Copy, GraduationCap, Pin, PinOff, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { withBackHref } from '@/lib/back-link'
import type { Classroom } from '@/lib/types'
import { parseDescription, coverOf } from './classroom-meta'
import { IconButton } from '@/components/ui/icon-button'

interface Props {
  classroom: Classroom
  studentCount: number
  assignmentCount: number
  isSelecting?: boolean
  isSelected?: boolean
  onToggle?: () => void
  onTogglePin?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  dragHandle?: ReactNode
}

export function ClassroomCard({
  classroom, studentCount, assignmentCount,
  isSelecting = false, isSelected = false, onToggle, onTogglePin,
  onDuplicate, onDelete, dragHandle,
}: Props) {
  const isPinned = !!classroom.pinned_at
  const meta = parseDescription(classroom.description)
  const savedCover = coverOf(meta)
  const shownDescription = meta.description

  const cardBody = (
    <>
      {/* Cover */}
      <div
        className={cn(
          'h-20 relative flex items-center justify-between px-5',
          savedCover
            ? `border-b-2 ${savedCover.surface} ${savedCover.text}`
            : 'border-b border-border bg-muted text-foreground',
        )}
      >
        {/* Checkbox overlay in selection mode */}
        {isSelecting && (
          <div
            className={cn(
              'absolute top-2.5 left-2.5 w-6 h-6 rounded-md border-2 border-background flex items-center justify-center transition-colors z-10',
              isSelected ? 'bg-card' : 'bg-card/20'
            )}
          >
            {isSelected && <Check className="w-3.5 h-3.5 text-primary stroke-[3]" />}
          </div>
        )}
        {dragHandle}
        <div className={cn(isSelecting ? 'ml-8' : dragHandle && 'ml-8')}>
          <p className="font-bold text-lg leading-tight">
            {classroom.name}
          </p>
          {shownDescription && (
            <p className={cn(
              'text-xs mt-0.5 truncate max-w-[180px]',
              savedCover ? savedCover.textMuted : 'text-muted-foreground',
            )}>{shownDescription}</p>
          )}
        </div>
        <BookOpen className={cn(
          'size-7 shrink-0',
          !isSelecting && (onDuplicate || onTogglePin || onDelete) && 'mr-28',
          savedCover ? savedCover.textMuted : 'text-muted-foreground',
        )} aria-hidden="true" />
        {!isSelecting && (onDuplicate || onTogglePin || onDelete) && (
          <div className="absolute right-2.5 top-2.5 z-20 flex items-center gap-1">
            {onDuplicate && (
              <IconButton
                type="button"
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDuplicate() }}
                label={`คัดลอก ${classroom.name} และเก็บงานเดิมเป็นแบบร่าง`}
                size="sm"
                className="flex size-8 items-center justify-center rounded-lg bg-card/85 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              >
                <Copy className="size-4" aria-hidden="true" />
              </IconButton>
            )}
            {onTogglePin && (
              <IconButton
                type="button"
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); onTogglePin() }}
                label={isPinned ? `เลิกปักหมุด ${classroom.name} เพื่อให้ลากเปลี่ยนลำดับได้` : `ปักหมุด ${classroom.name} ไว้บนสุด`}
                size="sm"
                className={cn(
                  'flex size-8 items-center justify-center rounded-lg transition-colors',
                  isPinned ? 'bg-card text-warning' : 'bg-card/85 text-muted-foreground hover:bg-card hover:text-foreground',
                )}
              >
                {isPinned ? <Pin className="size-4 fill-current" /> : <PinOff className="size-4" />}
              </IconButton>
            )}
            {onDelete && (
              <IconButton
                type="button"
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDelete() }}
                label={`ลบ ${classroom.name}`}
                size="sm"
                className="flex size-8 items-center justify-center rounded-lg bg-card/85 text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </IconButton>
            )}
          </div>
        )}
        <div className={cn(
          'absolute inset-0 transition-colors',
          isSelecting && isSelected ? 'bg-primary/15' : 'bg-foreground/0 group-hover:bg-foreground/5'
        )} />
      </div>

      {/* Body */}
      <div className="p-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-semibold text-foreground">{studentCount}</span>
            <span className="text-xs">คน</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-semibold text-foreground">{assignmentCount}</span>
            <span className="text-xs">งาน</span>
          </div>
          {isPinned && (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-full">
              <Pin className="w-2.5 h-2.5 fill-current" /> ปักหมุด
            </span>
          )}
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-muted p-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <GraduationCap className="size-3" aria-hidden="true" /> ระดับชั้น
            </div>
            <p className="truncate text-sm font-semibold text-foreground">{meta.gradeLevel || 'ยังไม่ระบุ'}</p>
          </div>
          <div className="min-w-0 border-l border-border pl-3">
            <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <CalendarRange className="size-3" aria-hidden="true" /> ภาคเรียน
            </div>
            <p className="truncate text-sm font-semibold text-foreground">{meta.academicTerm || 'ยังไม่ระบุ'}</p>
          </div>
        </div>

        <div className="pt-3 border-t border-border">
          <div>
            <p className="text-[10px] text-muted-foreground">รหัสห้องเรียน</p>
            <p className="font-mono font-bold text-foreground tracking-widest text-sm">{classroom.class_code}</p>
          </div>
        </div>
      </div>
    </>
  )

  if (isSelecting) {
    return (
      <div
        onClick={onToggle}
        className={cn(
          'group cursor-pointer bg-card rounded-2xl ring-1 overflow-hidden transition-all duration-150',
          isSelected ? 'ring-2 ring-primary shadow-md' : 'ring-border hover:ring-primary/20'
        )}
      >
        {cardBody}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
        isPinned ? 'ring-2 ring-warning/40' : 'ring-1 ring-border',
      )}
    >
      <Link
        href={withBackHref(`/classrooms/${classroom.id}`, '/classrooms')}
        aria-label={`เปิดห้องเรียน ${classroom.name}`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {cardBody}
    </div>
  )
}
