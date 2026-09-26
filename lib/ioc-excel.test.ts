import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  buildIocSummaryWorkbook,
  IocExcelError,
  iocSummaryWorkbookFileName,
  type BuildIocSummaryWorkbookInput,
} from '@/lib/ioc-excel'

function input(overrides: Partial<BuildIocSummaryWorkbookInput> = {}): BuildIocSummaryWorkbookInput {
  return {
    examTitle: 'แบบทดสอบวัดผลสัมฤทธิ์ กลางภาคเรียนที่ 2',
    subjectLine: 'รายวิชาคณิตศาสตร์พื้นฐาน 6 รหัสวิชา ค 33102',
    schoolName: 'โรงเรียนราชประชานุเคราะห์ 15',
    authorName: 'นางสาววัชราภรณ์ ต๊ะพรมมา',
    expertNames: ['มณีรัตน์ กันทะดง', 'อัญชรา มูลศรี', 'ปรียา พงศาปาน'],
    threshold: 0.5,
    percentRuleLabel: 'จำนวนข้อที่ผ่านเกณฑ์',
    percent: 81.8181,
    passedCount: 9,
    itemCount: 11,
    rows: [
      {
        itemLabel: '1',
        standardLabel: 'ค 3.1 ม.6/1',
        agree: 3,
        unsure: 0,
        disagree: 0,
        index: 1,
        passed: true,
        comments: [],
      },
      {
        itemLabel: '4',
        standardLabel: 'ค 3.1 ม.6/1',
        agree: 1,
        unsure: 1,
        disagree: 1,
        index: 0,
        passed: false,
        comments: ['ผู้ประเมินคนที่ 2: โจทย์ยังไม่พอหาคำตอบเดียว'],
      },
      {
        itemLabel: '11',
        standardLabel: 'ค 3.1 ม.6/1',
        agree: 0,
        unsure: 0,
        disagree: 0,
        index: null,
        passed: null,
        comments: [],
      },
    ],
    generatedAt: new Date('2026-09-14T03:00:00.000Z'),
    ...overrides,
  }
}

async function readBack(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  return workbook.worksheets[0]
}

describe('buildIocSummaryWorkbook', () => {
  it('writes the heading a report needs before the table', async () => {
    const sheet = await readBack(await buildIocSummaryWorkbook(input()))
    const headingText = [1, 2, 3, 4, 5, 6, 7]
      .map(row => String(sheet.getRow(row).getCell(1).value ?? ''))
      .join(' | ')

    expect(headingText).toContain('แบบทดสอบวัดผลสัมฤทธิ์ กลางภาคเรียนที่ 2')
    expect(headingText).toContain('โรงเรียนราชประชานุเคราะห์ 15')
    expect(headingText).toContain('ผู้ประเมิน 3 ท่าน')
    expect(headingText).toContain('81.82')
    expect(headingText).toContain('ผ่านเกณฑ์ 9 จาก 11 ข้อ')
    expect(headingText).toContain('เกณฑ์ 0.50')
  })

  it('carries each item with its counts, index and verdict', async () => {
    const sheet = await readBack(await buildIocSummaryWorkbook(input()))
    const firstRow = sheet.getRow(9)
    expect(firstRow.getCell(1).value).toBe('1')
    expect(firstRow.getCell(3).value).toBe(3)
    expect(firstRow.getCell(6).value).toBe(1)
    expect(firstRow.getCell(7).value).toBe('ผ่าน')

    const failing = sheet.getRow(10)
    expect(failing.getCell(6).value).toBe(0)
    expect(failing.getCell(7).value).toBe('ต่ำกว่าเกณฑ์')
    expect(String(failing.getCell(8).value)).toContain('ผู้ประเมินคนที่ 2')
  })

  it('leaves an unjudged item blank rather than writing a zero', async () => {
    const sheet = await readBack(await buildIocSummaryWorkbook(input()))
    const unjudged = sheet.getRow(11)
    expect(unjudged.getCell(6).value).toBe('')
    expect(unjudged.getCell(7).value).toBe('ยังไม่มีผล')
  })

  // Vercel builds this file in UTC; 03:00 UTC must still read as 10:00 in Thailand.
  it('stamps the Thai time it was made, even on a UTC server', async () => {
    const previous = process.env.TZ
    process.env.TZ = 'UTC'
    try {
      const sheet = await readBack(await buildIocSummaryWorkbook(input()))
      expect(String(sheet.getRow(sheet.rowCount).getCell(1).value))
        .toContain('ออกจาก KorKru เมื่อ 14 กันยายน 2569 เวลา 10:00')
    } finally {
      if (previous === undefined) delete process.env.TZ
      else process.env.TZ = previous
    }
  })

  it('refuses a form with nothing to summarize', async () => {
    await expect(buildIocSummaryWorkbook(input({ rows: [] }))).rejects.toThrow(IocExcelError)
  })
})

describe('iocSummaryWorkbookFileName', () => {
  it('keeps the exam name and the date, and drops what a filesystem refuses', () => {
    const name = iocSummaryWorkbookFileName('ข้อสอบ/กลางภาค: 2/2569', new Date('2026-09-14T00:00:00Z'))
    // The slash becomes a space, so "2/2569" does not come out as "22569".
    expect(name).toBe('IOC-สรุปผล-ข้อสอบ กลางภาค 2 2569-2026-09-14.xlsx')
  })

  it('falls back to a usable name when the title is empty', () => {
    expect(iocSummaryWorkbookFileName('   ', new Date('2026-09-14T00:00:00Z')))
      .toBe('IOC-สรุปผล-IOC-2026-09-14.xlsx')
  })
})
