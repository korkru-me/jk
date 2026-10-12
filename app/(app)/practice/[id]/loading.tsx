import { Card } from '@/components/ui/card'

export default function PracticeLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3" aria-busy="true" aria-label="กำลังโหลดคลังฝึก">
      <div className="h-[64px] rounded-xl bg-muted/60" />
      <Card padding="md" className="flex flex-col gap-2">
        <div className="h-8 rounded-lg bg-muted/60" />
        <div className="h-5 w-2/3 rounded-lg bg-muted/60" />
      </Card>
      <Card className="divide-y divide-border">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-[64px] bg-muted/30" />
        ))}
      </Card>
    </div>
  )
}
