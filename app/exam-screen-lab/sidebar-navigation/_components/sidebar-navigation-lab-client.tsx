'use client'

import { useCallback, type ReactNode } from 'react'
import Link from 'next/link'
import {
  ClearPendingSidebar, SidebarContextProvider, useContextualSidebar, useSidebarContext,
} from '@/components/layout/sidebar-context'
import { Sidebar } from '@/components/layout/sidebar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const SOURCE = '/exam-screen-lab/sidebar-navigation'
const TARGET = `${SOURCE}/assignment`
const CLASSROOM_ID = '00000000-0000-4000-8000-000000000099'

export function SidebarNavigationLabShell({ children }: { children: ReactNode }) {
  return (
    <SidebarContextProvider>
      <div className="flex min-h-dvh bg-background">
        <Sidebar role="teacher" fullName="ครูจำลอง" isOpen />
        <main className="min-w-0 flex-1 space-y-4 p-6">
          <p className="text-xs text-muted-foreground">ห้องทดลองแถบห้องเรียน · ข้อมูลจำลอง · ไม่อ่านหรือบันทึก Supabase</p>
          {children}
        </main>
      </div>
    </SidebarContextProvider>
  )
}

function LabSidebar({ ready = false }: { ready?: boolean }) {
  return (
    <nav className="space-y-3" aria-label="เมนูห้องเรียนจำลอง">
      <Card padding="md">
        <p className="font-semibold text-foreground">ฟิสิกส์ ห้องจำลอง</p>
        <p className="text-xs text-muted-foreground">ม.4 · 1/2569</p>
      </Card>
      <Button variant="navigation" className="w-full justify-start" render={<Link href={SOURCE} />}>
        งานที่มอบหมาย
      </Button>
      <p className="text-xs text-muted-foreground">{ready ? 'แถบหน้ามอบหมายงานพร้อมแล้ว' : 'แถบห้องเรียนเดิม'}</p>
    </nav>
  )
}

export function SidebarNavigationLabSource() {
  const render = useCallback(() => <LabSidebar />, [])
  useContextualSidebar(SOURCE, render, CLASSROOM_ID)
  const { prepareSidebarNavigation } = useSidebarContext()
  const reuseHref = `${TARGET}?classroom=${CLASSROOM_ID}`
  const plainHref = `${reuseHref}&plain=1`
  const mismatchHref = `${TARGET}?classroom=another-classroom`

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">ทดสอบคงแถบห้องเรียนระหว่างโหลด</h1>
      <Button render={<Link href={reuseHref} prefetch={false} onNavigate={() => prepareSidebarNavigation(reuseHref, CLASSROOM_ID)} />}>
        นำงานเดิมมาใช้ (จำลอง)
      </Button>
      <Button variant="outline" render={<Link href={plainHref} prefetch={false} onNavigate={() => prepareSidebarNavigation(plainHref, CLASSROOM_ID)} />}>
        ปลายทางไม่มีบริบท (จำลอง)
      </Button>
      <Button variant="outline" render={<Link href={mismatchHref} prefetch={false} onNavigate={() => prepareSidebarNavigation(mismatchHref, CLASSROOM_ID)} />}>
        ห้องอื่นต้องไม่รับแถบเดิม
      </Button>
    </div>
  )
}

function ReadySidebar() {
  const render = useCallback(() => <LabSidebar ready />, [])
  useContextualSidebar(TARGET, render, CLASSROOM_ID)
  return null
}

export function SidebarNavigationLabTarget({ classroomId, plain }: { classroomId?: string; plain: boolean }) {
  return (
    <div className="space-y-4">
      {!plain && classroomId === CLASSROOM_ID ? <ReadySidebar /> : <ClearPendingSidebar />}
      <h1 className="text-xl font-bold">หน้ามอบหมายงานโหลดเสร็จแล้ว (จำลอง)</h1>
      <Button variant="outline" render={<Link href={SOURCE} />}>
        กลับห้องทดลอง
      </Button>
    </div>
  )
}
