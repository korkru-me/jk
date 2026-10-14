import { GraduationCap, Home, Users } from 'lucide-react'
import type { Classroom } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { ClassroomIcon } from '@/components/classrooms/classroom-icon'
import { ClassroomCoverPattern } from '@/components/classrooms/classroom-cover-pattern'
import { coverOf, displayDescription, parseDescription } from '../../_components/classroom-meta'

/** The saved teacher cover is also the student's classroom identity. */
export function StudentClassroomHeader({ classroom, teacherName, studentCount }: {
  classroom: Pick<Classroom, 'name' | 'description' | 'classroom_type'>
  teacherName: string
  studentCount: number
}) {
  const meta = parseDescription(classroom.description)
  const cover = coverOf(meta)
  const description = displayDescription(classroom.description)
  const homeroom = classroom.classroom_type === 'homeroom'
  const muted = cover?.textMuted ?? 'text-foreground/75'

  return (
    <Card padding="md" className={cn('relative overflow-hidden border-2', cover ? `${cover.surface} ${cover.text}` : 'bg-muted text-foreground')} data-student-classroom-header>
      <ClassroomCoverPattern patternKey={meta.coverPattern} placement="end" className="pointer-events-none absolute inset-0 size-full opacity-35" />
      <div className="relative flex min-w-0 flex-col gap-2.5">
        {homeroom && <p className={cn('flex items-center gap-1.5 text-xs font-semibold', muted)}><Home className="size-3.5" aria-hidden="true" /> ครูที่ปรึกษาประจำชั้น</p>}
        <h1 className="flex min-w-0 items-center gap-2 text-xl font-bold leading-snug">
          <ClassroomIcon iconKey={meta.iconKey} className="size-6 shrink-0" />
          <span className="min-w-0 break-words">{classroom.name}</span>
        </h1>
        {description && <p className={cn('whitespace-pre-line text-xs leading-relaxed', muted)}>{description}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <p className="flex min-w-0 items-center gap-1.5">
            <GraduationCap className="size-3.5 shrink-0" aria-hidden="true" />
            <span className={muted}>{homeroom ? 'ครูที่ปรึกษา:' : 'ครูผู้สอน:'}</span>
            <span className="min-w-0 break-words font-semibold">{teacherName}</span>
          </p>
          <p className="flex items-center gap-1.5">
            <Users className="size-3.5" aria-hidden="true" />
            <span className="font-semibold">{studentCount}</span><span className={muted}>คนในห้องนี้</span>
          </p>
        </div>
      </div>
    </Card>
  )
}
