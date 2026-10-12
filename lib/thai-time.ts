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

const THAI_LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

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

/**
 * The Thai calendar day as YYYY-MM-DD (Gregorian, for a filename), e.g.
 * "2026-10-03". `toISOString().slice(0, 10)` gives the UTC day, which is still
 * yesterday until 07:00 in Thailand. Throws on a bad value, as that did.
 */
export function thaiDateStamp(value: DateInput = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: THAI_TIME_ZONE,
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

/**
 * The instant the Thai calendar day holding `value` began — for "today" in a
 * query. `setHours(0, 0, 0, 0)` on a UTC server lands on 07:00 in Thailand.
 * Thailand has kept UTC+7 all year since 1920, with no daylight saving, so its
 * midnight is always 17:00 UTC the day before.
 */
export function startOfThaiDay(value: DateInput = new Date()): Date {
  return new Date(`${thaiDateStamp(value)}T00:00:00+07:00`)
}

/** Convert a datetime-local control value on the product's Thai clock into a
 * real instant. Thailand has no daylight-saving transitions, so +07:00 is
 * stable and avoids interpreting the value in the browser or server zone. */
export function thaiLocalDateTimeToIso(value: string | null | undefined): string | null {
  const local = value?.trim() ?? ''
  if (!local) return null
  if (!THAI_LOCAL_DATE_TIME.test(local)) return null
  const date = new Date(`${local}:00+07:00`)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

/** Format an instant for a datetime-local control on the Thai clock. */
export function toThaiLocalDateTimeInput(value: DateInput | null | undefined): string {
  if (value == null || value === '') return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: THAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}
