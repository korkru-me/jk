import { assignmentReachesStudent, type AssignmentLinkReach } from './classroom-groups'

export interface HomeroomMembership {
  classroom_id: string
  student_id: string
}
export interface HomeroomGroupMembership extends HomeroomMembership { group_id: string }

/** Current subject membership is required, including for historical attempts. */
export function homeroomAssignmentScope(
  links: AssignmentLinkReach[],
  memberships: HomeroomMembership[],
  groups: HomeroomGroupMembership[],
  submitterIds: ReadonlySet<string>,
) {
  const roomIds = new Set(links.map(link => link.classroom_id))
  const enrolledByStudent = new Map<string, Set<string>>()
  for (const row of memberships) {
    if (!roomIds.has(row.classroom_id)) continue
    const rooms = enrolledByStudent.get(row.student_id) ?? new Set<string>()
    rooms.add(row.classroom_id)
    enrolledByStudent.set(row.student_id, rooms)
  }
  const groupsByStudent = new Map<string, Map<string, string>>()
  for (const row of groups) {
    const rooms = groupsByStudent.get(row.student_id) ?? new Map<string, string>()
    rooms.set(row.classroom_id, row.group_id)
    groupsByStudent.set(row.student_id, rooms)
  }
  return {
    classroomStudentIds: [...enrolledByStudent.keys()],
    assignedStudentIds: [...enrolledByStudent].filter(([id, rooms]) =>
      assignmentReachesStudent(links, rooms, groupsByStudent.get(id) ?? new Map(), submitterIds.has(id)),
    ).map(([id]) => id),
  }
}
