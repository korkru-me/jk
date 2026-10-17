'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { classroomOverdueWork } from '@/lib/student-classroom-work'
import { formatThaiDateTime } from '@/lib/thai-time'
import type { AssignmentCategory } from '@/lib/assignment-categories'
import type { StudentAssignmentRow } from './assignment-status'
import { AssignmentList } from './assignment-list'

export function StudentClassroomTabs({ assignments, categories, classroomDescription, classroomName,
  assignmentHrefs, initialNow, liveTime, header, announcements, practiceLibraries, calendar,
}: {
  assignments: StudentAssignmentRow[]
  categories: AssignmentCategory[]
  classroomDescription: string | null
  classroomName: string
  assignmentHrefs?: Record<string, string>
  initialNow: string
  liveTime: boolean
  header: ReactNode
  announcements: ReactNode
  practiceLibraries: ReactNode
  calendar: ReactNode
}) {
  const params = useSearchParams()
  const router = useRouter()
  const tab = params.get('tab') === 'assignments' ? 'assignments' : 'overview'
  const [now, setNow] = useState(() => Date.parse(initialNow))
  const overdueWork = classroomOverdueWork(assignments, now)
  const alertCount = overdueWork.length
  const overdueTabRef = useRef<HTMLButtonElement>(null)
  const overdueListRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!liveTime) return
    const tick = () => setNow(Date.now())
    tick()
    const timer = setInterval(tick, 60_000)
    let refreshedAt = 0
    // A finished task in another tab, or a bfcache return, must read current
    // submissions from the server. No local "read/dismissed" flag clears alerts.
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      tick()
      if (Date.now() - refreshedAt < 5_000) return
      refreshedAt = Date.now()
      router.refresh()
    }
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) refresh() }
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [liveTime, router])

  return (
    <Tabs value={tab} onValueChange={value => {
      if ((value !== 'overview' && value !== 'assignments') || value === tab) return
      const url = new URL(window.location.href)
      if (value === 'overview') url.searchParams.delete('tab')
      else url.searchParams.set('tab', value)
      window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`)
    }} className="min-w-0 gap-3" data-student-classroom-tabs>
      <div className="grid items-start gap-4 @min-[46rem]/subject:grid-cols-[minmax(0,1fr)_14rem] @min-[64rem]/subject:grid-cols-[minmax(0,1fr)_16rem]" data-student-subject-grid>
        <div className="flex min-w-0 flex-col gap-3" data-student-subject-content>
          {header}
          <TabsList aria-label="หน้าห้องเรียน" className="max-w-full self-start p-0 group-data-horizontal/tabs:h-auto">
            <TabsTrigger value="overview" className="min-h-[44px] px-1.5 @min-[34rem]/subject:px-3">ภาพรวม</TabsTrigger>
            <Tooltip>
              <TooltipTrigger render={<TabsTrigger ref={overdueTabRef} value="assignments" className="min-h-[44px] px-1.5 @min-[34rem]/subject:px-3" />} aria-label={alertCount ? `งานที่มอบหมาย · มีงานเลยกำหนดส่งที่ยังไม่ได้ส่ง ${alertCount} งาน` : 'งานที่มอบหมาย · ไม่มีงานค้างส่งที่เลยกำหนด'} aria-description={alertCount ? 'กดลูกศรลงเพื่อเลื่อนอ่านรายการงานค้างส่ง กด Escape เพื่อกลับไปที่แท็บ' : undefined} onKeyDown={event => {
                if (event.key === 'ArrowDown' && overdueListRef.current) {
                  event.preventDefault()
                  overdueListRef.current.focus()
                }
              }}>
                งานที่มอบหมาย
                {alertCount > 0 && <Badge variant="statusDestructive" className="min-w-5 px-1.5 tabular-nums" aria-hidden="true" data-classroom-work-alert-count>{alertCount}</Badge>}
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="block w-[min(22rem,calc(100vw-2rem))] max-w-none" data-classroom-overdue-tooltip>
                {alertCount > 0 ? <>
                  <p className="font-semibold">เลยกำหนดส่งและยังไม่ได้ส่ง {alertCount} งาน</p>
                  <ul ref={overdueListRef} tabIndex={0} aria-label="งานที่เลยกำหนดส่งและยังไม่ได้ส่ง" onKeyDown={event => {
                    if (event.key === 'Escape') overdueTabRef.current?.focus()
                    else event.stopPropagation()
                  }} className="mt-1 flex max-h-[min(13rem,calc(var(--available-height)-3rem))] flex-col gap-1.5 overflow-y-auto overscroll-contain rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-background/70">
                    {overdueWork.map(assignment => <li key={assignment.id}>
                      <p className="break-words font-medium">{assignment.title}</p>
                      <p className="mt-0.5 opacity-80">กำหนดส่ง {assignment.end_at && formatThaiDateTime(assignment.end_at)}</p>
                    </li>)}
                  </ul>
                </> : <p>ไม่มีงานค้างส่งที่เลยกำหนด</p>}
              </TooltipContent>
            </Tooltip>
          </TabsList>
          {/* One panel/list instance keeps the student's filters when switching views. */}
          <TabsContent value={tab} className="flex min-w-0 flex-col gap-4">
            {tab === 'overview' && announcements}
            {practiceLibraries}
            <section aria-labelledby="classroom-work-heading" className="flex min-w-0 flex-col gap-2.5">
              <h2 data-classroom-heading id="classroom-work-heading" className="font-semibold">งานที่มอบหมายในห้องนี้</h2>
              {assignments.length === 0 ? (
                <Card edge="dashed" padding="md" className="text-center">
                  <p className="font-semibold">ยังไม่มีงานที่มอบหมาย</p>
                  <p className="mt-1 text-sm text-muted-foreground">ครูจะมอบหมายแบบฝึกหัดหรือข้อสอบให้ที่นี่</p>
                </Card>
              ) : <AssignmentList assignments={assignments} categories={categories} classroomDescription={classroomDescription} assignmentHrefs={assignmentHrefs} now={now} />}
            </section>
          </TabsContent>
        </div>
        <aside aria-label={`ปฏิทินงาน ${classroomName}`} className="min-w-0 self-start @min-[46rem]/subject:sticky @min-[46rem]/subject:top-0" data-sticky-subject-calendar>
          {calendar}
        </aside>
      </div>
    </Tabs>
  )
}
