/**
 * Converting a matching answer between how it is stored and how the drag input
 * shows it.
 *
 * The stored shape is fixed and must stay that way: the chosen `right_text` per
 * prompt, in prompt order, which is what `MATCH:` in `lib/assignment-attempt.ts`
 * grades against and what every submission already in the database holds. The
 * drag input instead works in option ids, because two options can carry the
 * same text and it still has to know which chip is which.
 *
 * These live here rather than inside the exam client so the round trip can be
 * tested — a bug in this conversion costs a student marks on an answer they
 * gave correctly.
 */

/**
 * Which option sits in each prompt's slot, resolved from the stored texts.
 *
 * A text is matched to the first option not already spoken for. When a teacher
 * uses the same right-hand text in two pairs, the two chips are interchangeable
 * by definition, so which of them is picked cannot change the grade — only
 * which chip appears to have moved.
 */
export function placementFromTexts(
  texts: string[],
  options: Array<{ right_text: string }>,
  promptCount: number,
): (string | null)[] {
  const used = new Set<number>()
  return Array.from({ length: promptCount }, (_, i) => {
    const text = texts[i]
    if (!text) return null
    const j = options.findIndex((o, k) => !used.has(k) && o.right_text === text)
    if (j === -1) return null
    used.add(j)
    return String(j)
  })
}

/** The stored answer for a placement. An empty slot stores '', as it always has. */
export function textsFromPlacement(
  placement: (string | null)[],
  options: Array<{ right_text: string }>,
): string[] {
  return placement.map(id => (id === null ? '' : options[Number(id)]?.right_text ?? ''))
}
