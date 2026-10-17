import { LoaderCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'

export default function LoadingAssignmentEntry() {
  return <Card padding="md" className="mx-auto mt-6 flex max-w-md items-center gap-3" role="status" aria-live="polite">
    <LoaderCircle className="size-5 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold">กำลังเปิดงาน</p>
      <p className="text-xs text-muted-foreground">กรุณารอสักครู่</p>
    </div>
  </Card>
}
