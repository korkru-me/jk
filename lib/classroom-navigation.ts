export type ClassroomNavigationKey =
  | 'overview'
  | 'students'
  | 'assignments'
  | 'scores'
  | 'ability'
  | 'homeroom'
  | 'groups'
  | 'coteachers'

export interface ClassroomNavigationItem {
  key: ClassroomNavigationKey
  label: string
  managerOnly?: boolean
}

export const SUBJECT_CLASSROOM_NAVIGATION = [
  { key: 'overview', label: 'ภาพรวม' },
  { key: 'assignments', label: 'งานที่มอบหมาย', managerOnly: true },
  { key: 'scores', label: 'คะแนนและการส่งงาน', managerOnly: true },
  { key: 'ability', label: 'ศักยภาพผู้เรียน', managerOnly: true },
  { key: 'students', label: 'นักเรียนและกลุ่ม' },
  { key: 'coteachers', label: 'ผู้ช่วยสอน' },
] as const satisfies readonly ClassroomNavigationItem[]

export const HOMEROOM_CLASSROOM_NAVIGATION = [
  { key: 'overview', label: 'ภาพรวม' },
  { key: 'homeroom', label: 'การบ้านนักเรียน', managerOnly: true },
  { key: 'students', label: 'นักเรียน' },
  { key: 'coteachers', label: 'ผู้ช่วยสอน' },
] as const satisfies readonly ClassroomNavigationItem[]

export function classroomNavigationFor(
  classroomType: 'subject' | 'homeroom',
  canManage: boolean,
): readonly ClassroomNavigationItem[] {
  const items = classroomType === 'homeroom'
    ? HOMEROOM_CLASSROOM_NAVIGATION
    : SUBJECT_CLASSROOM_NAVIGATION

  return items.filter(item => !('managerOnly' in item) || !item.managerOnly || canManage)
}

export function resolveClassroomNavigationKey(
  value: string | string[] | null | undefined,
  availableItems: readonly ClassroomNavigationItem[],
): ClassroomNavigationKey {
  const candidate = Array.isArray(value) ? value[0] : value
  // `groups` used to be a separate sidebar page. Keep old bookmarks useful
  // after merging it into the students page's internal tabs.
  if (candidate === 'groups' && availableItems.some(item => item.key === 'students')) return 'students'
  const match = availableItems.find(item => item.key === candidate)
  return match?.key ?? 'overview'
}

export function classroomNavigationHref(
  currentHref: string,
  nextItem: ClassroomNavigationKey,
): string {
  const url = new URL(currentHref)
  if (nextItem === 'overview') url.searchParams.delete('view')
  else url.searchParams.set('view', nextItem)
  return `${url.pathname}${url.search}${url.hash}`
}

export function classroomNavigationPath(
  classroomId: string,
  nextItem: ClassroomNavigationKey,
): string {
  const pathname = `/classrooms/${encodeURIComponent(classroomId)}`
  if (nextItem === 'overview') return pathname

  const searchParams = new URLSearchParams({ view: nextItem })
  return `${pathname}?${searchParams.toString()}`
}

const RESERVED_CLASSROOM_PATHS = new Set(['new', 'archived', 'trash'])

export function isClassroomSectionPath(pathname: string): boolean {
  return pathname === '/classrooms' || pathname.startsWith('/classrooms/')
}

export function isClassroomDetailPath(pathname: string): boolean {
  const match = pathname.match(/^\/classrooms\/([^/]+)\/?$/)
  return match !== null && !RESERVED_CLASSROOM_PATHS.has(match[1])
}
