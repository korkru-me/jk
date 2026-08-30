import { describe, expect, it } from 'vitest'
import { PROCTOR_EVENT_LABELS, PROCTOR_REVIEW_EVENT_TYPES } from './exam-proctor-alerts'
import {
  ATTEMPT_LIMIT,
  EXPORT_LIMIT,
  EXPORT_MAX_BYTES,
  KNOWN_EVENT_TYPES,
  MAX_PAGE,
  PAGE_SIZE,
  PROCTOR_REPORT_CSV_COLUMNS,
  STUDENT_NAME_MAX_CODEPOINTS,
  buildProctorReportFilename,
  buildProctorReportHref,
  buildProctorReportSearchParams,
  compareProctorReportEventRowsNewestFirst,
  encodeRfc5987Filename,
  isReportReviewableEvent,
  isUuid,
  hasInvalidProctorReportSearchParams,
  mapProctorReportEventRow,
  parseProctorReportExportFilters,
  parseProctorReportFilters,
  proctorReportAccessModeLabel,
  proctorReportAcknowledgementLabel,
  proctorReportStudentName,
  proctorReportFilenameFromDisposition,
  sanitizeProctorReportFilename,
  serializeProctorReportCsv,
  type ProctorReportEventRow,
  type ProctorReportFilters,
} from './exam-proctor-report'

const STUDENT_ID = 'd8f57df1-7fbf-4ac3-86ec-d384045838c3'
const SUBMISSION_ID = '1de7655d-2c4c-42a6-8340-0813cc098c62'

function mappedRow(overrides: Partial<ProctorReportEventRow> = {}): ProctorReportEventRow {
  return {
    eventId: 919,
    studentName: 'เด็กชายทดสอบ',
    attemptNumber: 1,
    accessMode: 'Safe Exam Browser',
    eventType: 'tab_hidden',
    eventLabel: 'ออกจากแท็บข้อสอบ',
    serverTimestamp: '2026-08-30T08:00:00.000Z',
    clientTimestampUntrusted: '2026-08-30T07:59:59.000Z',
    acknowledgementStatus: 'รอรับทราบ',
    acknowledgedAt: '',
    ...overrides,
  }
}

describe('proctor report boundaries', () => {
  it('publishes bounded page and export limits', () => {
    expect(PAGE_SIZE).toBe(50)
    expect(EXPORT_LIMIT).toBe(10_000)
    expect(EXPORT_MAX_BYTES).toBe(4 * 1024 * 1024)
    expect(MAX_PAGE).toBeGreaterThan(1)
    expect(ATTEMPT_LIMIT).toBe(2_000)
  })

  it('accepts canonical UUIDs and rejects malformed identifiers', () => {
    expect(isUuid(STUDENT_ID)).toBe(true)
    expect(isUuid(STUDENT_ID.toUpperCase())).toBe(true)
    expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(false)
    expect(isUuid('d8f57df1-7fbf-9ac3-86ec-d384045838c3')).toBe(false)
    expect(isUuid(`${STUDENT_ID}?student=other`)).toBe(false)
    expect(isUuid(null)).toBe(false)
  })
})

describe('parseProctorReportFilters', () => {
  it('parses only allowlisted filters', () => {
    expect(parseProctorReportFilters({
      student: STUDENT_ID,
      submission: SUBMISSION_ID,
      kind: 'concurrent_connection',
      review: 'acknowledged',
      page: '12',
    })).toEqual({
      studentId: STUDENT_ID,
      submissionId: SUBMISSION_ID,
      kind: 'concurrent_connection',
      review: 'acknowledged',
      page: 12,
    })

    for (const eventType of KNOWN_EVENT_TYPES) {
      expect(parseProctorReportFilters({ kind: eventType }).kind).toBe(eventType)
    }
  })

  it('falls back safely for arrays, unknown values, and non-integer pages', () => {
    expect(parseProctorReportFilters({
      student: [STUDENT_ID],
      submission: 'not-a-uuid',
      kind: 'camera_photo',
      review: 'cheating',
      page: '2.5',
    })).toEqual({
      studentId: null,
      submissionId: null,
      kind: 'reviewable',
      review: 'all',
      page: 1,
    })
    expect(parseProctorReportFilters({ page: '-1' }).page).toBe(1)
    expect(parseProctorReportFilters({ page: '0' }).page).toBe(1)
    expect(parseProctorReportFilters({ page: '1e3' }).page).toBe(1)
    expect(parseProctorReportFilters({ page: '999999999999999999999' }).page).toBe(1)
    expect(parseProctorReportFilters({ page: String(MAX_PAGE + 1) }).page).toBe(MAX_PAGE)
  })

  it('normalizes accepted uppercase identifiers and detects unsafe URL filters', () => {
    expect(parseProctorReportFilters({
      student: STUDENT_ID.toUpperCase(),
      submission: SUBMISSION_ID.toUpperCase(),
    })).toMatchObject({ studentId: STUDENT_ID, submissionId: SUBMISSION_ID })
    expect(hasInvalidProctorReportSearchParams({ student: 'not-a-uuid' })).toBe(true)
    expect(hasInvalidProctorReportSearchParams({ kind: ['reviewable'] })).toBe(true)
    expect(hasInvalidProctorReportSearchParams({ review: 'verdict' })).toBe(true)
    expect(hasInvalidProctorReportSearchParams({ page: '-1' })).toBe(true)
    expect(hasInvalidProctorReportSearchParams({ page: String(MAX_PAGE + 1) })).toBe(false)
    expect(hasInvalidProctorReportSearchParams({ student: '', kind: 'all', review: 'all' })).toBe(false)
  })
})

describe('parseProctorReportExportFilters', () => {
  it('accepts only the complete strict JSON export shape', () => {
    expect(parseProctorReportExportFilters({
      studentId: STUDENT_ID,
      submissionId: SUBMISSION_ID,
      kind: 'reviewable',
      review: 'pending',
    })).toEqual({
      studentId: STUDENT_ID,
      submissionId: SUBMISSION_ID,
      kind: 'reviewable',
      review: 'pending',
    })
  })

  it('normalizes uppercase UUIDs in the JSON export boundary', () => {
    expect(parseProctorReportExportFilters({
      studentId: STUDENT_ID.toUpperCase(),
      submissionId: SUBMISSION_ID.toUpperCase(),
      kind: 'all',
      review: 'all',
    })).toMatchObject({ studentId: STUDENT_ID, submissionId: SUBMISSION_ID })
  })

  it.each([
    null,
    [],
    { studentId: null, submissionId: null, kind: 'reviewable' },
    { studentId: null, submissionId: null, kind: 'camera_photo', review: 'all' },
    { studentId: 'not-a-uuid', submissionId: null, kind: 'all', review: 'all' },
    { studentId: null, submissionId: null, kind: 'all', review: 'all', page: 2 },
  ])('rejects an invalid or expanded export body %#', value => {
    expect(parseProctorReportExportFilters(value)).toBeNull()
  })
})

describe('report labels', () => {
  it('keeps filter, review, and display allowlists in sync', () => {
    for (const eventType of KNOWN_EVENT_TYPES) {
      expect(PROCTOR_EVENT_LABELS[eventType]?.trim()).toBeTruthy()
    }
    for (const eventType of PROCTOR_REVIEW_EVENT_TYPES) {
      expect(KNOWN_EVENT_TYPES).toContain(eventType)
    }
  })

  it('distinguishes reviewable evidence from lifecycle context without a verdict', () => {
    expect(isReportReviewableEvent('tab_hidden')).toBe(true)
    expect(isReportReviewableEvent('concurrent_connection')).toBe(true)
    expect(isReportReviewableEvent('tab_visible')).toBe(false)
    expect(proctorReportAcknowledgementLabel('tab_hidden', null)).toBe('รอรับทราบ')
    expect(proctorReportAcknowledgementLabel('tab_visible', null)).toBe('ไม่ต้องรับทราบ')
    expect(proctorReportAcknowledgementLabel(
      'tab_hidden',
      '2026-08-30T08:01:00.000Z',
    )).toBe('รับทราบแล้ว')
  })

  it('uses neutral access-mode labels', () => {
    expect(proctorReportAccessModeLabel('browser')).toBe('เบราว์เซอร์ทั่วไป')
    expect(proctorReportAccessModeLabel('seb')).toBe('Safe Exam Browser')
    expect(proctorReportAccessModeLabel('android_monitored')).toBe('Android ที่ครูอนุมัติ')
    expect(proctorReportAccessModeLabel('future-mode')).toBe('ไม่ทราบโหมดเข้าสอบ')
    expect(proctorReportAccessModeLabel(null)).toBe('ไม่ทราบโหมดเข้าสอบ')
  })

  it('bounds names without splitting code points', () => {
    const bounded = proctorReportStudentName(`  ${'🧪'.repeat(STUDENT_NAME_MAX_CODEPOINTS + 5)}  `)
    expect([...bounded]).toHaveLength(STUDENT_NAME_MAX_CODEPOINTS + 1)
    expect(bounded.endsWith('…')).toBe(true)
    expect(proctorReportStudentName('   ')).toBe('ไม่พบชื่อนักเรียน')
  })
})

describe('event ordering', () => {
  it('sorts by authoritative server time then stable event ID, newest first', () => {
    const rows = [
      mappedRow({ eventId: 99, serverTimestamp: '2026-08-30T08:00:00.000Z' }),
      mappedRow({ eventId: 2, serverTimestamp: '2026-08-30T09:00:00.000Z' }),
      mappedRow({ eventId: 3, serverTimestamp: '2026-08-30T09:00:00.000Z' }),
    ]
    expect(rows.sort(compareProctorReportEventRowsNewestFirst).map(row => row.eventId)).toEqual([3, 2, 99])
  })
})

describe('report URL builders', () => {
  const filters: ProctorReportFilters = {
    studentId: STUDENT_ID,
    submissionId: SUBMISSION_ID,
    kind: 'screenshot_key',
    review: 'pending',
    page: 8,
  }

  it('emits query parameters in a stable order and resets pages on filter changes', () => {
    expect(buildProctorReportSearchParams(filters).toString()).toBe(
      `student=${STUDENT_ID}&submission=${SUBMISSION_ID}&kind=screenshot_key&review=pending&page=8`,
    )
    expect(buildProctorReportSearchParams(filters, { review: 'acknowledged' }).toString()).toBe(
      `student=${STUDENT_ID}&submission=${SUBMISSION_ID}&kind=screenshot_key&review=acknowledged`,
    )
  })

  it('changes pages without dropping filters and omits defaults', () => {
    expect(buildProctorReportHref('/assignments/a/proctor/report', filters, { page: 9 })).toBe(
      `/assignments/a/proctor/report?student=${STUDENT_ID}&submission=${SUBMISSION_ID}&kind=screenshot_key&review=pending&page=9`,
    )
    expect(buildProctorReportHref('/assignments/a/proctor/report', {
      studentId: null,
      submissionId: null,
      kind: 'reviewable',
      review: 'all',
      page: 1,
    })).toBe('/assignments/a/proctor/report')
  })

  it('clears nullable filters and clamps unsafe patches', () => {
    expect(buildProctorReportSearchParams(filters, {
      studentId: null,
      submissionId: null,
      page: MAX_PAGE + 50,
    }).toString()).toBe('kind=screenshot_key&review=pending')
    expect(buildProctorReportSearchParams(filters, { page: MAX_PAGE + 50 }).get('page')).toBe(
      String(MAX_PAGE),
    )
  })
})

describe('mapProctorReportEventRow', () => {
  it('maps only the privacy-safe evidence fields with an authoritative server time', () => {
    const source = {
      eventId: 919,
      studentName: '  นักเรียน ก  ',
      attemptNumber: 2,
      accessMode: 'seb',
      eventType: 'screenshot_key',
      createdAt: '2026-08-30T15:00:00+07:00',
      occurredAtClient: '2026-08-30T14:59:58+07:00',
      acknowledgedAt: '2026-08-30T15:01:00+07:00',
      // Extra internal data deliberately present at runtime must not escape.
      id: 919,
      org_id: 'secret-org',
      assignment_id: 'secret-assignment',
      student_id: STUDENT_ID,
      submission_id: SUBMISSION_ID,
      acknowledged_by: 'secret-actor',
      client_event_id: 'secret-client-event',
      score: 99,
      answer: 'secret-answer',
    }

    expect(mapProctorReportEventRow(source)).toEqual({
      eventId: 919,
      studentName: 'นักเรียน ก',
      attemptNumber: 2,
      accessMode: 'Safe Exam Browser',
      eventType: 'screenshot_key',
      eventLabel: 'กดปุ่ม Print Screen',
      serverTimestamp: '2026-08-30T08:00:00.000Z',
      clientTimestampUntrusted: '2026-08-30T07:59:58.000Z',
      acknowledgementStatus: 'รับทราบแล้ว',
      acknowledgedAt: '2026-08-30T08:01:00.000Z',
    })
    expect(Object.keys(mapProctorReportEventRow(source))).not.toEqual(expect.arrayContaining([
      'id',
      'org_id',
      'assignment_id',
      'student_id',
      'submission_id',
      'acknowledged_by',
      'client_event_id',
      'score',
      'answer',
    ]))
  })

  it('handles historical or incomplete display metadata without inventing evidence', () => {
    expect(mapProctorReportEventRow({
      studentName: '   ',
      eventId: -1,
      attemptNumber: -1,
      accessMode: null,
      eventType: 'future_event',
      createdAt: 'not-a-date',
      occurredAtClient: null,
      acknowledgedAt: null,
    })).toEqual({
      eventId: null,
      studentName: 'ไม่พบชื่อนักเรียน',
      attemptNumber: null,
      accessMode: 'ไม่ทราบโหมดเข้าสอบ',
      eventType: 'future_event',
      eventLabel: 'ไม่ทราบชนิดเหตุการณ์',
      serverTimestamp: '',
      clientTimestampUntrusted: '',
      acknowledgementStatus: 'ไม่ต้องรับทราบ',
      acknowledgedAt: '',
    })
  })
})

describe('serializeProctorReportCsv', () => {
  it('uses a UTF-8 BOM, CRLF records, fixed privacy-safe columns, and CSV escaping', () => {
    const csv = serializeProctorReportCsv([mappedRow({
      studentName: 'ด.ช. ทดสอบ, "ห้อง 1"\nบรรทัดสอง',
    })])

    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.slice(1).split('\r\n')[0]).toBe(PROCTOR_REPORT_CSV_COLUMNS.join(','))
    expect(csv).toContain('"ด.ช. ทดสอบ, ""ห้อง 1""\nบรรทัดสอง"')
    expect(csv).not.toContain('student_id')
    expect(csv).not.toContain('submission_id')
    expect(csv).not.toContain('client_event_id')
    expect(csv).toContain('\r\n919,')
  })

  it('neutralizes spreadsheet formulas after whitespace/control characters and removes NULs', () => {
    const csv = serializeProctorReportCsv([
      mappedRow({ studentName: '=1+1\0' }),
      mappedRow({ studentName: ' \t+CMD|\' /C calc' }),
      mappedRow({ studentName: '\u0001-2+3' }),
      mappedRow({ studentName: '  @IMPORTXML("https://example.invalid")' }),
    ])

    expect(csv).toContain("'=1+1")
    expect(csv).toContain("' \t'+CMD|' /C calc")
    expect(csv).toContain("'\u0001-2+3")
    expect(csv).toContain("'  @IMPORTXML")
    expect(csv).not.toContain('\0')
  })

  it('neutralizes alternate-delimiter and full-width formula injection', () => {
    const csv = serializeProctorReportCsv([
      mappedRow({ studentName: 'safe;=HYPERLINK("https://example.invalid")' }),
      mappedRow({ studentName: 'safe,\t＋1+1' }),
      mappedRow({ studentName: '＠IMPORTXML("https://example.invalid")' }),
      mappedRow({ studentName: '\u200B＝1+1' }),
    ])

    expect(csv).toContain('safe;\'=HYPERLINK')
    expect(csv).toContain("safe,'\t'＋1+1")
    expect(csv).toContain("'＠IMPORTXML")
    expect(csv).toContain("'\u200B＝1+1")
  })

  it('neutralizes signed strings while keeping real numeric cells numeric', () => {
    const csv = serializeProctorReportCsv([
      mappedRow({ studentName: '-12.5', attemptNumber: 2 }),
      mappedRow({ studentName: '+1' }),
      mappedRow({ studentName: ' -2.4e-3 ' }),
    ])
    expect(csv).toContain("\r\n919,'-12.5,")
    expect(csv).toContain("\r\n919,'+1,")
    expect(csv).toContain("\r\n919,' -2.4e-3 ,")
    expect(csv).toContain(',2,')
  })

  it('refuses exports above the row, cell, or aggregate UTF-8 byte boundary', () => {
    expect(() => serializeProctorReportCsv(
      Array.from({ length: EXPORT_LIMIT + 1 }, () => mappedRow()),
    )).toThrow(RangeError)
    expect(() => serializeProctorReportCsv([
      mappedRow({ studentName: 'ก'.repeat(2_049) }),
    ])).toThrow(RangeError)
    expect(() => serializeProctorReportCsv(
      Array.from(
        { length: EXPORT_LIMIT },
        () => mappedRow({ studentName: 'ก'.repeat(STUDENT_NAME_MAX_CODEPOINTS) }),
      ),
    )).toThrow(RangeError)

    expect(() => serializeProctorReportCsv(
      Array.from({ length: EXPORT_LIMIT }, () => mappedRow({ studentName: 'ก' })),
    )).not.toThrow()
  })
})

describe('sanitizeProctorReportFilename', () => {
  it('keeps readable Thai while removing paths, controls, bidi overrides, and duplicate extensions', () => {
    expect(sanitizeProctorReportFilename('../ข้อสอบ/ปลายภาค\0.csv')).toBe('ข้อสอบ ปลายภาค.csv')
    expect(sanitizeProctorReportFilename('รายงาน\u202Egpj.exe')).toBe('รายงานgpj.exe.csv')
    expect(sanitizeProctorReportFilename('  ห้อง  1 : วิทย์.CSV  ')).toBe('ห้อง 1 วิทย์.csv')
  })

  it('uses a portable fallback for empty and reserved filenames', () => {
    expect(sanitizeProctorReportFilename('...')).toBe('proctor-report.csv')
    expect(sanitizeProctorReportFilename('NUL')).toBe('proctor-report.csv')
    expect(sanitizeProctorReportFilename('con.txt')).toBe('proctor-report.csv')
  })

  it('bounds the filename without splitting Unicode code points', () => {
    const filename = sanitizeProctorReportFilename('🧪'.repeat(150))
    expect([...filename.replace(/\.csv$/, '')]).toHaveLength(120)
    expect(filename.endsWith('.csv')).toBe(true)
  })

  it('keeps the export timestamp when a title is longer than the filename bound', () => {
    const filename = buildProctorReportFilename(
      '🧪'.repeat(200),
      '2026-08-30T08:00:00.000Z',
    )
    expect(filename).toContain('20260830T080000Z')
    expect([...filename.replace(/\.csv$/, '')]).toHaveLength(120)
  })
})

describe('encodeRfc5987Filename', () => {
  it('encodes Thai and the RFC 5987 characters encodeURIComponent leaves behind', () => {
    const encoded = encodeRfc5987Filename("ข้อสอบ O'Brien (ปลายภาค)*.csv")
    expect(encoded).toContain('%E0%B8%82')
    expect(encoded).toContain('O%27Brien')
    expect(encoded).toContain('%28')
    expect(encoded).toContain('%29')
    expect(encoded).toContain('%2A')
    expect(encoded).not.toMatch(/[!'()*]/)
  })
})

describe('proctorReportFilenameFromDisposition', () => {
  it('keeps a valid emoji filename without slicing a surrogate pair', () => {
    const filename = `${'🧪'.repeat(100)}.csv`
    const disposition = `attachment; filename*=UTF-8''${encodeRfc5987Filename(filename)}`
    expect(proctorReportFilenameFromDisposition(disposition)).toBe(filename)
  })

  it('falls back for malformed, unsafe, or overlong encoded filenames', () => {
    expect(proctorReportFilenameFromDisposition(null)).toBe('KorKru-proctor-report.csv')
    expect(proctorReportFilenameFromDisposition("attachment; filename*=UTF-8''bad%ZZ.csv"))
      .toBe('KorKru-proctor-report.csv')
    expect(proctorReportFilenameFromDisposition(
      `attachment; filename*=UTF-8''${encodeRfc5987Filename('../spoof.csv')}`,
    )).toBe('KorKru-proctor-report.csv')
    expect(proctorReportFilenameFromDisposition(
      `attachment; filename*=UTF-8''${encodeRfc5987Filename('report\u202Egpj.csv')}`,
    )).toBe('KorKru-proctor-report.csv')
    const overlong = `${'ก'.repeat(181)}.csv`
    expect(proctorReportFilenameFromDisposition(
      `attachment; filename*=UTF-8''${encodeRfc5987Filename(overlong)}`,
    )).toBe('KorKru-proctor-report.csv')
  })
})
