import type { OrderingItem } from './types'

/**
 * Reading and writing an ordering answer for a drag-to-reorder list.
 *
 * The stored shape does not change: item ids in the student's chosen order,
 * which is what `ORDER:` (and the `ordering` branch of `COMP:`) in
 * `lib/assignment-attempt.ts` grades, position by position. What changes is
 * that a drag list can only ever produce a complete permutation, so the
 * half-finished `{ itemId: position }` object the dropdown version saved is
 * only ever read, never written.
 *
 * These live here rather than in the exam client so the round trip can be
 * tested — reading a saved answer back in the wrong order would silently show
 * a student something other than what they answered, and grade it that way.
 */

/** The saved order, as ids, or `null` when nothing usable is stored. */
function storedIds(raw: string): string[] | null {
  if (!raw || !raw.startsWith('[')) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const ids = parsed.filter((v): v is string => typeof v === 'string' && v !== '')
    return ids.length > 0 ? ids : null
  } catch {
    return null
  }
}

/**
 * The order to show: what the student saved, else the shuffled order they were
 * first given.
 *
 * An id that no longer exists is dropped and an item the saved answer never
 * mentions is appended, so a question edited after an attempt began still shows
 * every item exactly once instead of losing one off the list.
 */
export function orderingDisplayOrder(raw: string, shuffled: OrderingItem[]): OrderingItem[] {
  const ids = storedIds(raw)
  if (!ids) return shuffled
  const byId = new Map(shuffled.map(i => [i.id, i]))
  const ordered: OrderingItem[] = []
  for (const id of ids) {
    const item = byId.get(id)
    if (item && !ordered.includes(item)) ordered.push(item)
  }
  for (const item of shuffled) if (!ordered.includes(item)) ordered.push(item)
  return ordered
}

/**
 * Whether an answer is on record.
 *
 * Only a complete permutation counts. A `{ itemId: position }` draft left by
 * the dropdown version is a partial answer that would grade as wrong anyway, so
 * the student is asked to place the items again rather than being told they
 * have answered.
 */
export function orderingIsAnswered(raw: string, itemCount: number): boolean {
  const ids = storedIds(raw)
  return !!ids && itemCount > 0 && new Set(ids).size === itemCount
}
