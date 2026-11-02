'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { StudentClassroomOption } from '@/lib/student-classroom-navigation.server'
import { classroomNavigationPath, type ClassroomNavigationItem, type ClassroomNavigationKey } from '@/lib/classroom-navigation'
import { useContextualSidebar } from '@/components/layout/sidebar-context'
import { ClassroomContextNavigation } from './classroom-context-sidebar'

const SUBJECT_ITEMS = [
  { key: 'overview', label: 'ภาพรวม' },
  { key: 'assignments', label: 'งานที่มอบหมาย' },
] as const satisfies readonly ClassroomNavigationItem[]
const HOMEROOM_ITEMS = [SUBJECT_ITEMS[0]]

export function StudentClassroomSidebar({ classroom, classrooms, backHref = '/dashboard', classroomHrefs }: {
  classroom: StudentClassroomOption
  classrooms: StudentClassroomOption[]
  backHref?: string
  /** Synthetic fixtures keep navigation inside their local routes. */
  classroomHrefs?: Record<string, string>
}) {
  const pathname = usePathname()
  const params = useSearchParams()
  const router = useRouter()
  const items = classroom.classroom_type === 'homeroom' ? HOMEROOM_ITEMS : SUBJECT_ITEMS
  const activeItem = classroom.classroom_type === 'subject' && params.get('tab') === 'assignments' ? 'assignments' : 'overview'
  const navigate = useCallback((item: ClassroomNavigationKey) => {
    const url = new URL(window.location.href)
    if (item === 'assignments') url.searchParams.set('tab', 'assignments')
    else url.searchParams.delete('tab')
    window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])
  const switchClassroom = useCallback((id: string) => {
    if (!classrooms.some(room => room.id === id)) return
    router.push(classroomHrefs?.[id] ?? classroomNavigationPath(id, 'overview'))
  }, [classrooms, classroomHrefs, router])
  const render = useCallback((onClose?: () => void) => (
    <ClassroomContextNavigation classroom={classroom} switchableClassrooms={classrooms}
      backHref={backHref} overviewHref={classroomHrefs?.[classroom.id]}
      navigationItems={items} activeItem={activeItem} showAssignmentCreation={false}
      onNavigate={navigate} onSwitchClassroom={switchClassroom} onClose={onClose} />
  ), [classroom, classrooms, backHref, classroomHrefs, items, activeItem, navigate, switchClassroom])
  useContextualSidebar(pathname, render, classroom.id)
  return null
}
