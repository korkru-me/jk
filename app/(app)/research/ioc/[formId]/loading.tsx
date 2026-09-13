import { Card } from '@/components/ui/card'

export default function IocFormLoading() {
  return (
    <div className="space-y-6" aria-label="กำลังโหลดฟอร์ม IOC" aria-busy="true">
      <div className="space-y-2">
        <div className="h-8 w-72 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex gap-2">
        {[0, 1, 2, 3].map(item => (
          <div key={item} className="h-9 w-32 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <Card padding="lg">
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </Card>
    </div>
  )
}
