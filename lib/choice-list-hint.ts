import type { TrueFalseSelectTarget } from './types'

/**
 * The line printed above a list of boxes the student ticks — a ถูก-ผิดแบบชุด
 * part's choices, or a select_matching ถูก-ผิด's statements.
 *
 * It used to be one fixed question, "ข้อใดต่อไปนี้ถูกต้อง? (เลือกได้มากกว่า 1 ข้อ)",
 * printed whether or not a question had already been asked. A teacher whose own
 * prompt reads "ตะปูเหล็กที่เกิดสนิมอยู่ในบีกเกอร์หมายเลข" got a second, differently
 * worded question underneath it, asking for something the list was not about.
 *
 * So the question is written only when nobody else asked one. What survives
 * either way is the affordance: that more than one box may be ticked is a fact
 * about the input rather than a question, and no wording of the teacher's can
 * be relied on to mention it.
 *
 * A list that wants the WRONG entries ticked is the exception — that reverses
 * what ticking means, and a prompt phrased to say so ("ข้อใดต่อไปนี้ไม่ถูกต้อง")
 * cannot be assumed, so it is always spelled out.
 *
 * Shared by the exam page and the teacher's preview so the two cannot drift
 * into describing the same list differently, which is how a ถูก-ผิดแบบชุด came
 * to be previewed as fully correct while the exam scored it 4/7.
 */
export function choiceListHint(
  ownPrompt: string | null | undefined,
  selectTarget: TrueFalseSelectTarget | null | undefined,
): string {
  const wantsWrong = selectTarget === 'wrong'
  const asked = !!(ownPrompt ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()

  if (!asked) return `ข้อใดต่อไปนี้${wantsWrong ? 'ผิด' : 'ถูกต้อง'}? (เลือกได้มากกว่า 1 ข้อ)`
  if (wantsWrong) return 'เลือกข้อที่ผิด — เลือกได้มากกว่า 1 ข้อ'
  return 'เลือกได้มากกว่า 1 ข้อ'
}
