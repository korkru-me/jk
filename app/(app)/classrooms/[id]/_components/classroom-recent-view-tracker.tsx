'use client'

import { startTransition, useEffect } from 'react'
import { recordClassroomRecentView } from '@/lib/actions/classrooms'

export function ClassroomRecentViewTracker({ classroomId }: { classroomId: string }) {
  useEffect(() => {
    startTransition(() => {
      void recordClassroomRecentView(classroomId)
    })
  }, [classroomId])

  return null
}
