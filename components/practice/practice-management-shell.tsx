'use client'

import { createContext, useCallback, useContext, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Activity, BookOpenCheck, ChevronLeft, LayoutDashboard, Pencil, Play, Square, Users } from 'lucide-react'
import { toast } from 'sonner'
import { closePracticeLibrary, publishPracticeLibrary } from '@/app/(app)/practice/_actions'
import { ClassroomWorkHeader } from '@/components/assignments/classroom-work-header'
import { SidebarButton } from '@/components/layout/sidebar-display'
import { useContextualSidebar } from '@/components/layout/sidebar-context'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { classroomNavigationPath } from '@/lib/classroom-navigation'
import { practiceManagementHref, type PracticeManagementSection, type PracticeManagementSummary } from '@/lib/practice-management'

const STATUS = {
  draft: { label: 'ฉบับร่าง', variant: 'secondary' },
  published: { label: 'เผยแพร่แล้ว', variant: 'statusSuccess' },
  closed: { label: 'หยุดเผยแพร่', variant: 'statusDestructive' },
} as const

const FormStateContext = createContext<((dirty: boolean) => void) | null>(null)
export function usePracticeManagementFormState() { return useContext(FormStateContext) }

export function PracticeManagementShell({ summary, section, children, hrefBase, actions }: {
  summary: PracticeManagementSummary
  section: PracticeManagementSection
  children: ReactNode
  /** Guarded previews use their own URLs/actions, never live mutations. */
  hrefBase?: string
  actions?: { publish: typeof publishPracticeLibrary; close: typeof closePracticeLibrary }
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [dirty, setDirty] = useState(false)
  const lifecycle = useCallback(() => {
    startTransition(async () => {
      const closing = summary.status === 'published'
      const result = await (closing ? actions?.close ?? closePracticeLibrary : actions?.publish ?? publishPracticeLibrary)({ libraryId: summary.id })
      if (!result.ok) { toast.error(result.error); return }
      toast.success(closing ? 'หยุดเผยแพร่คลังฝึกแล้ว' : 'เผยแพร่คลังฝึกแล้ว')
      router.refresh()
    })
  }, [actions, router, summary.id, summary.status])
  const renderSidebar = useCallback((onNavigate?: () => void) => <PracticeManagementNavigation
    summary={summary} section={section} hrefBase={hrefBase} pending={pending || dirty}
    onLifecycle={lifecycle} onNavigate={onNavigate} />,
  [dirty, hrefBase, lifecycle, pending, section, summary])
  useContextualSidebar(pathname, renderSidebar)

  return <FormStateContext.Provider value={setDirty}>
    <div className="@container/practice-management flex w-full min-w-0 flex-col gap-3" data-practice-management>
      <ClassroomWorkHeader kind="practice" title={summary.title} classroom={summary.classroom} showClassroom={false}
        badges={<><Badge variant={STATUS[summary.status].variant}>{STATUS[summary.status].label}</Badge><Badge variant="outline"><BookOpenCheck />คลังฝึก</Badge></>} />
      {children}
    </div>
  </FormStateContext.Provider>
}

function PracticeManagementNavigation({ summary, section, hrefBase, pending, onLifecycle, onNavigate }: {
  summary: PracticeManagementSummary
  section: PracticeManagementSection
  hrefBase?: string
  pending: boolean
  onLifecycle: () => void
  onNavigate?: () => void
}) {
  return <nav aria-label="จัดการคลังฝึก" className="flex min-w-0 flex-col gap-3 [&_[data-slot=button]]:min-h-[44px]">
    <SidebarButton label="กลับไปงานที่มอบหมาย" variant="ghost" render={<Link href={classroomNavigationPath(summary.classroom.id, 'assignments')} onClick={onNavigate} />}><ChevronLeft data-icon="inline-start" /></SidebarButton>
    <Separator />
    <div className="flex flex-col gap-1.5">
      <SidebarButton label="ภาพรวม" variant={section === 'overview' ? 'navigation' : 'ghost'} aria-current={section === 'overview' ? 'page' : undefined}
        render={<Link href={practiceManagementHref(summary.id, 'overview', hrefBase)} onClick={onNavigate} />}><Activity data-icon="inline-start" /></SidebarButton>
      <SidebarButton label={summary.status === 'draft' ? 'เผยแพร่' : summary.status === 'closed' ? 'หยุดเผยแพร่แล้ว' : 'หยุดเผยแพร่'} variant={summary.status === 'published' ? 'destructive' : 'outline'}
        disabled={pending || summary.status === 'closed' || (summary.status === 'draft' && summary.questionCount === 0)} onClick={() => { onLifecycle(); onNavigate?.() }}>{summary.status === 'draft' ? <Play data-icon="inline-start" /> : <Square data-icon="inline-start" />}</SidebarButton>
      <SidebarButton label="ตั้งค่าคลังฝึก" variant={section === 'settings' ? 'navigation' : 'ghost'} aria-current={section === 'settings' ? 'page' : undefined}
        render={<Link href={practiceManagementHref(summary.id, 'settings', hrefBase)} onClick={onNavigate} />}><Pencil data-icon="inline-start" /></SidebarButton>
      <SidebarButton label="ข้อมูลการฝึกฝน" variant={section === 'progress' ? 'navigation' : 'ghost'} aria-current={section === 'progress' ? 'page' : undefined}
        render={<Link href={practiceManagementHref(summary.id, 'progress', hrefBase)} onClick={onNavigate} />}><Users data-icon="inline-start" /></SidebarButton>
    </div>
    <Separator />
    <SidebarButton label="เมนูหลัก" variant="ghost" render={<Link href="/dashboard" onClick={onNavigate} />}><LayoutDashboard data-icon="inline-start" /></SidebarButton>
  </nav>
}
