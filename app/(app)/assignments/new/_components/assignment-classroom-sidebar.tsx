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
import { ClassroomContextNavigation } from '@/app/(app)/classrooms/[id]/_components/classroom-context-sidebar'
import { ClassroomSettingsDialog } from '@/app/(app)/classrooms/[id]/_components/classroom-settings-dialog'

interface AssignmentClassroomSidebarProps {
  classroom: Classroom
  studentCount: number
  isOwner: boolean
}

export function AssignmentClassroomSidebar({
  classroom,
  studentCount,
  isOwner,
}: AssignmentClassroomSidebarProps) {
  const router = useRouter()
  const navigationItems = useMemo(
    () => classroomNavigationFor(classroom.classroom_type, true),
    [classroom.classroom_type],
  )
  const navigateTo = useCallback((nextItem: ClassroomNavigationKey) => {
    router.push(classroomNavigationPath(classroom.id, nextItem))
  }, [classroom.id, router])

  const renderContextualSidebar = useCallback((onNavigate?: () => void) => (
    <ClassroomContextNavigation
      classroom={classroom}
      backHref="/classrooms"
      navigationItems={navigationItems}
      assignmentCreationActive
      studentCount={studentCount}
      onNavigate={navigateTo}
      onClose={onNavigate}
      managementActions={isOwner
        ? <ClassroomSettingsDialog classroom={classroom} placement="sidebar" />
        : undefined}
    />
  ), [classroom, isOwner, navigateTo, navigationItems, studentCount])

  useContextualSidebar('/assignments/new', renderContextualSidebar)

  return null
}
