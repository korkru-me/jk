import { describe, expect, it } from 'vitest'
import {
  assignmentLateScheduleEquals,
  classifySubmissionTiming,
  firstCompletedSubmissionAt,
  normalizeAssignmentLateSchedule,
  type AssignmentLateBand,
} from './late-submission'

const DUE = '2026-10-07T09:00:00.000Z'
const CLOSE = '2026-10-10T09:00:00.000Z'
const BAND_ONE_ID = '11111111-1111-4111-8111-111111111111'
const BAND_TWO_ID = '22222222-2222-4222-8222-222222222222'

const bands: AssignmentLateBand[] = [
  { id: BAND_ONE_ID, starts_at: DUE, label: 'ส่งช้าไม่เกิน 1 วัน', color: 'amber' },
  { id: BAND_TWO_ID, starts_at: '2026-10-08T09:00:00.000Z', label: 'ส่งช้าเกิน 1 วัน', color: 'red' },
]

describe('normalizeAssignmentLateSchedule', () => {
  it('keeps legacy assignments unconfigured', () => {
    expect(normalizeAssignmentLateSchedule({ dueAt: null, endAt: CLOSE, bands: [] }))
      .toEqual({ value: { dueAt: null, bands: [] } })
  })

  it('canonicalizes timestamps and preserves repeated colours for bulk filters', () => {
    const result = normalizeAssignmentLateSchedule({
      dueAt: '2026-10-07T16:00:00+07:00',
      endAt: '2026-10-10T16:00:00+07:00',
      bands: [
        { id: BAND_ONE_ID, starts_at: '2026-10-07T16:00:00+07:00', label: '  ช้าช่วงแรก  ', color: 'amber' },
        { id: BAND_TWO_ID, starts_at: '2026-10-08T16:00:00+07:00', label: 'ช้าช่วงถัดไป', color: 'amber' },
      ],
    })
    expect(result).toEqual({
      value: {
        dueAt: DUE,
        bands: [
          { id: BAND_ONE_ID, starts_at: DUE, label: 'ช้าช่วงแรก', color: 'amber' },
          { id: BAND_TWO_ID, starts_at: '2026-10-08T09:00:00.000Z', label: 'ช้าช่วงถัดไป', color: 'amber' },
        ],
      },
    })
  })

  it('rejects a policy without a hard close or first band at the due instant', () => {
    expect(normalizeAssignmentLateSchedule({ dueAt: DUE, endAt: null, bands })).toEqual({
      error: 'ต้องกำหนดวันปิดรับเมื่อเปิดใช้ช่วงสีส่งช้า',
    })
    expect(normalizeAssignmentLateSchedule({
      dueAt: DUE,
      endAt: CLOSE,
      bands: [{ ...bands[0], starts_at: '2026-10-07T10:00:00.000Z' }],
    })).toEqual({ error: 'ช่วงสีแรกต้องเริ่มตรงกับวันส่ง' })
  })

  it('rejects unordered, duplicate, invalid-colour and out-of-range bands', () => {
    expect(normalizeAssignmentLateSchedule({
      dueAt: DUE,
      endAt: CLOSE,
      bands: [bands[0], { ...bands[1], starts_at: DUE }],
    })).toEqual({ error: 'ช่วงสีส่งช้าต้องเรียงเวลาและห้ามมีเวลาเดียวกัน' })
    expect(normalizeAssignmentLateSchedule({
      dueAt: DUE,
      endAt: CLOSE,
      bands: [bands[0], { ...bands[1], id: BAND_ONE_ID }],
    })).toEqual({ error: 'รหัสช่วงสีส่งช้าไม่ถูกต้องหรือซ้ำกัน' })
    expect(normalizeAssignmentLateSchedule({
      dueAt: DUE,
      endAt: CLOSE,
      bands: [{ ...bands[0], color: 'pink' as never }],
    })).toEqual({ error: 'สีของช่วงส่งช้าไม่ถูกต้อง' })
    expect(normalizeAssignmentLateSchedule({
      dueAt: DUE,
      endAt: CLOSE,
      bands: [bands[0], { ...bands[1], starts_at: CLOSE }],
    })).toEqual({ error: 'ช่วงสีส่งช้าต้องเริ่มก่อนวันปิดรับ' })
  })
})

describe('firstCompletedSubmissionAt', () => {
  it('uses the first finished attempt so a retry never makes an on-time student late', () => {
    expect(firstCompletedSubmissionAt([
      { status: 'in_progress', submitted_at: null },
      { status: 'graded', submitted_at: '2026-10-09T09:00:00.000Z' },
      { status: 'submitted', submitted_at: '2026-10-07T08:59:00.000Z' },
    ])).toBe('2026-10-07T08:59:00.000Z')
  })
})

describe('assignmentLateScheduleEquals', () => {
  it('compares instants and JSON values rather than object key order or timezone spelling', () => {
    expect(assignmentLateScheduleEquals(
      { dueAt: DUE, bands },
      {
        dueAt: '2026-10-07T16:00:00+07:00',
        bands: bands.map(band => ({
          color: band.color,
          label: band.label,
          starts_at: band.starts_at.replace('.000Z', '+00:00'),
          id: band.id.toUpperCase(),
        })),
      },
    )).toBe(true)
  })
})

describe('classifySubmissionTiming', () => {
  it('treats the exact due instant as on time and a moment after as late', () => {
    expect(classifySubmissionTiming({ dueAt: DUE, endAt: CLOSE, bands, submittedAt: DUE }).status)
      .toBe('on_time')
    const late = classifySubmissionTiming({
      dueAt: DUE,
      endAt: CLOSE,
      bands,
      submittedAt: '2026-10-07T09:00:00.001Z',
    })
    expect(late).toMatchObject({ status: 'late', band: { id: BAND_ONE_ID, color: 'amber' } })
  })

  it('keeps an exact later transition in the previous band', () => {
    expect(classifySubmissionTiming({
      dueAt: DUE,
      endAt: CLOSE,
      bands,
      submittedAt: bands[1].starts_at,
    })).toMatchObject({ status: 'late', band: { id: BAND_ONE_ID } })
    expect(classifySubmissionTiming({
      dueAt: DUE,
      endAt: CLOSE,
      bands,
      submittedAt: '2026-10-08T09:00:00.001Z',
    })).toMatchObject({ status: 'late', band: { id: BAND_TWO_ID } })
  })

  it('shifts every band with a personal due extension', () => {
    const timing = classifySubmissionTiming({
      dueAt: DUE,
      endAt: CLOSE,
      bands,
      submittedAt: '2026-10-09T10:00:00.000Z',
      extendedDueAt: '2026-10-08T09:00:00.000Z',
      extendedEndAt: '2026-10-11T09:00:00.000Z',
    })
    expect(timing).toMatchObject({
      status: 'late',
      effectiveDueAt: '2026-10-08T09:00:00.000Z',
      band: { id: BAND_TWO_ID, starts_at: '2026-10-09T09:00:00.000Z' },
    })
  })

  it('treats a legacy one-timestamp extension as on time through its close', () => {
    expect(classifySubmissionTiming({
      dueAt: DUE,
      endAt: CLOSE,
      bands,
      submittedAt: '2026-10-11T09:00:00.000Z',
      extendedEndAt: '2026-10-11T09:00:00.000Z',
    }).status).toBe('on_time')
  })

  it('marks impossible stored submissions after the hard close separately', () => {
    expect(classifySubmissionTiming({
      dueAt: DUE,
      endAt: CLOSE,
      bands,
      submittedAt: '2026-10-10T09:00:00.001Z',
    })).toMatchObject({ status: 'after_close', effectiveEndAt: CLOSE })
  })

  it('leaves historical assignments without a due policy unclassified', () => {
    expect(classifySubmissionTiming({
      dueAt: null,
      endAt: CLOSE,
      bands: [],
      submittedAt: DUE,
    }).status).toBe('unclassified')
  })
})
