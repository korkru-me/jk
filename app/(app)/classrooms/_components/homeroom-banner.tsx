'use client'

import Link from 'next/link'
import { Home, Users, Check, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Classroom } from '@/lib/types'

interface Props {
  classroom: Classroom
  studentCount: number
  isSelecting?: boolean
  isSelected?: boolean
  onToggle?: () => void
}

// Deliberately NOT a grid tile like ClassroomCard — a homeroom is a
// fundamentally different thing (a monitoring roster, not a subject with
// assignments), so it gets a full-width banner shape that can't be mistaken
// for a subject classroom at a glance.
export function HomeroomBanner({ classroom, studentCount, isSelecting = false, isSelected = false, onToggle }: Props) {
  const body = (
    <div className="relative flex items-center gap-5 bg-surface-inverse rounded-2xl px-6 py-5 overflow-hidden">
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

      <div className="w-12 h-12 rounded-2xl bg-card/10 flex items-center justify-center shrink-0">
        <Home className="w-6 h-6 text-white" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-primary">ครูที่ปรึกษาประจำชั้น</p>
        <p className="text-white font-bold text-xl leading-tight truncate mt-0.5">{classroom.name}</p>
        {classroom.description && (
          <p className="text-white/50 text-xs mt-1 truncate">{classroom.description}</p>
        )}
      </div>

      <div className="flex items-center gap-2 text-white/80 shrink-0">
        <Users className="w-4 h-4" />
        <span className="font-semibold text-white">{studentCount}</span>
        <span className="text-xs">นักเรียน</span>
      </div>

      {!isSelecting && (
        <span className="flex items-center gap-1 text-sm font-medium text-primary shrink-0">
          ดูภาพรวมการบ้าน <ArrowRight className="w-3.5 h-3.5" />
        </span>
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
    <Link href={`/classrooms/${classroom.id}`} className="block hover:opacity-90 transition-opacity">
      {body}
    </Link>
  )
}
