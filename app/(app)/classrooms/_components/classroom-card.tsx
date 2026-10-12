'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Users, BookOpen, Check, Copy, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { withBackHref } from '@/lib/back-link'
import type { Classroom } from '@/lib/types'
import { parseDescription, coverOf } from './classroom-meta'
import { IconButton } from '@/components/ui/icon-button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ClassroomIcon } from '@/components/classrooms/classroom-icon'
import { ClassroomCoverPattern } from '@/components/classrooms/classroom-cover-pattern'

interface Props {
  classroom: Pick<Classroom, 'id' | 'name' | 'description' | 'classroom_type'>
  studentCount: number
  assignmentCount: number
  backHref?: string
  isSelecting?: boolean
  isSelected?: boolean
  onToggle?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  dragHandle?: ReactNode
}

export function ClassroomCard({
  classroom, studentCount, assignmentCount,
  backHref = '/classrooms',
  isSelecting = false, isSelected = false, onToggle,
  onDuplicate, onDelete, dragHandle,
}: Props) {
  const isHomeroom = classroom.classroom_type === 'homeroom'
  const meta = parseDescription(classroom.description)
  const savedCover = coverOf(meta)
  const shownDescription = meta.description
  const gradeLevel = meta.gradeLevel
  const academicTerm = meta.academicTerm

  const cardBody = (
    <>
      {/* Cover */}
      <div
        className={cn(
          'relative flex h-16 items-center px-4',
          savedCover
            ? `border-b-2 ${savedCover.surface} ${savedCover.text}`
            : 'border-b border-border bg-muted text-foreground',
        )}
      >
        <ClassroomCoverPattern
          patternKey={meta.coverPattern}
          placement="end"
          className="pointer-events-none absolute inset-0 size-full opacity-45"
        />
        {/* Checkbox overlay in selection mode */}
        {isSelecting && (
          <div
            className={cn(
              'absolute left-3 top-5 z-10 flex size-6 items-center justify-center rounded-md border-2 border-background transition-colors',
              isSelected ? 'bg-card' : 'bg-card/20'
            )}
          >
            {isSelected && <Check className="size-3.5 text-primary stroke-[3]" />}
          </div>
        )}
        {dragHandle}
        <div className={cn('pointer-events-none relative z-10 min-w-0 flex-1', (isSelecting || dragHandle) && 'ml-10')}>
          <div className="flex min-w-0 items-center gap-2">
            <ClassroomIcon iconKey={meta.iconKey} className="size-5 shrink-0" />
            <p className="truncate text-base font-bold leading-tight">
              {classroom.name}
            </p>
            {isHomeroom && <Badge variant="warning" className="shrink-0">HOMEROOM</Badge>}
          </div>
          {(gradeLevel || academicTerm || shownDescription) && <p
            className={cn(
              'mt-1 flex min-w-0 items-center gap-1.5 text-xs font-medium',
              savedCover ? savedCover.textMuted : 'text-muted-foreground',
            )}
          >
            {gradeLevel && <span className="shrink-0"><span className="sr-only">ระดับชั้น </span>{gradeLevel}</span>}
            {gradeLevel && academicTerm && <span aria-hidden="true">·</span>}
            {academicTerm && <span className="shrink-0"><span className="sr-only">ภาคเรียน </span>{academicTerm}</span>}
            {shownDescription && (
              <>
                {(gradeLevel || academicTerm) && <span aria-hidden="true">·</span>}
                <span className="truncate">{shownDescription}</span>
              </>
            )}
          </p>}
        </div>
        <div className={cn(
          'pointer-events-none absolute inset-0 z-20 transition-colors',
          isSelecting && isSelected ? 'bg-primary/15' : 'bg-foreground/0 group-hover:bg-foreground/5'
        )} />
      </div>

      {/* Body */}
      <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="font-semibold text-foreground">{studentCount}</span>
            <span className="text-xs">คน</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <BookOpen className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="font-semibold text-foreground">{assignmentCount}</span>
            <span className="text-xs">งาน</span>
          </div>
        </div>
        {!isSelecting && (onDuplicate || onDelete) && (
          <div className="relative z-20 flex shrink-0 items-center gap-1">
            {onDuplicate && (
              <IconButton
                type="button"
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDuplicate() }}
                label={`คัดลอก ${classroom.name} และเก็บงานเดิมเป็นแบบร่าง`}
                size="sm"
                className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Copy aria-hidden="true" />
              </IconButton>
            )}
            {onDelete && (
              <IconButton
                type="button"
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDelete() }}
                label={`ลบ ${classroom.name}`}
                size="sm"
                className="flex size-8 items-center justify-center rounded-lg border border-destructive/20 text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 aria-hidden="true" />
              </IconButton>
            )}
          </div>
        )}
      </div>
    </>
  )

  if (isSelecting) {
    return (
      <Card
        edge="ring"
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          onToggle?.()
        }}
        role="checkbox"
        aria-checked={isSelected}
        aria-label={`เลือกห้องเรียน ${classroom.name}`}
        tabIndex={0}
        className={cn(
          'group cursor-pointer overflow-hidden transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isSelected ? 'ring-2 ring-primary shadow-md' : 'ring-border hover:ring-primary/20'
        )}
      >
        {cardBody}
      </Card>
    )
  }

  return (
    <Card
      edge="ring"
      className={cn(
        'group relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
        isHomeroom ? 'ring-2 ring-warning/50 shadow-md' : 'ring-1 ring-border',
      )}
    >
      <Link
        href={withBackHref(`/classrooms/${classroom.id}`, backHref)}
        aria-label={`เปิดห้องเรียน ${classroom.name}`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {cardBody}
    </Card>
  )
}
