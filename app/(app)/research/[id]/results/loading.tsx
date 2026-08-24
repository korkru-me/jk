import { Card } from '@/components/ui/card'

export default function ResearchResultsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="กำลังคำนวณผลวิเคราะห์">
      <div className="h-8 w-2/3 animate-pulse rounded-lg bg-muted" />
      <div className="h-10 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map(item => <Card key={item} className="h-24 animate-pulse bg-muted/60" />)}</div>
      <div className="grid gap-4 xl:grid-cols-2"><Card className="h-80 animate-pulse bg-muted/60" /><Card className="h-80 animate-pulse bg-muted/60" /></div>
    </div>
  )
}
