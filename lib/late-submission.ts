import { GROUP_COLOR_IDS, type GroupColorId } from './classroom-groups'

/** Reuse the established classroom palette so filters and colour chips never
 * gain a second, drifting set of ids. */
export const LATE_BAND_COLOR_IDS = GROUP_COLOR_IDS
export type LateBandColorId = GroupColorId

export interface AssignmentLateBandInput {
  id?: string
  starts_at: string
  label: string
  color: LateBandColorId
}

export interface AssignmentLateBand {
  id: string
  starts_at: string
  label: string
  color: LateBandColorId
}

export interface AssignmentLateSchedule {
  dueAt: string | null
  bands: AssignmentLateBand[]
}

interface NormalizeLateScheduleInput {
  dueAt: string | null | undefined
  endAt: string | null | undefined
  startAt?: string | null
  bands: readonly AssignmentLateBandInput[] | null | undefined
}

interface NormalizeLateScheduleOptions {
  /** Normal assignment edits require a hard close. Internal reopen flows may
   * temporarily clear end_at while keeping the historical colour policy. */
  requireClose?: boolean
  makeId?: () => string
}

export type NormalizeLateScheduleResult =
  | { value: AssignmentLateSchedule }
  | { error: string }

const MAX_LATE_BANDS = 8
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ZONED_DATE_TIME = /T.*(?:Z|[+-]\d{2}:\d{2})$/
const COLOR_IDS = new Set<string>(LATE_BAND_COLOR_IDS)

function parseZonedInstant(value: unknown): { iso: string; time: number } | null {
  if (typeof value !== 'string' || !ZONED_DATE_TIME.test(value)) return null
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return null
  return { iso: new Date(time).toISOString(), time }
}

function defaultBandId() {
  return globalThis.crypto.randomUUID()
}

/**
 * Validate and canonicalize the complete schedule before it reaches Postgres.
 * The array order is meaningful and never silently sorted: a tampered or stale
 * form must be corrected instead of changing the teacher's intended bands.
 */
export function normalizeAssignmentLateSchedule(
  input: NormalizeLateScheduleInput,
  options: NormalizeLateScheduleOptions = {},
): NormalizeLateScheduleResult {
  const rawBands = input.bands ?? []
  const dueValue = input.dueAt?.trim() || null

  if (dueValue === null) {
    if (rawBands.length > 0) return { error: 'ต้องกำหนดวันส่งก่อนเพิ่มช่วงสีส่งช้า' }
    return { value: { dueAt: null, bands: [] } }
  }

  const due = parseZonedInstant(dueValue)
  if (!due) return { error: 'วันส่งต้องเป็นวันและเวลาที่ระบุเขตเวลาอย่างชัดเจน' }

  const endValue = input.endAt?.trim() || null
  const end = endValue === null ? null : parseZonedInstant(endValue)
  if (endValue !== null && !end) return { error: 'วันปิดรับต้องเป็นวันและเวลาที่ถูกต้อง' }
  if ((options.requireClose ?? true) && !end) return { error: 'ต้องกำหนดวันปิดรับเมื่อเปิดใช้ช่วงสีส่งช้า' }
  if (end && due.time >= end.time) return { error: 'วันส่งต้องอยู่ก่อนวันปิดรับ' }

  if (input.startAt) {
    const startTime = Date.parse(input.startAt)
    if (Number.isFinite(startTime) && due.time < startTime) {
      return { error: 'วันส่งต้องไม่อยู่ก่อนวันเปิดรับ' }
    }
  }

  if (rawBands.length < 1) return { error: 'กรุณาเพิ่มช่วงสีส่งช้าอย่างน้อย 1 ช่วง' }
  if (rawBands.length > MAX_LATE_BANDS) return { error: `กำหนดช่วงสีส่งช้าได้ไม่เกิน ${MAX_LATE_BANDS} ช่วง` }

  const makeId = options.makeId ?? defaultBandId
  const ids = new Set<string>()
  const bands: AssignmentLateBand[] = []
  let previousTime: number | null = null

  for (const [index, rawBand] of rawBands.entries()) {
    if (!rawBand || typeof rawBand !== 'object' || Array.isArray(rawBand)) {
      return { error: `ข้อมูลช่วงสีลำดับที่ ${index + 1} ไม่ถูกต้อง` }
    }

    const startsAt = parseZonedInstant(rawBand.starts_at)
    if (!startsAt) return { error: `เวลาเริ่มช่วงสีลำดับที่ ${index + 1} ไม่ถูกต้อง` }
    if (index === 0 && startsAt.time !== due.time) {
      return { error: 'ช่วงสีแรกต้องเริ่มตรงกับวันส่ง' }
    }
    if (previousTime !== null && startsAt.time <= previousTime) {
      return { error: 'ช่วงสีส่งช้าต้องเรียงเวลาและห้ามมีเวลาเดียวกัน' }
    }
    if (end && startsAt.time >= end.time) {
      return { error: 'ช่วงสีส่งช้าต้องเริ่มก่อนวันปิดรับ' }
    }

    const label = typeof rawBand.label === 'string' ? rawBand.label.trim() : ''
    if (label.length < 1 || label.length > 60) {
      return { error: 'ชื่อช่วงสีต้องมี 1–60 ตัวอักษร' }
    }
    if (!COLOR_IDS.has(rawBand.color)) return { error: 'สีของช่วงส่งช้าไม่ถูกต้อง' }

    const rawId = rawBand.id ?? makeId()
    if (typeof rawId !== 'string') return { error: 'รหัสช่วงสีส่งช้าไม่ถูกต้องหรือซ้ำกัน' }
    const id = rawId.toLowerCase()
    if (!UUID.test(id) || ids.has(id)) return { error: 'รหัสช่วงสีส่งช้าไม่ถูกต้องหรือซ้ำกัน' }
    ids.add(id)
    bands.push({ id, starts_at: startsAt.iso, label, color: rawBand.color })
    previousTime = startsAt.time
  }

  return { value: { dueAt: due.iso, bands } }
}

export function assignmentLateScheduleEquals(
  left: AssignmentLateSchedule,
  right: AssignmentLateSchedule,
): boolean {
  const leftDue = left.dueAt === null ? null : Date.parse(left.dueAt)
  const rightDue = right.dueAt === null ? null : Date.parse(right.dueAt)
  if (leftDue !== rightDue || left.bands.length !== right.bands.length) return false
  return left.bands.every((band, index) => {
    const other = right.bands[index]
    return band.id.toLowerCase() === other.id.toLowerCase()
      && Date.parse(band.starts_at) === Date.parse(other.starts_at)
      && band.label === other.label
      && band.color === other.color
  })
}

export interface CompletedSubmissionTime {
  status: 'in_progress' | 'submitted' | 'graded'
  submitted_at: string | null
}

/** Later retries never move an on-time student into a late colour group. */
export function firstCompletedSubmissionAt(
  submissions: readonly CompletedSubmissionTime[],
): string | null {
  let earliest = Number.POSITIVE_INFINITY
  for (const submission of submissions) {
    if (submission.status === 'in_progress' || !submission.submitted_at) continue
    const submittedAt = Date.parse(submission.submitted_at)
    if (Number.isFinite(submittedAt) && submittedAt < earliest) earliest = submittedAt
  }
  return Number.isFinite(earliest) ? new Date(earliest).toISOString() : null
}

export interface SubmissionTimingInput {
  dueAt: string | null
  endAt: string | null
  bands: readonly AssignmentLateBand[]
  submittedAt: string | null
  /** NULL keeps an old extension's meaning: on time until extendedEndAt. */
  extendedDueAt?: string | null
  extendedEndAt?: string | null
}

export type SubmissionTiming =
  | { status: 'not_submitted' }
  | { status: 'unclassified'; submittedAt: string }
  | { status: 'on_time'; submittedAt: string; effectiveDueAt: string }
  | { status: 'late'; submittedAt: string; effectiveDueAt: string; band: AssignmentLateBand }
  | { status: 'after_close'; submittedAt: string; effectiveEndAt: string }

/**
 * Classify a student's first completed attempt. Additional transition times
 * are exclusive ("เกินเวลานี้"), so an exact boundary stays in the previous
 * band; the exact due instant is still on time.
 */
export function classifySubmissionTiming(input: SubmissionTimingInput): SubmissionTiming {
  if (!input.submittedAt) return { status: 'not_submitted' }
  const submitted = parseZonedInstant(input.submittedAt)
  if (!submitted) return { status: 'unclassified', submittedAt: input.submittedAt }
  if (!input.dueAt) return { status: 'unclassified', submittedAt: submitted.iso }

  const schedule = normalizeAssignmentLateSchedule({
    dueAt: input.dueAt,
    endAt: input.endAt,
    bands: input.bands,
  }, { requireClose: false, makeId: defaultBandId })
  if ('error' in schedule) return { status: 'unclassified', submittedAt: submitted.iso }

  const originalDue = parseZonedInstant(schedule.value.dueAt)
  if (!originalDue) return { status: 'unclassified', submittedAt: submitted.iso }
  const originalEnd = input.endAt ? parseZonedInstant(input.endAt) : null
  const extensionEnd = input.extendedEndAt ? parseZonedInstant(input.extendedEndAt) : null
  const extensionDue = input.extendedDueAt ? parseZonedInstant(input.extendedDueAt) : null
  if ((input.extendedDueAt && !extensionDue) || (input.extendedEndAt && !extensionEnd)) {
    return { status: 'unclassified', submittedAt: submitted.iso }
  }
  if (extensionDue && (!extensionEnd || extensionDue.time > extensionEnd.time)) {
    return { status: 'unclassified', submittedAt: submitted.iso }
  }

  let effectiveDue = originalDue
  let effectiveEnd = originalEnd
  let shift = 0
  if (extensionEnd && extensionDue) {
    effectiveDue = extensionDue
    effectiveEnd = extensionEnd
    shift = extensionDue.time - originalDue.time
  } else if (extensionEnd) {
    // Backward compatibility: before extended_due_at existed, one timestamp
    // meant the student's personal deadline and everything through it was on time.
    effectiveDue = extensionEnd
    effectiveEnd = extensionEnd
    shift = extensionEnd.time - originalDue.time
  }

  if (effectiveEnd && submitted.time > effectiveEnd.time) {
    return { status: 'after_close', submittedAt: submitted.iso, effectiveEndAt: effectiveEnd.iso }
  }
  if (submitted.time <= effectiveDue.time) {
    return { status: 'on_time', submittedAt: submitted.iso, effectiveDueAt: effectiveDue.iso }
  }

  const shiftedBands = schedule.value.bands.map(band => ({
    ...band,
    starts_at: new Date(Date.parse(band.starts_at) + shift).toISOString(),
  }))
  let band: AssignmentLateBand | undefined
  for (let index = shiftedBands.length - 1; index >= 0; index -= 1) {
    if (submitted.time > Date.parse(shiftedBands[index].starts_at)) {
      band = shiftedBands[index]
      break
    }
  }
  if (!band) return { status: 'unclassified', submittedAt: submitted.iso }
  return { status: 'late', submittedAt: submitted.iso, effectiveDueAt: effectiveDue.iso, band }
}
