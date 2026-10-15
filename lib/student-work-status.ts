import type { Severity } from './calendar-display'

export const STUDENT_WORK_STATUS_LABEL: Record<Severity, string> = {
  overdue: 'เลยกำหนดส่งแล้ว',
  soon: 'ใกล้กำหนดส่ง',
  later: 'ยังไม่ถึงกำหนดส่ง',
  done: 'ส่งแล้ว',
}
export const STUDENT_WORK_STATUS_DESCRIPTION: Record<Severity, string> = {
  overdue: 'เลยกำหนดส่งแล้ว และยังทำไม่ครบเงื่อนไข',
  soon: 'ใกล้กำหนดส่งภายใน 48 ชั่วโมง',
  later: 'ยังไม่ถึงกำหนดส่ง หรือไม่มีกำหนดส่ง',
  done: 'ส่งแล้วและทำครบเงื่อนไขของงาน',
}

/** The same status scale drives calendar dots and classroom card borders. */
export function studentWorkSeverity(endAt: string | null, completed: boolean, now: number): Severity {
  if (completed) return 'done'
  const deadline = endAt ? Date.parse(endAt) : NaN
  if (!Number.isFinite(deadline)) return 'later'
  const diff = deadline - now
  return diff < 0 ? 'overdue' : diff < 2 * 86400000 ? 'soon' : 'later'
}
