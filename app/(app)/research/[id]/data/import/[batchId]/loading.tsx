import { Card } from '@/components/ui/card'

export default function ResearchExcelPreviewLoading() {
  return <div className="space-y-6" aria-busy="true"><div className="h-20 animate-pulse rounded-xl bg-muted" /><div className="h-16 animate-pulse rounded-xl bg-muted" /><div className="grid gap-4 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Card key={index} className="h-28 animate-pulse bg-muted" />)}</div><Card className="h-96 animate-pulse bg-muted" /></div>
}
