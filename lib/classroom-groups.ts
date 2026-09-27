/**
 * กลุ่มย่อยในห้องเรียน — the rules both the server and the screens need.
 *
 * Nothing here touches Supabase, so the one question every student-facing
 * page has to answer the same way ("was this งาน handed to this student?")
 * lives in exactly one tested place instead of being restated per page.
 *
 * Data shape (migration 20260926232639):
 *   classroom_groups            id, classroom_id, name, color, position
 *   classroom_group_members     (classroom_id, student_id) → group_id
 *   assignment_classrooms       group_ids: NULL = ทั้งห้อง, [..] = those groups
 */

/** Same ids as the classroom cover colours, so a group follows the theme. */
export const GROUP_COLOR_IDS = [
  'purple', 'blue', 'sky', 'mint', 'green', 'amber', 'orange', 'red', 'slate',
] as const
export type GroupColorId = typeof GROUP_COLOR_IDS[number]

export const GROUP_NAME_MAX = 60
/** A room of forty split in pairs is twenty; thirty leaves room above that. */
export const MAX_GROUPS_PER_CLASSROOM = 30

export interface ClassroomGroup {
  id: string
  classroom_id: string
  name: string
  color: GroupColorId
  position: number
}

/** One row of assignment_classrooms, as far as reach is concerned. */
export interface AssignmentLinkReach {
  classroom_id: string
  group_ids: string[] | null
}

export function isGroupColorId(value: unknown): value is GroupColorId {
  return typeof value === 'string' && (GROUP_COLOR_IDS as readonly string[]).includes(value)
}

/** Trimmed, inner runs of whitespace collapsed; null when empty or too long. */
export function normalizeGroupName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.replace(/\s+/g, ' ').trim()
  if (name.length === 0 || name.length > GROUP_NAME_MAX) return null
  return name
}

/** "กลุ่มที่ N" with the smallest N no existing group is already called. */
export function defaultGroupName(existingNames: string[]): string {
  const taken = new Set(existingNames.map(n => n.trim()))
  for (let n = 1; ; n++) {
    const candidate = `กลุ่มที่ ${n}`
    if (!taken.has(candidate)) return candidate
  }
}

/**
 * The palette colour used least so far, earliest in the palette on a tie —
 * so the first nine groups all differ, and the tenth starts the cycle again.
 */
export function nextGroupColor(existingColors: string[]): GroupColorId {
  const counts = new Map<string, number>()
  for (const c of existingColors) counts.set(c, (counts.get(c) ?? 0) + 1)
  let best: GroupColorId = GROUP_COLOR_IDS[0]
  let bestCount = Infinity
  for (const id of GROUP_COLOR_IDS) {
    const count = counts.get(id) ?? 0
    if (count < bestCount) {
      best = id
      bestCount = count
    }
  }
  return best
}

/** Does this one classroom link hand the งาน to a student in `groupId`? */
export function linkReachesGroup(groupIds: string[] | null, groupId: string | null | undefined): boolean {
  if (groupIds === null) return true
  return groupId != null && groupIds.includes(groupId)
}

/**
 * Was this งาน handed to this student — the TypeScript twin of the SQL in
 * get_my_visible_assignment_ids(). Keep the two in step.
 *
 * @param enrolled     classrooms the student is on the roster of
 * @param groupOf      the student's group in each classroom (absent = none)
 * @param hasSubmission a student who already started keeps the งาน even after
 *                      being moved out of its group, so their work never
 *                      disappears from under them
 */
export function assignmentReachesStudent(
  links: AssignmentLinkReach[],
  enrolled: ReadonlySet<string>,
  groupOf: ReadonlyMap<string, string>,
  hasSubmission = false,
): boolean {
  return links.some(link =>
    enrolled.has(link.classroom_id)
    && (hasSubmission || linkReachesGroup(link.group_ids, groupOf.get(link.classroom_id))),
  )
}

/**
 * The students of one classroom a งาน was handed to. `groupOf` maps
 * student id → group id within that same classroom.
 */
export function targetedStudentIds(
  groupIds: string[] | null,
  rosterIds: string[],
  groupOf: ReadonlyMap<string, string>,
): Set<string> {
  if (groupIds === null) return new Set(rosterIds)
  const wanted = new Set(groupIds)
  return new Set(rosterIds.filter(id => {
    const g = groupOf.get(id)
    return g != null && wanted.has(g)
  }))
}

/**
 * Deal students into groups at random, as evenly as possible: shuffle, then
 * round-robin, so group sizes never differ by more than one.
 */
export function splitIntoGroups(
  studentIds: string[],
  groupIds: string[],
  random: () => number = Math.random,
): Map<string, string> {
  const result = new Map<string, string>()
  if (groupIds.length === 0) return result
  const shuffled = [...studentIds]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  shuffled.forEach((id, i) => result.set(id, groupIds[i % groupIds.length]))
  return result
}

/**
 * Clean the "มอบให้กลุ่มไหน" choice a browser sent for one classroom.
 *
 * - null / undefined → ทั้งห้อง (null)
 * - anything else must be an array of ids that are groups of that classroom;
 *   unknown ids are dropped rather than trusted
 * - an array that ends up empty is refused (returned as 'invalid'): "เฉพาะกลุ่ม"
 *   with no group picked would hand the งาน to nobody, which is never what a
 *   teacher meant when they pressed สร้าง
 */
export function cleanGroupTarget(
  raw: unknown,
  groupsOfClassroom: ReadonlySet<string>,
): string[] | null | 'invalid' {
  if (raw === null || raw === undefined) return null
  if (!Array.isArray(raw)) return 'invalid'
  const ids = Array.from(new Set(raw.filter((v): v is string => typeof v === 'string' && groupsOfClassroom.has(v))))
  return ids.length > 0 ? ids : 'invalid'
}

/** Thai summary of who a link reaches, e.g. "ทั้งห้อง" or "กลุ่ม A, กลุ่ม B". */
export function describeGroupTarget(
  groupIds: string[] | null,
  groupNameById: ReadonlyMap<string, string>,
): string {
  if (groupIds === null) return 'ทั้งห้อง'
  const names = groupIds.map(id => groupNameById.get(id)).filter((n): n is string => !!n)
  if (names.length === 0) return 'ไม่มีกลุ่ม (กลุ่มที่เลือกถูกลบแล้ว)'
  return names.join(', ')
}
