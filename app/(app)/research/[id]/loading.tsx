import { Card } from '@/components/ui/card'

export default function ResearchProjectLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="กำลังโหลดโครงการวิจัย">
      <div className="h-8 w-3/4 animate-pulse rounded-lg bg-muted" />
      <div className="h-10 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map(item => <Card key={item} className="h-28 animate-pulse bg-muted/60" />)}
      </div>
      <Card className="h-72 animate-pulse bg-muted/60" />
    </div>
  )
}
