/**
 * The "สรุปผลการประเมิน" paragraph, written from the numbers rather than by
 * hand.
 *
 * A teacher may reword it afterwards — their committee has its own house style
 * — but the figures in the default text always come from `summarizeIocForm`,
 * so the paragraph and the table above it cannot disagree on the day the
 * document is printed.
 */

import { formatIocPercent, type IocSummary } from '@/lib/ioc'

export interface IocSummaryHeader {
  exam_title: string
  subject_name: string
  grade_level: string
}

/** "4 และ 9" for two, "4, 9 และ 11" for more — how a Thai sentence lists them. */
export function joinThaiList(values: readonly string[]): string {
  if (values.length === 0) return ''
  if (values.length === 1) return values[0]
  return `${values.slice(0, -1).join(', ')} และ ${values[values.length - 1]}`
}

export interface BuildIocSummaryParagraphInput {
  header: IocSummaryHeader
  summary: IocSummary
  /** Printed numbers of the items that fell below the threshold, in order. */
  failedLabels: readonly string[]
}

/**
 * Returns an empty string when there is nothing to summarize. A paragraph
 * about a form nobody has judged would be a sentence with no evidence behind
 * it, which is worse than a blank space a teacher can see is blank.
 */
export function buildIocSummaryParagraph({
  header,
  summary,
  failedLabels,
}: BuildIocSummaryParagraphInput): string {
  if (summary.expertCount === 0 || summary.ratedItemCount === 0 || summary.percent === null) {
    return ''
  }

  const subject = header.subject_name ? ` รายวิชา${header.subject_name}` : ''
  const grade = header.grade_level ? ` ของนักเรียนชั้น${header.grade_level}` : ''
  const exam = header.exam_title || 'แบบทดสอบฉบับนี้'
  const percent = formatIocPercent(summary.percent)
  const passed = summary.passedItemIds.length
  const total = summary.itemCount

  const opening = `จากการประเมินจะเห็นได้ว่า ${exam}${subject}${grade}`

  if (failedLabels.length === 0) {
    return (
      `${opening} มีความสอดคล้องกับมาตรฐานการเรียนรู้และตัวชี้วัดครบทั้ง ${total} ข้อ `
      + `คิดเป็นร้อยละความสอดคล้องเท่ากับ ${percent} `
      + 'จึงเหมาะสมที่จะนำไปใช้ในการทดสอบวัดผลสัมฤทธิ์การเรียนรู้ของผู้เรียน'
    )
  }

  const failedList = joinThaiList(failedLabels.map(label => `ข้อ ${label}`))
  return (
    `${opening} มีข้อที่สอดคล้องกับมาตรฐานการเรียนรู้และตัวชี้วัดตามเกณฑ์ ${passed} จาก ${total} ข้อ `
    + `คิดเป็นร้อยละความสอดคล้องเท่ากับ ${percent} `
    + `โดยมีข้อที่ควรปรับปรุงหรือตัดออกจำนวน ${failedLabels.length} ข้อ ได้แก่ ${failedList} `
    + 'เมื่อปรับปรุงตามข้อเสนอแนะของผู้ทรงคุณวุฒิแล้ว '
    + 'จึงเหมาะสมที่จะนำไปใช้ในการทดสอบวัดผลสัมฤทธิ์การเรียนรู้ของผู้เรียน'
  )
}

/**
 * Whether a teacher's own wording was written before the latest rating landed.
 *
 * Reopening a form for one expert changes the numbers under a paragraph that
 * was already edited, and nothing else would tell the teacher that the text
 * they polished now quotes figures that have moved.
 */
export function isIocSummaryTextStale(
  summaryTextUpdatedAt: string | null,
  latestRatingAt: string | null,
): boolean {
  if (!summaryTextUpdatedAt || !latestRatingAt) return false
  return new Date(latestRatingAt).getTime() > new Date(summaryTextUpdatedAt).getTime()
}
