import { CARD_DATA_MAX_IDS } from '@/lib/question-card-data'

/**
 * Rows past the last one on screen that should already have their badges by
 * the time the reader scrolls to them. A request goes out once any of these is
 * still unread, so badges keep ahead of an ordinary scroll instead of
 * appearing a moment after each card does.
 */
export const CARD_DATA_LOOKAHEAD = 20

/**
 * Which question ids a โจทย์ picker asks getQuestionCardData for next, given
 * the rows it has drawn and the ones in or near the viewport.
 *
 * The picker used to send one request per IntersectionObserver callback —
 * whatever two or three cards had just scrolled in. Next.js dispatches Server
 * Actions one at a time per client, so on the real page (28 ตุลาคม 2026) a
 * short scroll queued a dozen 0.2–0.9 s calls one behind another and the last
 * badges landed seconds after the scrolling stopped. One request now covers
 * the cards on screen and then fills the rest of a full batch with the rows
 * after them, then the rows above, so the next screenfuls are already read.
 *
 * Returns nothing while every row from the first one on screen to
 * CARD_DATA_LOOKAHEAD past the last is already requested — the caller then
 * simply waits for the reader to scroll further.
 *
 * `orderedIds` is the list top to bottom and may name a question twice (the
 * review copy of a pick above its row in the bank); each id is asked for once.
 */
export function nextCardDataBatch(
  orderedIds: readonly string[],
  visibleIds: ReadonlySet<string>,
  requested: ReadonlySet<string>,
  { max = CARD_DATA_MAX_IDS, lookahead = CARD_DATA_LOOKAHEAD } = {},
): string[] {
  let first = -1
  let last = -1
  orderedIds.forEach((id, index) => {
    if (!visibleIds.has(id)) return
    if (first === -1) first = index
    last = index
  })
  if (first === -1) return []

  const windowEnd = Math.min(orderedIds.length - 1, last + lookahead)
  let needed = false
  for (let index = first; index <= windowEnd && !needed; index++) {
    needed = !requested.has(orderedIds[index])
  }
  if (!needed) return []

  const batch = new Set<string>()
  const take = (index: number) => {
    const id = orderedIds[index]
    if (!requested.has(id)) batch.add(id)
    return batch.size < max
  }
  for (let index = first; index < orderedIds.length; index++) {
    if (!take(index)) return [...batch]
  }
  for (let index = first - 1; index >= 0; index--) {
    if (!take(index)) return [...batch]
  }
  return [...batch]
}
