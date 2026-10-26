'use client'

import { ExerciseIcon } from '@/lib/assignment-display'
import Link from 'next/link'
import { Pencil, Play, Trash2 } from 'lucide-react'
import { COVER_PRESETS } from '@/app/(app)/classrooms/_components/classroom-meta'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { PracticeExercise } from '@/lib/practice-exercises'
import type { PracticeExerciseSettings } from '@/lib/practice-exercise-settings'

/** Original notebook + stepping stones motif, drawn with the site's theme tokens. */
export function PracticeExercisePattern() {
  return <svg viewBox="0 0 180 110" fill="none" aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 h-full w-40 opacity-15">
    <path d="M58 13h63a9 9 0 0 1 9 9v65a9 9 0 0 1-9 9H58a9 9 0 0 1-9-9V22a9 9 0 0 1 9-9Z" fill="currentColor" opacity=".45" />
    <path d="M67 13v83M80 34h30M80 46h22M80 58h27" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <path d="m112 76 23-35 9 6-23 35-14 6 5-12Z" fill="currentColor" />
    <path d="M15 89c7-27 25-34 34-21s23 20 38 6 41-23 69-2" stroke="currentColor" strokeWidth="2" strokeDasharray="4 6" />
    <circle cx="19" cy="83" r="5" fill="currentColor" /><circle cx="45" cy="68" r="4" fill="currentColor" />
    <path d="m151 17 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1Z" fill="currentColor" />
  </svg>
}

export function PracticeExerciseCard({ exercise, settings, disabled, onEdit, onDelete, startHref }: {
  exercise: PracticeExercise
  settings: PracticeExerciseSettings
  disabled: boolean
  onEdit: () => void
  onDelete: () => void
  startHref: string
}) {
  const preset = COVER_PRESETS.find(color => color.id === settings.theme) ?? COVER_PRESETS[0]
  return <Card radius="md" padding="none" className="min-w-0 overflow-hidden">
    <div className={cn('relative flex items-start gap-2 border-b px-3 py-2', preset.surface, preset.text)}>
      <PracticeExercisePattern />
      <div className="relative flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="flex min-w-0 items-center gap-1.5"><ExerciseIcon className="size-4 shrink-0 text-work-exercise" aria-hidden="true" /><span className="truncate text-sm font-semibold" title={exercise.title}>{exercise.title}</span></span>
        <span className={cn('text-xs', preset.textMuted)}>{exercise.questionIds.length} ข้อ · {settings.questionsPerPage} ข้อต่อหน้า</span>
      </div>
    </div>
    <div className="flex items-center gap-2 px-3 py-1.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-xs text-muted-foreground">ตอบแล้ว {exercise.attemptedCount}/{exercise.questionIds.length}</p>
        <Progress className="w-full" value={exercise.attemptedCount / exercise.questionIds.length * 100} aria-label={`ความคืบหน้า ${exercise.title}`} />
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <div className="flex items-center gap-0">
          <Button variant="ghost" size="icon-sm" className="pointer-coarse:size-11" disabled={disabled} onClick={onEdit} aria-label={`แก้ไข ${exercise.title}`} title="แก้ไขแบบฝึกหัด"><Pencil aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" size="icon-sm" className="pointer-coarse:size-11" disabled={disabled} onClick={onDelete} aria-label={`ลบ ${exercise.title}`} title="ลบแบบฝึกหัด"><Trash2 aria-hidden="true" /></Button>
        </div>
        <Button size="sm" variant="workExercise" className="pointer-coarse:min-h-11" render={<Link href={startHref} />} aria-label={`เริ่มทำ ${exercise.title}`}><Play data-icon="inline-start" aria-hidden="true" />เริ่มทำ</Button>
      </div>
    </div>
  </Card>
}
