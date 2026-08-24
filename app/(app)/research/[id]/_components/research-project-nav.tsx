import Link from 'next/link'
import { cn } from '@/lib/utils'

export function ResearchProjectNav({
  projectId,
  active,
}: {
  projectId: string
  active: 'overview' | 'data' | 'results'
}) {
  const itemClass = 'border-b-2 px-3 py-2 text-sm font-semibold transition-colors'
  return (
    <nav className="flex gap-1 overflow-x-auto border-b" aria-label="ส่วนของโครงการวิจัย">
      <Link className={cn(itemClass, active === 'overview' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')} href={`/research/${projectId}`}>ภาพรวม</Link>
      <Link className={cn(itemClass, active === 'data' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')} href={`/research/${projectId}/data`}>ข้อมูลคะแนน</Link>
      <Link className={cn(itemClass, active === 'results' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')} href={`/research/${projectId}/results`}>ผลวิเคราะห์</Link>
    </nav>
  )
}
