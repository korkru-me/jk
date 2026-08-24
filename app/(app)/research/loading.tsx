import { Card } from '@/components/ui/card'

export default function ResearchLoading() {
  return (
    <div className="space-y-6" aria-label="กำลังโหลดวิจัยการศึกษา" aria-busy="true">
      <div className="space-y-2">
        <div className="h-8 w-52 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-full max-w-md animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map(item => (
          <Card key={item} padding="lg">
            <div className="h-14 animate-pulse rounded-xl bg-muted" />
          </Card>
        ))}
      </div>
      <Card padding="2xl">
        <div className="mx-auto h-24 max-w-md animate-pulse rounded-2xl bg-muted" />
      </Card>
    </div>
  )
}
