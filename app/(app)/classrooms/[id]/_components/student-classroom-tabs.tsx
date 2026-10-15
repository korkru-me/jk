'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { classroomWorkAlertCount } from '@/lib/student-classroom-work'
import type { AssignmentCategory } from '@/lib/assignment-categories'
import type { StudentAssignmentRow } from './assignment-status'
import { AssignmentList } from './assignment-list'

export function StudentClassroomTabs({ assignments, categories, classroomDescription, classroomName, backHref,
  assignmentHrefs, initialNow, liveTime, header, announcements, practiceLibraries, calendar,
}: {
  assignments: StudentAssignmentRow[]
  categories: AssignmentCategory[]
  classroomDescription: string | null
  classroomName: string
  backHref: string
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
  const alertCount = classroomWorkAlertCount(assignments, now)

  useEffect(() => {
    if (!liveTime) return
    const tick = () => setNow(Date.now())
    tick()
    const timer = setInterval(tick, 60_000)
    let refreshedAt = 0
    // A finished task in another tab, or a bfcache return, must read current
    // completion from the server. No local "read/dismissed" flag clears alerts.
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
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-1 gap-y-1 @min-[34rem]/subject:gap-x-3">
        <Link href={backHref} aria-label="ห้องเรียนของฉัน" title="ห้องเรียนของฉัน" className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground @min-[34rem]/subject:min-w-0">
          <ChevronLeft className="size-4" aria-hidden="true" /><span className="hidden @min-[34rem]/subject:inline">ห้องเรียนของฉัน</span>
        </Link>
        <TabsList aria-label="หน้าห้องเรียน" className="max-w-full p-0 group-data-horizontal/tabs:h-auto">
          <TabsTrigger value="overview" className="min-h-[44px] px-1.5 @min-[34rem]/subject:px-3">ภาพรวม</TabsTrigger>
          <TabsTrigger value="assignments" className="min-h-[44px] px-1.5 @min-[34rem]/subject:px-3" aria-label={alertCount ? `งานที่มอบหมาย · มีงานใกล้กำหนดหรือเลยกำหนด ${alertCount} งาน` : 'งานที่มอบหมาย'}>
            งานที่มอบหมาย
            {alertCount > 0 && <Badge variant="statusDestructive" className="min-w-5 px-1.5 tabular-nums" aria-hidden="true" data-classroom-work-alert-count>{alertCount}</Badge>}
          </TabsTrigger>
        </TabsList>
      </div>
      {/* One panel/list instance keeps the student's filters when switching views. */}
      <TabsContent value={tab} className="min-w-0">
        <div className="grid items-start gap-4 @min-[46rem]/subject:grid-cols-[minmax(0,1fr)_14rem] @min-[64rem]/subject:grid-cols-[minmax(0,1fr)_16rem]" data-student-subject-grid>
          <div className="flex min-w-0 flex-col gap-4" data-student-subject-content>
            {header}
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
          </div>
          <aside aria-label={`ปฏิทินงาน ${classroomName}`} className="min-w-0 self-start @min-[46rem]/subject:sticky @min-[46rem]/subject:top-0" data-sticky-subject-calendar>
            {calendar}
          </aside>
        </div>
      </TabsContent>
    </Tabs>
  )
}
