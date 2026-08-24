import { Card } from '@/components/ui/card'

export default function NewResearchProjectLoading() {
  return (
    <div className="space-y-6" aria-label="กำลังโหลดหน้าสร้างโครงการวิจัย" aria-busy="true">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="h-12 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card padding="xl"><div className="h-96 animate-pulse rounded-xl bg-muted" /></Card>
        <Card padding="lg"><div className="h-56 animate-pulse rounded-xl bg-muted" /></Card>
      </div>
    </div>
  )
}
