import { Badge } from '@/components/ui/badge'

export function StagingIndicator() {
  return (
    <div
      aria-label="ระบบทดสอบ Staging"
      className="pointer-events-none fixed left-1/2 top-2 z-[110] -translate-x-1/2"
      role="status"
    >
      <Badge className="h-auto border-warning bg-warning px-3 py-1 text-warning-foreground shadow-lg">
        STAGING · ระบบทดสอบ
      </Badge>
    </div>
  )
}
