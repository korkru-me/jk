'use client'

import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { Classroom } from '@/lib/types'
import {
  classroomNavigationFor,
  classroomNavigationPath,
  type ClassroomNavigationKey,
} from '@/lib/classroom-navigation'
import { useContextualSidebar } from '@/components/layout/sidebar-context'
import { confirmPageExit } from '@/components/layout/confirm-page-exit'
import { ClassroomContextNavigation } from '@/app/(app)/classrooms/[id]/_components/classroom-context-sidebar'
import { ClassroomSettingsDialog } from '@/app/(app)/classrooms/[id]/_components/classroom-settings-dialog'

interface AssignmentClassroomSidebarProps {
  classroom: Classroom
  switchableClassrooms: Array<Pick<Classroom, 'id' | 'name' | 'description'>>
  studentCount: number
  isOwner: boolean
}

export function AssignmentClassroomSidebar({
  classroom,
  switchableClassrooms,
  studentCount,
  isOwner,
}: AssignmentClassroomSidebarProps) {
  const router = useRouter()
  const navigationItems = useMemo(
    () => classroomNavigationFor(classroom.classroom_type, true),
    [classroom.classroom_type],
  )
  const navigateTo = useCallback(async (classroomId: string, item: ClassroomNavigationKey) => {
    if (await confirmPageExit()) router.push(classroomNavigationPath(classroomId, item))
  }, [router])

  const renderContextualSidebar = useCallback((onNavigate?: () => void) => (
    <ClassroomContextNavigation
      classroom={classroom}
      switchableClassrooms={switchableClassrooms}
      backHref="/classrooms"
      navigationItems={navigationItems}
      assignmentCreationActive
      studentCount={studentCount}
      onNavigate={item => { void navigateTo(classroom.id, item) }}
      onSwitchClassroom={id => { void navigateTo(id, 'overview') }}
      onClose={onNavigate}
      managementActions={isOwner
        ? <ClassroomSettingsDialog classroom={classroom} placement="sidebar" />
        : undefined}
    />
  ), [classroom, isOwner, navigateTo, navigationItems, studentCount, switchableClassrooms])

  useContextualSidebar('/assignments/new', renderContextualSidebar, classroom.id)

  return null
}
