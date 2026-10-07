import type { AssignmentType, RetryScope } from '@/lib/types'
import { resolveNewAssignmentMathTools } from '@/lib/assignment-math-tools'

interface NewAssignmentTypeDefaults {
  maxAttempts: string
  retryScope: RetryScope
  calculatorEnabled: boolean
  scratchpadEnabled: boolean
}

export function firstSearchParam(
  value: string | readonly string[] | undefined,
): string | undefined {
  return typeof value === 'string' ? value : value?.[0]
}

export function newAssignmentTypeDefaults(
  assignmentType: AssignmentType,
): NewAssignmentTypeDefaults {
  return {
    maxAttempts: '1',
    retryScope: 'all',
    ...resolveNewAssignmentMathTools({ type: assignmentType }),
  }
}

export function assignmentCreationTitle(assignmentType: AssignmentType): string {
  return assignmentType === 'exam' ? 'สร้างข้อสอบ' : 'สร้างแบบฝึกหัด'
}

export function assignmentCreationHref(
  classroomId: string,
  assignmentType: AssignmentType,
): string {
  const searchParams = new URLSearchParams({
    classroom: classroomId,
    type: assignmentType,
  })

  return `/assignments/new?${searchParams.toString()}`
}

export function assignmentCreationHubHref(classroomId: string): string {
  const searchParams = new URLSearchParams({ classroom: classroomId })
  return `/assignments/new?${searchParams.toString()}`
}

export function assignmentReuseHref(classroomId: string): string {
  const searchParams = new URLSearchParams({
    classroom: classroomId,
    flow: 'reuse',
  })

  return `/assignments/new?${searchParams.toString()}`
}

export function assignmentCopyHref(
  classroomId: string,
  sourceAssignmentId: string,
): string {
  const searchParams = new URLSearchParams({
    classroom: classroomId,
    copy: sourceAssignmentId,
  })

  return `/assignments/new?${searchParams.toString()}`
}

export function assignmentCopyTitle(sourceTitle: string): string {
  return `${sourceTitle.trim()} (สำเนา)`
}

export function resolveAssignmentTypePreset(
  value: string | readonly string[] | undefined,
): AssignmentType | undefined {
  const candidate = firstSearchParam(value)
  return candidate === 'exercise' || candidate === 'exam' ? candidate : undefined
}
