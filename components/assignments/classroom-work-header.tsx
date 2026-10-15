import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ClassroomIcon } from '@/components/classrooms/classroom-icon'
import { ClassroomCoverPattern } from '@/components/classrooms/classroom-cover-pattern'
import { coverOf, parseDescription } from '@/app/(app)/classrooms/_components/classroom-meta'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  classroom?: { name: string; description?: string | null } | null
  showClassroom?: boolean
  kind: 'assignment' | 'practice'
  badges?: ReactNode
  actions?: ReactNode
  summary?: ReactNode
  note?: ReactNode
  details?: { label: string; value: ReactNode; icon?: LucideIcon }[]
}

/** One saved classroom identity, with compact inline information instead of nested cards. */
export function ClassroomWorkHeader({ title, classroom, showClassroom = true, kind, badges, actions, summary, note, details = [] }: Props) {
  const meta = parseDescription(classroom?.description ?? null)
  const cover = coverOf(meta)
  const muted = cover?.textMuted ?? 'text-muted-foreground'

  return (
    <Card padding="sm" className={cn('relative overflow-hidden sm:p-4', cover ? `${cover.surface} ${cover.text}` : 'bg-muted/50')}
      data-classroom-work-header data-assignment-summary={kind === 'assignment' ? true : undefined} data-practice-header={kind === 'practice' ? true : undefined}>
      <ClassroomCoverPattern patternKey={meta.coverPattern} placement="end" className="pointer-events-none absolute inset-0 size-full opacity-20" />
      <div className="relative flex min-w-0 flex-col gap-2.5">
        <div className="flex min-w-0 flex-wrap items-start gap-x-5 gap-y-2.5">
          <div className="min-w-0 flex-1 basis-56">
            {badges && <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">{badges}</div>}
            <h1 className="break-words text-xl font-bold leading-snug sm:text-2xl">{title}</h1>
            {classroom && showClassroom && <p className={cn('mt-1 flex min-w-0 items-center gap-1.5 text-xs', muted)}>
              <ClassroomIcon iconKey={meta.iconKey} className="size-3.5 shrink-0" />
              <span className="min-w-0 break-words">{classroom.name}</span>
            </p>}
          </div>
          {(summary || actions) && <div className="flex max-w-full flex-wrap items-center gap-x-4 gap-y-2 self-center">
            {summary}
            {actions}
          </div>}
        </div>
        {details.length > 0 && <dl className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-current/15 pt-2">
          {details.map(({ label, value, icon: Icon }) => <div key={label} className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
            {Icon && <Icon aria-hidden="true" className="size-3.5 shrink-0" />}
            <dt className={cn('text-xs', muted)}>{label}</dt>
            <dd className="break-words text-xs font-semibold sm:text-sm">{value}</dd>
          </div>)}
        </dl>}
        {note && <p className={cn('text-xs leading-relaxed', muted)}>{note}</p>}
      </div>
    </Card>
  )
}
