'use client'

import Link from 'next/link'
import { Home, Users, Check, ArrowRight, Copy, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Classroom } from '@/lib/types'
import { withBackHref } from '@/lib/back-link'
import { parseDescription, coverOf, displayDescription } from './classroom-meta'
import { IconButton } from '@/components/ui/icon-button'

interface Props {
  classroom: Classroom
  studentCount: number
  isSelecting?: boolean
  isSelected?: boolean
  onToggle?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
}

// Deliberately NOT a grid tile like ClassroomCard — a homeroom is a
// fundamentally different thing (a monitoring roster, not a subject with
// assignments), so it gets a full-width banner shape that can't be mistaken
// for a subject classroom at a glance.
export function HomeroomBanner({
  classroom, studentCount, isSelecting = false, isSelected = false,
  onToggle, onDuplicate, onDelete,
}: Props) {
  // A homeroom carries a cover just like a subject room; without one it keeps
  // the dark inverse surface this banner was designed around.
  const cover = coverOf(parseDescription(classroom.description))
  const shownDescription = displayDescription(classroom.description)

  const body = (
    <div className={cn(
      'relative flex items-center gap-5 rounded-2xl px-6 py-5 overflow-hidden',
      cover
        ? `border-2 ${cover.surface} ${cover.text}`
        : 'bg-surface-inverse text-white',
    )}>
      {isSelecting && (
        <div
          className={cn(
            'w-6 h-6 rounded-md border-2 border-background flex items-center justify-center shrink-0 transition-colors',
            isSelected ? 'bg-card' : 'bg-card/20'
          )}
        >
          {isSelected && <Check className="w-3.5 h-3.5 text-foreground stroke-[3]" />}
        </div>
      )}

      <div className={cn(
        'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0',
        cover ? 'bg-current/10' : 'bg-card/10',
      )}>
        <Home className="w-6 h-6" />
      </div>

      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-[10px] font-bold uppercase tracking-widest',
          cover ? cover.textMuted : 'text-primary',
        )}>ครูที่ปรึกษาประจำชั้น</p>
        <p className="font-bold text-xl leading-tight truncate mt-0.5">{classroom.name}</p>
        {shownDescription && (
          <p className={cn('text-xs mt-1 truncate', cover ? cover.textMuted : 'text-white/50')}>
            {shownDescription}
          </p>
        )}
      </div>

      <div className={cn('flex items-center gap-2 shrink-0', cover ? cover.textMuted : 'text-white/80')}>
        <Users className="w-4 h-4" />
        <span className={cn('font-semibold', !cover && 'text-white')}>{studentCount}</span>
        <span className="text-xs">นักเรียน</span>
      </div>

      {!isSelecting && (
        <span className={cn(
          'mr-20 flex items-center gap-1 text-sm font-medium shrink-0',
          !cover && 'text-primary',
        )}>
          ดูภาพรวมการบ้าน <ArrowRight className="w-3.5 h-3.5" />
        </span>
      )}
      {!isSelecting && (onDuplicate || onDelete) && (
        <div className="absolute right-3 top-3 z-20 flex items-center gap-1">
          {onDuplicate && (
            <IconButton
              type="button"
              size="sm"
              label={`คัดลอก ${classroom.name} และเก็บงานเดิมเป็นแบบร่าง`}
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDuplicate() }}
              className="flex size-8 items-center justify-center rounded-lg bg-card/85 text-muted-foreground hover:bg-card hover:text-foreground"
            >
              <Copy className="size-4" aria-hidden="true" />
            </IconButton>
          )}
          {onDelete && (
            <IconButton
              type="button"
              size="sm"
              label={`ลบ ${classroom.name}`}
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDelete() }}
              className="flex size-8 items-center justify-center rounded-lg bg-card/85 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </IconButton>
          )}
        </div>
      )}
    </div>
  )

  if (isSelecting) {
    return (
      <div onClick={onToggle} className="cursor-pointer">
        {body}
      </div>
    )
  }

  return (
    <div className="group relative transition-opacity hover:opacity-90">
      <Link
        href={withBackHref(`/classrooms/${classroom.id}`, '/classrooms')}
        aria-label={`เปิดห้องเรียน ${classroom.name}`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {body}
    </div>
  )
}
