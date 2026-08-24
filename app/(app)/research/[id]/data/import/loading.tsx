import { Card } from '@/components/ui/card'

export default function ResearchExcelImportLoading() {
  return <div className="space-y-6" aria-busy="true"><div className="h-20 animate-pulse rounded-xl bg-muted" /><div className="h-16 animate-pulse rounded-xl bg-muted" /><div className="grid gap-6 lg:grid-cols-2"><Card className="h-80 animate-pulse bg-muted" /><Card className="h-80 animate-pulse bg-muted" /></div></div>
}
