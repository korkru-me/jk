import { describe, expect, it } from 'vitest'
import { summarizeIocForm, type IocRatingInput } from '@/lib/ioc'
import {
  buildIocSummaryParagraph,
  isIocSummaryTextStale,
  joinThaiList,
} from '@/lib/ioc-summary'

const HEADER = {
  exam_title: 'แบบทดสอบวัดผลสัมฤทธิ์ กลางภาคเรียนที่ 2',
  subject_name: 'คณิตศาสตร์พื้นฐาน 6',
  grade_level: 'มัธยมศึกษาปีที่ 6',
}

const EXPERTS = ['expert-1', 'expert-2', 'expert-3']

/** The same eleven items the mockups and lib/ioc.test.ts are drawn from. */
const WORKED_EXAMPLE: Record<string, [number, number, number]> = {
  'item-1': [1, 1, 1],
  'item-2': [1, 1, 1],
  'item-3': [1, 1, 0],
  'item-4': [1, 0, -1],
  'item-5': [1, 1, 1],
  'item-6': [1, 1, 0],
  'item-7': [1, 1, 1],
  'item-8': [1, 1, 1],
  'item-9': [1, 0, 0],
  'item-10': [1, 1, 0],
  'item-11': [1, 1, 1],
}

function ratings(source: Record<string, number[]>): IocRatingInput[] {
  return Object.entries(source).flatMap(([itemId, scores]) =>
    scores.map((score, index) => ({ expertId: EXPERTS[index], itemId, score })),
  )
}

describe('joinThaiList', () => {
  it('joins the way a Thai sentence lists things', () => {
    expect(joinThaiList([])).toBe('')
    expect(joinThaiList(['ข้อ 4'])).toBe('ข้อ 4')
    expect(joinThaiList(['ข้อ 4', 'ข้อ 9'])).toBe('ข้อ 4 และ ข้อ 9')
    expect(joinThaiList(['ข้อ 1', 'ข้อ 4', 'ข้อ 9'])).toBe('ข้อ 1, ข้อ 4 และ ข้อ 9')
  })
})

describe('buildIocSummaryParagraph', () => {
  it('quotes the same figures the table shows', () => {
    const summary = summarizeIocForm({
      itemIds: Object.keys(WORKED_EXAMPLE),
      submittedExpertIds: EXPERTS,
      ratings: ratings(WORKED_EXAMPLE),
    })

    const paragraph = buildIocSummaryParagraph({
      header: HEADER,
      summary,
      failedLabels: ['4', '9'],
    })

    expect(paragraph).toContain('9 จาก 11 ข้อ')
    expect(paragraph).toContain('81.82')
    expect(paragraph).toContain('จำนวน 2 ข้อ ได้แก่ ข้อ 4 และ ข้อ 9')
    expect(paragraph).toContain('คณิตศาสตร์พื้นฐาน 6')
    expect(paragraph).toContain('ชั้นมัธยมศึกษาปีที่ 6')
  })

  it('reads as a clean pass when nothing fell below the threshold', () => {
    const allPass = Object.fromEntries(
      Object.keys(WORKED_EXAMPLE).map(itemId => [itemId, [1, 1, 1]]),
    )
    const summary = summarizeIocForm({
      itemIds: Object.keys(allPass),
      submittedExpertIds: EXPERTS,
      ratings: ratings(allPass),
    })

    const paragraph = buildIocSummaryParagraph({ header: HEADER, summary, failedLabels: [] })
    expect(paragraph).toContain('ครบทั้ง 11 ข้อ')
    expect(paragraph).toContain('100.00')
    expect(paragraph).not.toContain('ปรับปรุง')
  })

  it('says nothing at all before anyone has judged the form', () => {
    const summary = summarizeIocForm({
      itemIds: ['item-1'],
      submittedExpertIds: [],
      ratings: [],
    })
    expect(buildIocSummaryParagraph({ header: HEADER, summary, failedLabels: [] })).toBe('')
  })

  it('drops the subject and grade clauses a form did not fill in', () => {
    const summary = summarizeIocForm({
      itemIds: ['item-1'],
      submittedExpertIds: EXPERTS,
      ratings: ratings({ 'item-1': [1, 1, 1] }),
    })

    const paragraph = buildIocSummaryParagraph({
      header: { exam_title: 'ข้อสอบปลายภาค', subject_name: '', grade_level: '' },
      summary,
      failedLabels: [],
    })

    expect(paragraph).toContain('ข้อสอบปลายภาค')
    expect(paragraph).not.toContain('รายวิชา')
    expect(paragraph).not.toContain('ชั้น')
  })
})

describe('isIocSummaryTextStale', () => {
  it('flags wording written before the latest rating landed', () => {
    expect(isIocSummaryTextStale('2026-09-13T10:00:00Z', '2026-09-13T11:00:00Z')).toBe(true)
  })

  it('leaves wording alone when nothing changed after it', () => {
    expect(isIocSummaryTextStale('2026-09-13T12:00:00Z', '2026-09-13T11:00:00Z')).toBe(false)
    expect(isIocSummaryTextStale(null, '2026-09-13T11:00:00Z')).toBe(false)
    expect(isIocSummaryTextStale('2026-09-13T12:00:00Z', null)).toBe(false)
  })
})
