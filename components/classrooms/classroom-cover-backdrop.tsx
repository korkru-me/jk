import { cn } from '@/lib/utils'
import type { CoverPreset } from '@/app/(app)/classrooms/_components/classroom-meta'

export function ClassroomCoverBackdrop({
  imageUrl,
  cover,
  className,
}: {
  imageUrl: string | null
  cover: CoverPreset | null
  className?: string
}) {
  if (!imageUrl) return null

  return (
    <div className={cn('pointer-events-none absolute inset-0', className)} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="" className="size-full object-cover" />
      {cover && <div className={cn('absolute inset-0 opacity-35', cover.solid)} />}
      <div className="absolute inset-0 bg-overlay/60" />
    </div>
  )
}
