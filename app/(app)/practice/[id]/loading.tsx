import { Card } from '@/components/ui/card'
import { LoaderCircle } from 'lucide-react'

export default function PracticeLoading() {
  return (
    <Card radius="md" role="status" aria-busy="true" className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <span>กำลังเปิดคลังฝึก…</span>
    </Card>
  )
}
