/**
 * Dates and times on a Thai clock, whatever zone the code runs in.
 *
 * Vercel runs server code in UTC, so `toLocaleString('th-TH')` in a server
 * component or route handler prints a 16:00 deadline as 09:00, and a midnight
 * deadline as the day before. Anything rendered or written on the server — a
 * page, a report, an exported file — formats through here instead. Client
 * components can keep `toLocale*String`: the browser's zone is the reader's.
 *
 * Built on `toLocale*String` rather than `Intl.DateTimeFormat#format` so a bad
 * value still reads "Invalid Date" as it did before, instead of throwing a
 * RangeError that takes the whole page down.
 */

export const THAI_TIME_ZONE = 'Asia/Bangkok'

type DateInput = Date | string | number

/** The fields that name a day — no clock time can slip into a date-only label. */
type DateOnlyOptions = Pick<Intl.DateTimeFormatOptions, 'dateStyle' | 'weekday' | 'era' | 'year' | 'month' | 'day'>

type DateTimeOptions = Omit<Intl.DateTimeFormatOptions, 'timeZone'>

/** A calendar day in Thailand, e.g. "3 ต.ค. 2569". */
export function formatThaiDate(
  value: DateInput,
  options: DateOnlyOptions = { dateStyle: 'medium' },
): string {
  return new Date(value).toLocaleDateString('th-TH', { ...options, timeZone: THAI_TIME_ZONE })
}

/** A day and its clock time in Thailand, e.g. "3 ต.ค. 2569 16:00". */
export function formatThaiDateTime(
  value: DateInput,
  options: DateTimeOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  return new Date(value).toLocaleString('th-TH', { ...options, timeZone: THAI_TIME_ZONE })
}

/** The hour, 0–23, on a clock in Thailand — for "good morning" and the like. */
export function thaiHour(value: DateInput = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: THAI_TIME_ZONE })
    .formatToParts(new Date(value))
    .find(part => part.type === 'hour')
  return Number(hour?.value)
}
