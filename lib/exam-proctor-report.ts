import {
  PROCTOR_EVENT_LABELS,
  PROCTOR_REVIEW_EVENT_TYPES,
} from './exam-proctor-alerts'

export const PAGE_SIZE = 50
export const EXPORT_LIMIT = 10_000
export const EXPORT_MAX_BYTES = 4 * 1024 * 1024
export const MAX_PAGE = 10_000
export const ATTEMPT_LIMIT = 2_000
export const STUDENT_NAME_MAX_CODEPOINTS = 160
export const CSV_CELL_MAX_UTF16_UNITS = 2_048

export const KNOWN_EVENT_TYPES = [
  'monitoring_started',
  'tab_hidden',
  'tab_visible',
  'fullscreen_entered',
  'fullscreen_exited',
  'window_blur',
  'window_focus',
  'copy_attempt',
  'cut_attempt',
  'paste_attempt',
  'context_menu_attempt',
  'screenshot_key',
  'concurrent_connection',
] as const

export type ProctorReportEventType = (typeof KNOWN_EVENT_TYPES)[number]
export type ProctorReportKind = 'reviewable' | 'all' | ProctorReportEventType
export type ProctorReportReview = 'all' | 'pending' | 'acknowledged'
export type ProctorReportAccessMode = 'browser' | 'seb' | 'android_monitored'

export interface ProctorReportFilters {
  studentId: string | null
  submissionId: string | null
  kind: ProctorReportKind
  review: ProctorReportReview
  page: number
}

export type ProctorReportExportFilters = Omit<ProctorReportFilters, 'page'>

export type ProctorReportFilterPatch = Partial<ProctorReportFilters>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const KNOWN_EVENT_TYPE_SET = new Set<string>(KNOWN_EVENT_TYPES)
const REVIEWABLE_EVENT_TYPE_SET = new Set<string>(PROCTOR_REVIEW_EVENT_TYPES)
const REVIEW_VALUES = new Set<string>(['all', 'pending', 'acknowledged'])

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function scalarParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key]
  return typeof value === 'string' ? value : undefined
}

function normalizePage(value: unknown): number {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 1) return 1
    return Math.min(value, MAX_PAGE)
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return 1
  const page = Number(value)
  if (!Number.isSafeInteger(page) || page < 1) return 1
  return Math.min(page, MAX_PAGE)
}

function normalizeKind(value: unknown): ProctorReportKind {
  if (value === 'all' || value === 'reviewable') return value
  return typeof value === 'string' && KNOWN_EVENT_TYPE_SET.has(value)
    ? value as ProctorReportEventType
    : 'reviewable'
}

function normalizeReview(value: unknown): ProctorReportReview {
  return typeof value === 'string' && REVIEW_VALUES.has(value)
    ? value as ProctorReportReview
    : 'all'
}

export function parseProctorReportFilters(
  params: Record<string, string | string[] | undefined>,
): ProctorReportFilters {
  const student = scalarParam(params, 'student')
  const submission = scalarParam(params, 'submission')

  return {
    studentId: isUuid(student) ? student.toLowerCase() : null,
    submissionId: isUuid(submission) ? submission.toLowerCase() : null,
    kind: normalizeKind(scalarParam(params, 'kind')),
    review: normalizeReview(scalarParam(params, 'review')),
    page: normalizePage(scalarParam(params, 'page')),
  }
}

export function hasInvalidProctorReportSearchParams(
  params: Record<string, string | string[] | undefined>,
): boolean {
  const student = params.student
  const submission = params.submission
  const kind = params.kind
  const review = params.review
  const page = params.page

  if (student !== undefined && (typeof student !== 'string' || (student !== '' && !isUuid(student)))) return true
  if (submission !== undefined && (typeof submission !== 'string' || (submission !== '' && !isUuid(submission)))) return true
  if (
    kind !== undefined
    && (typeof kind !== 'string'
      || (kind !== 'all' && kind !== 'reviewable' && !KNOWN_EVENT_TYPE_SET.has(kind)))
  ) return true
  if (review !== undefined && (typeof review !== 'string' || !REVIEW_VALUES.has(review))) return true
  if (
    page !== undefined
    && (typeof page !== 'string'
      || !/^\d+$/.test(page)
      || !Number.isSafeInteger(Number(page))
      || Number(page) < 1)
  ) return true
  return false
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** Strict JSON boundary for the sensitive POST export route. */
export function parseProctorReportExportFilters(
  value: unknown,
): ProctorReportExportFilters | null {
  if (!isPlainRecord(value)) return null
  const allowedKeys = new Set(['studentId', 'submissionId', 'kind', 'review'])
  if (
    Object.keys(value).some(key => !allowedKeys.has(key))
    || !Object.prototype.hasOwnProperty.call(value, 'studentId')
    || !Object.prototype.hasOwnProperty.call(value, 'submissionId')
    || !Object.prototype.hasOwnProperty.call(value, 'kind')
    || !Object.prototype.hasOwnProperty.call(value, 'review')
  ) return null

  const { studentId, submissionId, kind, review } = value
  if (
    (studentId !== null && !isUuid(studentId))
    || (submissionId !== null && !isUuid(submissionId))
    || (kind !== 'all' && kind !== 'reviewable'
      && (typeof kind !== 'string' || !KNOWN_EVENT_TYPE_SET.has(kind)))
    || (typeof review !== 'string' || !REVIEW_VALUES.has(review))
  ) return null

  return {
    studentId: studentId?.toLowerCase() ?? null,
    submissionId: submissionId?.toLowerCase() ?? null,
    kind: kind as ProctorReportKind,
    review: review as ProctorReportReview,
  }
}

export function isReportReviewableEvent(eventType: string): boolean {
  return REVIEWABLE_EVENT_TYPE_SET.has(eventType)
}

export function proctorReportAcknowledgementLabel(
  eventType: string,
  acknowledgedAt: string | null,
): string {
  if (acknowledgedAt) return 'รับทราบแล้ว'
  return isReportReviewableEvent(eventType) ? 'รอรับทราบ' : 'ไม่ต้องรับทราบ'
}

export function proctorReportAccessModeLabel(mode: string | null): string {
  if (mode === 'seb') return 'Safe Exam Browser'
  if (mode === 'android_monitored') return 'Android ที่ครูอนุมัติ'
  if (mode === 'browser') return 'เบราว์เซอร์ทั่วไป'
  return 'ไม่ทราบโหมดเข้าสอบ'
}

export function proctorReportStudentName(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return 'ไม่พบชื่อนักเรียน'

  let bounded = ''
  let codePoints = 0
  for (const character of trimmed) {
    if (codePoints >= STUDENT_NAME_MAX_CODEPOINTS) return `${bounded}…`
    bounded += character
    codePoints += 1
  }
  return bounded
}

function normalizeFilters(filters: ProctorReportFilters): ProctorReportFilters {
  return {
    studentId: isUuid(filters.studentId) ? filters.studentId.toLowerCase() : null,
    submissionId: isUuid(filters.submissionId) ? filters.submissionId.toLowerCase() : null,
    kind: normalizeKind(filters.kind),
    review: normalizeReview(filters.review),
    page: normalizePage(filters.page),
  }
}

function patchChangesFilter(patch: ProctorReportFilterPatch): boolean {
  return Object.prototype.hasOwnProperty.call(patch, 'studentId')
    || Object.prototype.hasOwnProperty.call(patch, 'submissionId')
    || Object.prototype.hasOwnProperty.call(patch, 'kind')
    || Object.prototype.hasOwnProperty.call(patch, 'review')
}

/**
 * Keep report URLs deterministic so filters are shareable and cache keys do
 * not vary by insertion order. Changing any filter returns to page one;
 * changing only `page` preserves the rest of the current view.
 */
export function buildProctorReportSearchParams(
  current: ProctorReportFilters,
  patch: ProctorReportFilterPatch = {},
): URLSearchParams {
  const next = normalizeFilters({
    ...current,
    ...patch,
    page: patchChangesFilter(patch) ? 1 : patch.page ?? current.page,
  })
  const params = new URLSearchParams()

  // Do not reorder these: stable output is useful for shareable report URLs.
  if (next.studentId) params.set('student', next.studentId)
  if (next.submissionId) params.set('submission', next.submissionId)
  if (next.kind !== 'reviewable') params.set('kind', next.kind)
  if (next.review !== 'all') params.set('review', next.review)
  if (next.page > 1) params.set('page', String(next.page))

  return params
}

export function buildProctorReportHref(
  pathname: string,
  current: ProctorReportFilters,
  patch: ProctorReportFilterPatch = {},
): string {
  const query = buildProctorReportSearchParams(current, patch).toString()
  return query ? `${pathname}?${query}` : pathname
}

export interface ProctorReportEventSource {
  eventId: number
  studentName: string
  attemptNumber: number | null
  accessMode: string | null
  eventType: string
  createdAt: string
  occurredAtClient: string | null
  acknowledgedAt: string | null
}

export interface ProctorReportEventRow {
  eventId: number | null
  studentName: string
  attemptNumber: number | null
  accessMode: string
  eventType: string
  eventLabel: string
  serverTimestamp: string
  clientTimestampUntrusted: string
  acknowledgementStatus: string
  acknowledgedAt: string
}

export function compareProctorReportEventRowsNewestFirst(
  left: Pick<ProctorReportEventRow, 'eventId' | 'serverTimestamp'>,
  right: Pick<ProctorReportEventRow, 'eventId' | 'serverTimestamp'>,
): number {
  const leftTime = Date.parse(left.serverTimestamp)
  const rightTime = Date.parse(right.serverTimestamp)
  const timeDifference = (Number.isFinite(rightTime) ? rightTime : 0)
    - (Number.isFinite(leftTime) ? leftTime : 0)
  if (timeDifference !== 0) return timeDifference
  return (right.eventId ?? 0) - (left.eventId ?? 0)
}

function normalizeTimestamp(value: string | null): string {
  if (!value) return ''
  const timestamp = new Date(value)
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : ''
}

/**
 * Map an authorized database row into the only event shape that may leave the
 * report boundary. Student/submission/client IDs and answer/score data are not
 * accepted by the contract, so object spreading cannot add them to a CSV.
 */
export function mapProctorReportEventRow(
  source: ProctorReportEventSource,
): ProctorReportEventRow {
  return {
    eventId: Number.isSafeInteger(source.eventId) && source.eventId > 0
      ? source.eventId
      : null,
    studentName: proctorReportStudentName(source.studentName),
    attemptNumber: Number.isSafeInteger(source.attemptNumber) && (source.attemptNumber ?? 0) > 0
      ? source.attemptNumber
      : null,
    accessMode: proctorReportAccessModeLabel(source.accessMode),
    eventType: source.eventType,
    eventLabel: PROCTOR_EVENT_LABELS[source.eventType] ?? 'ไม่ทราบชนิดเหตุการณ์',
    serverTimestamp: normalizeTimestamp(source.createdAt),
    clientTimestampUntrusted: normalizeTimestamp(source.occurredAtClient),
    acknowledgementStatus: proctorReportAcknowledgementLabel(
      source.eventType,
      source.acknowledgedAt,
    ),
    acknowledgedAt: normalizeTimestamp(source.acknowledgedAt),
  }
}

export const PROCTOR_REPORT_CSV_COLUMNS = [
  'รหัสอ้างอิงเหตุการณ์',
  'ชื่อนักเรียน',
  'ครั้งที่ทำ',
  'โหมดเข้าสอบ',
  'ประเภทเหตุการณ์ (รหัสระบบ)',
  'เหตุการณ์',
  'เวลาที่ระบบบันทึก (ยืนยันโดยระบบ)',
  'เวลาจากเครื่องนักเรียน (ไม่ใช่เวลาที่ยืนยัน)',
  'สถานะการรับทราบ',
  'เวลารับทราบ',
] as const

type CsvCell = string | number | null

const CSV_FORMULA_PREFIX = new Set(['=', '+', '-', '@'])
const CSV_CANDIDATE_SEPARATORS = new Set([',', ';', '\t', '\r', '\n'])
const LEADING_IGNORABLE_PATTERN = /[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u

function isCsvFormulaPrefix(value: string | undefined): boolean {
  if (!value) return false
  return CSV_FORMULA_PREFIX.has(value.normalize('NFKC'))
}

function neutralizeCsvFormula(value: string): string {
  const cleaned = value.replace(/\0/g, '')
  const candidateStarts = [0]
  for (let index = 0; index < cleaned.length; index += 1) {
    if (CSV_CANDIDATE_SEPARATORS.has(cleaned[index])) {
      candidateStarts.push(index + 1)
    }
  }

  const apostrophePositions = new Set<number>()
  for (const start of candidateStarts) {
    let firstMeaningful = start
    while (
      firstMeaningful < cleaned.length
      && LEADING_IGNORABLE_PATTERN.test(cleaned[firstMeaningful])
    ) {
      firstMeaningful += 1
    }
    if (isCsvFormulaPrefix(cleaned[firstMeaningful])) {
      apostrophePositions.add(start)
    }
  }

  if (apostrophePositions.size === 0) return cleaned
  let neutralized = ''
  for (let index = 0; index <= cleaned.length; index += 1) {
    if (apostrophePositions.has(index)) neutralized += "'"
    if (index < cleaned.length) neutralized += cleaned[index]
  }
  return neutralized
}

function csvCell(value: CsvCell): string {
  if (value === null) return ''
  if (typeof value === 'string' && value.length > CSV_CELL_MAX_UTF16_UNITS) {
    throw new RangeError(`proctor report CSV cell exceeds ${CSV_CELL_MAX_UTF16_UNITS} UTF-16 units`)
  }
  const raw = typeof value === 'number'
    ? Number.isFinite(value) ? String(value) : ''
    : neutralizeCsvFormula(value)
  return /[",;\t\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw
}

function csvValues(row: ProctorReportEventRow): CsvCell[] {
  return [
    row.eventId,
    row.studentName,
    row.attemptNumber,
    row.accessMode,
    row.eventType,
    row.eventLabel,
    row.serverTimestamp,
    row.clientTimestampUntrusted,
    row.acknowledgementStatus,
    row.acknowledgedAt,
  ]
}

/**
 * Serialize only the explicit privacy-safe report shape. The UTF-8 BOM keeps
 * Thai text readable in spreadsheet applications, while CRLF is the most
 * interoperable CSV record separator.
 */
export function serializeProctorReportCsv(rows: ProctorReportEventRow[]): string {
  if (rows.length > EXPORT_LIMIT) {
    throw new RangeError(`proctor report export exceeds ${EXPORT_LIMIT} rows`)
  }

  const encoder = new TextEncoder()
  const records: string[] = []
  let byteLength = encoder.encode('\uFEFF').byteLength
  const appendRecord = (record: string) => {
    const segment = `${record}\r\n`
    byteLength += encoder.encode(segment).byteLength
    if (byteLength > EXPORT_MAX_BYTES) {
      throw new RangeError(`proctor report export exceeds ${EXPORT_MAX_BYTES} bytes`)
    }
    records.push(segment)
  }

  appendRecord(PROCTOR_REPORT_CSV_COLUMNS.map(csvCell).join(','))
  for (const row of rows) appendRecord(csvValues(row).map(csvCell).join(','))
  return `\uFEFF${records.join('')}`
}

const INVISIBLE_FILENAME_PATTERN = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu
const UNSAFE_FILENAME_PATTERN = /[/\\?%*:|"<>]/gu
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
const MAX_FILENAME_STEM_CODEPOINTS = 120

/** Return a portable CSV filename, retaining Thai assignment titles. */
export function sanitizeProctorReportFilename(value: string): string {
  let stem = value
    .normalize('NFKC')
    .replace(INVISIBLE_FILENAME_PATTERN, '')
    .replace(UNSAFE_FILENAME_PATTERN, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/^\.+|[. ]+$/gu, '')
    .trim()
    .replace(/\.csv$/i, '')
    .replace(/[. ]+$/gu, '')

  stem = [...stem].slice(0, MAX_FILENAME_STEM_CODEPOINTS).join('').replace(/[. ]+$/gu, '')
  if (!stem || stem === '.' || stem === '..' || WINDOWS_RESERVED_NAME.test(stem)) {
    stem = 'proctor-report'
  }
  return `${stem}.csv`
}

/** Keep the trusted generation time visible even when the title is very long. */
export function buildProctorReportFilename(
  assignmentTitle: string,
  exportedAt: string,
): string {
  const parsedTimestamp = new Date(exportedAt)
  const timestamp = Number.isFinite(parsedTimestamp.getTime())
    ? parsedTimestamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
    : 'unknown-time'
  return sanitizeProctorReportFilename(
    `หลักฐานคุมสอบ-${timestamp}-${assignmentTitle}`,
  )
}

/** Encode a sanitized UTF-8 filename for Content-Disposition filename*. */
export function encodeRfc5987Filename(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, character => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ))
}

const FALLBACK_REPORT_FILENAME = 'KorKru-proctor-report.csv'

/** Parse only the encoded filename emitted by the same-origin export route. */
export function proctorReportFilenameFromDisposition(disposition: string | null): string {
  const rawValue = disposition
    ?.match(/(?:^|;)\s*filename\*\s*=\s*([^;]+)/i)?.[1]
    ?.trim()
    .replace(/^"|"$/g, '')
  const encodedName = rawValue?.match(/^UTF-8'[^']*'(.+)$/i)?.[1]
  if (!encodedName) return FALLBACK_REPORT_FILENAME

  try {
    const decodedName = decodeURIComponent(encodedName)
    if ([...decodedName].length > MAX_FILENAME_STEM_CODEPOINTS + 4) {
      return FALLBACK_REPORT_FILENAME
    }
    return sanitizeProctorReportFilename(decodedName) === decodedName
      ? decodedName
      : FALLBACK_REPORT_FILENAME
  } catch {
    return FALLBACK_REPORT_FILENAME
  }
}
