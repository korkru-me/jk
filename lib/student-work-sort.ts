export type StudentWorkOrder = 'due' | 'latest'
interface SortableWork { id: string; endAt: string | null; assignedAt: string | null }
const timestamp = (value: string | null, fallback: number) => {
  const time = value ? Date.parse(value) : NaN
  return Number.isFinite(time) ? time : fallback
}

export function sortStudentWork<T extends SortableWork>(items: readonly T[], order: StudentWorkOrder): T[] {
  return [...items].sort((a, b) => {
    const left = order === 'latest' ? -timestamp(a.assignedAt, -Infinity) : timestamp(a.endAt, Infinity)
    const right = order === 'latest' ? -timestamp(b.assignedAt, -Infinity) : timestamp(b.endAt, Infinity)
    return left === right ? a.id.localeCompare(b.id) : left - right
  })
}
