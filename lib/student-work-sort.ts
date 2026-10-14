export type StudentWorkOrder = 'due' | 'latest'
export type StudentWorkDirection = 'asc' | 'desc'
interface SortableWork { id: string; endAt: string | null; assignedAt: string | null; completed?: boolean }
const timestamp = (value: string | null, fallback: number) => {
  const time = value ? Date.parse(value) : NaN
  return Number.isFinite(time) ? time : fallback
}

export function sortStudentWork<T extends SortableWork>(items: readonly T[], order: StudentWorkOrder, direction: StudentWorkDirection = order === 'due' ? 'asc' : 'desc'): T[] {
  return [...items].sort((a, b) => {
    // Completion is a fixed tier, independent of the selected sort direction.
    const completion = Number(a.completed === true) - Number(b.completed === true)
    if (completion) return completion
    const left = timestamp(order === 'latest' ? a.assignedAt : a.endAt, NaN)
    const right = timestamp(order === 'latest' ? b.assignedAt : b.endAt, NaN)
    // Unknown dates stay last in either direction.
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      const missing = Number(!Number.isFinite(left)) - Number(!Number.isFinite(right))
      if (missing) return missing
      if (order === 'due') {
        // Libraries have no deadline. Within undated active items, show newly
        // published work first rather than ordering it by random UUIDs.
        const assignedLeft = timestamp(a.assignedAt, -Infinity)
        const assignedRight = timestamp(b.assignedAt, -Infinity)
        if (assignedLeft !== assignedRight) return assignedRight - assignedLeft
      }
      return a.id.localeCompare(b.id)
    }
    return left === right ? a.id.localeCompare(b.id) : (left - right) * (direction === 'asc' ? 1 : -1)
  })
}
