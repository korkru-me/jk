import { Card } from '@/components/ui/card'

export default function IocFormsLoading() {
  return (
    <div className="space-y-6" aria-label="กำลังโหลดฟอร์ม IOC" aria-busy="true">
      <div className="space-y-2">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-muted" />
      </div>
      <Card padding="md">
        <div className="h-12 animate-pulse rounded-xl bg-muted" />
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map(item => (
          <Card key={item} padding="lg">
            <div className="h-14 animate-pulse rounded-xl bg-muted" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map(item => (
          <Card key={item} padding="lg">
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
          </Card>
        ))}
      </div>
    </div>
  )
}
