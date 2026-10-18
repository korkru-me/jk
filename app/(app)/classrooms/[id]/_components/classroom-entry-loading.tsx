'use client'

import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { Classroom } from '@/lib/types'
import { classroomNavigationFor, classroomNavigationHref, type ClassroomNavigationKey } from '@/lib/classroom-navigation'
import { useContextualSidebar } from '@/components/layout/sidebar-context'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ClassroomTheme } from '@/components/classrooms/classroom-theme'
import { ClassroomIcon } from '@/components/classrooms/classroom-icon'
import { ClassroomCoverPattern } from '@/components/classrooms/classroom-cover-pattern'
import { parseDescription, displayDescription } from '@/app/(app)/classrooms/_components/classroom-meta'
import { ClassroomContextNavigation } from './classroom-context-sidebar'

/** Rendered only after the route has verified the exact classroom relationship. */
export function ClassroomEntryLoading({ classroom, canManage, initialNavigationItem, backHref, navigationPathname }: {
  classroom: Pick<Classroom, 'id' | 'name' | 'description' | 'classroom_type'>
  canManage: boolean
  initialNavigationItem: ClassroomNavigationKey
  backHref: string
  /** Synthetic streaming fixtures stay inside their local route. */
  navigationPathname?: string
}) {
  const router = useRouter()
  const path = navigationPathname ?? `/classrooms/${classroom.id}`
  const items = useMemo(() => classroomNavigationFor(classroom.classroom_type, canManage), [classroom.classroom_type, canManage])
  const navigate = useCallback((item: ClassroomNavigationKey) => {
    router.push(classroomNavigationHref(window.location.href, item), { scroll: false })
  }, [router])
  const render = useCallback((close?: () => void) => <ClassroomContextNavigation
    classroom={classroom} backHref={backHref} overviewHref={path} navigationItems={items}
    activeItem={initialNavigationItem} onNavigate={navigate} onClose={close}
  />, [classroom, backHref, path, items, initialNavigationItem, navigate])
  useContextualSidebar(path, render, classroom.id)
  const meta = parseDescription(classroom.description)
  return <ClassroomTheme cover={meta.cover} className="flex min-w-0 flex-col gap-3" data-classroom-entry-loading>
    <Card padding="sm" className="relative isolate overflow-hidden border-primary/20 bg-primary/5">
      <ClassroomCoverPattern patternKey={meta.coverPattern} placement="end" className="pointer-events-none absolute inset-0 size-full text-primary opacity-15" />
      <div className="relative flex min-w-0 flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-bold"><ClassroomIcon iconKey={meta.iconKey} className="size-5 shrink-0" />{classroom.name}</h1>
        {displayDescription(classroom.description) && <p className="text-xs text-muted-foreground">{displayDescription(classroom.description)}</p>}
        <p role="status" className="text-xs text-muted-foreground">กำลังโหลดข้อมูลห้องเรียน…</p>
      </div>
    </Card>
    <Card padding="sm" aria-hidden="true" className="flex flex-col gap-2"><Skeleton className="h-5 w-36" /><Skeleton className="h-12 w-full" /><Skeleton className="h-5 w-2/3" /></Card>
  </ClassroomTheme>
}
