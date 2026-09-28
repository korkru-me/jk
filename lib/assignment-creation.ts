import type { AssignmentType, RetryScope } from '@/lib/types'

interface NewAssignmentTypeDefaults {
  maxAttempts: string
  retryScope: RetryScope
  mathToolsEnabled: boolean
}

export function firstSearchParam(
  value: string | readonly string[] | undefined,
): string | undefined {
  return typeof value === 'string' ? value : value?.[0]
}

export function newAssignmentTypeDefaults(
  assignmentType: AssignmentType,
): NewAssignmentTypeDefaults {
  const isExam = assignmentType === 'exam'
  return {
    maxAttempts: isExam ? '1' : '',
    retryScope: isExam ? 'all' : 'wrong_only',
    mathToolsEnabled: !isExam,
  }
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

export function resolveAssignmentTypePreset(
  value: string | readonly string[] | undefined,
): AssignmentType | undefined {
  const candidate = firstSearchParam(value)
  return candidate === 'exercise' || candidate === 'exam' ? candidate : undefined
}
