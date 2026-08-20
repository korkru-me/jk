/**
 * Shared presentation config for the assignment calendars.
 *
 * The dashboard calendar and the homeroom calendar render the same grid with
 * the same due-date severity scale, and each kept its own copy of this.
 *
 * SEVERITY_LABEL is deliberately not here: the two calendars describe the same
 * state from different points of view — a student sees "เลยกำหนดส่งแล้ว" about
 * their own work, a teacher sees "มีคนยังไม่ส่ง (เลยกำหนด)" about the class —
 * so each keeps its own wording.
 */

/** How urgent a due date is, relative to now. */
export type Severity = 'overdue' | 'soon' | 'later' | 'done'

export const WEEKDAY_LABELS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

export const MONTH_LABELS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

/** Sort order — most urgent first. */
export const SEVERITY_ORDER: Record<Severity, number> = { overdue: 0, soon: 1, later: 2, done: 3 }

/** Solid dot on a calendar day. */
export const SEVERITY_DOT: Record<Severity, string> = {
  overdue: 'bg-destructive',
  soon: 'bg-warning',
  later: 'bg-primary',
  done: 'bg-success',
}

/** Tinted badge in the day's detail list. */
export const SEVERITY_BADGE: Record<Severity, string> = {
  overdue: 'bg-destructive/10 text-destructive',
  soon: 'bg-warning/10 text-warning',
  later: 'bg-primary/10 text-primary',
  done: 'bg-success/10 text-success',
}
