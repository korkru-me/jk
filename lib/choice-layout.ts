/**
 * Whether a list of choices should wrap into a row instead of stacking one per
 * line — the ตัวเลือก of a ถูก-ผิดแบบชุด, or the options inside a ตารางจำแนก cell.
 *
 * A worksheet prints "☐ 1 ☐ 2 ☐ 3 ☐ 4 ☐ 5 ☐ 6 ☐ 7" across a single line, and
 * "☐ A ☐ B ☐ C" beside the row it judges. Stacking those seven boxes down the
 * page costs most of a phone screen and loses the shape a student is reading
 * the paper for. Sentences, on the other hand, have to stack — they are what
 * the stacking rule was written for.
 *
 * Decided from the text rather than from a switch the teacher has to find: a
 * list is short or it is not, and asking would be asking them to describe what
 * they can already see. Anything with markup that carries no words of its own
 * (a choice that is only an image) stacks, since its height is unknown here.
 */

/** Longest a single choice can be and still sit in a row with its neighbours. */
const LONGEST_CHOICE = 12
/** Longest the whole list can be, so a row of middling choices still stacks. */
const LONGEST_ROW = 48

function plain(html: string | null | undefined): string {
  return (html ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

export function choicesFitOneRow(texts: Array<string | null | undefined>): boolean {
  if (texts.length < 2) return false

  let total = 0
  for (const text of texts) {
    const words = plain(text)
    if (!words || words.length > LONGEST_CHOICE) return false
    total += words.length
  }
  return total <= LONGEST_ROW
}
