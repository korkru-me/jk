import type { ReactNode } from 'react'
import { ChartNoAxesColumn, Timer, Users } from 'lucide-react'
import { ClassroomCoverPattern } from '@/components/classrooms/classroom-cover-pattern'
import { Card } from '@/components/ui/card'
import type { GradingWorkspaceData } from '@/lib/grading-workspace'

export type GradingWorkspaceHeaderData = Pick<GradingWorkspaceData,
  'assignment' | 'students' | 'inProgressCount' | 'pendingFinalizationCount'
>

function formatNumber(value: number) {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 1 })
}

export function GradingWorkspaceHeader({ data, title = 'ตรวจให้คะแนน', actions }: {
  data: GradingWorkspaceHeaderData
  title?: string
  actions?: ReactNode
}) {
  const submitted = data.students.filter(student => student.submissionId != null
    && (student.status == null || student.status === 'submitted' || student.status === 'graded'))
  const scored = submitted.filter(student => student.score != null && student.maxScore > 0)
  const commonMax = scored[0]?.maxScore
  const mixedMax = scored.some(student => student.maxScore !== commonMax)
  const average = scored.length === 0 ? '—' : mixedMax
    ? `${formatNumber(scored.reduce((sum, student) => sum + student.score! / student.maxScore * 100, 0) / scored.length)}%`
    : `${formatNumber(scored.reduce((sum, student) => sum + student.score!, 0) / scored.length)}/${formatNumber(commonMax!)}`
  const streak = data.assignment.completionRule === 'streak'
  const middleLabel = streak ? 'ผ่านเกณฑ์' : 'คะแนนเฉลี่ย'
  const middleValue = streak
    ? `${formatNumber(submitted.filter(student => student.streakReached).length)}/${formatNumber(submitted.length)} คน`
    : average

  return (
    <Card padding="sm" className="@container/grading-header relative isolate overflow-hidden border-primary/20 bg-primary/5" data-grading-workspace-header>
      <ClassroomCoverPattern patternKey="korkru-deer" placement="end" className="pointer-events-none absolute inset-0 size-full text-primary opacity-15" />
      <div className="relative flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1 pr-12">
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {data.assignment.title}{data.assignment.classroomName && ` · ${data.assignment.classroomName}`}
          </p>
          <ul aria-label="สรุปการตรวจให้คะแนน" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground/75">
            <li className="flex items-center gap-1.5"><Users aria-hidden="true" className="size-3.5 text-primary" />ส่งแล้ว <strong className="font-semibold text-foreground">{formatNumber(submitted.length)} คน</strong></li>
            <li className="flex items-center gap-1.5"><ChartNoAxesColumn aria-hidden="true" className="size-3.5 text-primary" />{middleLabel} <strong className="font-semibold text-foreground">{middleValue}</strong></li>
            <li className="flex items-center gap-1.5"><Timer aria-hidden="true" className="size-3.5 text-primary" />กำลังทำ <strong className="font-semibold text-foreground">{formatNumber(data.inProgressCount)} คน</strong></li>
          </ul>
          {data.pendingFinalizationCount > 0 && <p className="text-xs text-muted-foreground">ปิดรอบแล้ว รอระบบสรุปผล {formatNumber(data.pendingFinalizationCount)} รอบ</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </Card>
  )
}
