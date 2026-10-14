export type StudentWorkOrder = 'due' | 'latest'
export type StudentWorkDirection = 'asc' | 'desc'
interface SortableWork { id: string; endAt: string | null; assignedAt: string | null }
const timestamp = (value: string | null, fallback: number) => {
  const time = value ? Date.parse(value) : NaN
  return Number.isFinite(time) ? time : fallback
}

export function sortStudentWork<T extends SortableWork>(items: readonly T[], order: StudentWorkOrder, direction: StudentWorkDirection = order === 'due' ? 'asc' : 'desc'): T[] {
  return [...items].sort((a, b) => {
    const left = timestamp(order === 'latest' ? a.assignedAt : a.endAt, NaN)
    const right = timestamp(order === 'latest' ? b.assignedAt : b.endAt, NaN)
    // Unknown dates stay last in either direction.
    if (!Number.isFinite(left) || !Number.isFinite(right)) return Number(!Number.isFinite(left)) - Number(!Number.isFinite(right)) || a.id.localeCompare(b.id)
    return left === right ? a.id.localeCompare(b.id) : (left - right) * (direction === 'asc' ? 1 : -1)
  })
}
