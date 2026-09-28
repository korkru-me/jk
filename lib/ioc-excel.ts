/**
 * The summary table as a spreadsheet, for the teacher who has to paste it into
 * a report template their institution already uses.
 *
 * The numbers are the ones `summarizeIocForm` produced — nothing is recomputed
 * here — so a workbook and a printed page from the same form cannot disagree.
 */

import ExcelJS from 'exceljs'
import { formatThaiDateTime } from '@/lib/thai-time'

export interface IocExcelRow {
  itemLabel: string
  standardLabel: string
  agree: number
  unsure: number
  disagree: number
  index: number | null
  passed: boolean | null
  comments: string[]
}

export interface BuildIocSummaryWorkbookInput {
  examTitle: string
  subjectLine: string
  schoolName: string
  authorName: string
  expertNames: string[]
  threshold: number
  percentRuleLabel: string
  percent: number | null
  passedCount: number
  itemCount: number
  rows: IocExcelRow[]
  generatedAt?: Date
}

const HEADER_ROW = 8

export class IocExcelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IocExcelError'
  }
}

export async function buildIocSummaryWorkbook(
  input: BuildIocSummaryWorkbookInput,
): Promise<Buffer> {
  if (input.rows.length === 0) throw new IocExcelError('ฟอร์มนี้ยังไม่มีข้อสอบให้สรุป')

  const generatedAt = input.generatedAt ?? new Date()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'KorKru'
  workbook.lastModifiedBy = 'KorKru'
  workbook.created = generatedAt
  workbook.modified = generatedAt

  const sheet = workbook.addWorksheet('สรุปผล IOC', {
    views: [{ state: 'frozen', ySplit: HEADER_ROW }],
    properties: { defaultRowHeight: 20 },
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  sheet.columns = [
    { key: 'item', width: 10 },
    { key: 'standard', width: 42 },
    { key: 'agree', width: 12 },
    { key: 'unsure', width: 12 },
    { key: 'disagree', width: 14 },
    { key: 'index', width: 14 },
    { key: 'verdict', width: 14 },
    { key: 'comments', width: 52 },
  ]

  const heading = [
    ['ตารางแสดงผลการประเมินความสอดคล้อง (IOC)', ''],
    [input.examTitle, ''],
    [input.subjectLine, ''],
    [input.schoolName, ''],
    [`ผู้ออกข้อสอบ: ${input.authorName}`, ''],
    [
      input.expertNames.length > 0
        ? `ผู้ประเมิน ${input.expertNames.length} ท่าน: ${input.expertNames.join(' · ')}`
        : 'ยังไม่มีผู้ประเมินที่ส่งผล',
      '',
    ],
    [
      `ร้อยละความสอดคล้อง: ${input.percent === null ? '—' : input.percent.toFixed(2)}`
      + ` · ผ่านเกณฑ์ ${input.passedCount} จาก ${input.itemCount} ข้อ`
      + ` · เกณฑ์ ${input.threshold.toFixed(2)} · คิดจาก${input.percentRuleLabel}`,
      '',
    ],
  ]

  heading.forEach((line, index) => {
    const row = sheet.getRow(index + 1)
    row.getCell(1).value = line[0]
    row.getCell(1).font = { bold: index < 2, size: index === 0 ? 14 : 11 }
    sheet.mergeCells(index + 1, 1, index + 1, 8)
  })

  const header = sheet.getRow(HEADER_ROW)
  header.values = [
    'ข้อที่',
    'มาตรฐานตัวชี้วัด',
    'สอดคล้อง (+1)',
    'ไม่แน่ใจ (0)',
    'ไม่สอดคล้อง (−1)',
    'ดัชนีความสอดคล้อง',
    'ผลการตัดสิน',
    'ข้อเสนอแนะ',
  ]
  header.font = { bold: true }
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }

  input.rows.forEach(row => {
    const added = sheet.addRow({
      item: row.itemLabel,
      standard: row.standardLabel,
      agree: row.agree,
      unsure: row.unsure,
      disagree: row.disagree,
      // A judgement nobody made is left blank, never written as a zero.
      index: row.index === null ? '' : Number(row.index.toFixed(2)),
      verdict: row.passed === null ? 'ยังไม่มีผล' : row.passed ? 'ผ่าน' : 'ต่ำกว่าเกณฑ์',
      comments: row.comments.join('\n'),
    })
    added.alignment = { vertical: 'top', wrapText: true }
    added.getCell('index').numFmt = '0.00'
    if (row.passed === false) {
      added.getCell('verdict').font = { bold: true }
    }
  })

  sheet.addRow([])
  const note = sheet.addRow([
    `ออกจาก KorKru เมื่อ ${formatThaiDateTime(generatedAt, { dateStyle: 'long', timeStyle: 'short' })}`
    + ' · ค่าดัชนีคำนวณจากผลที่ผู้ทรงคุณวุฒิส่งจริง',
  ])
  note.font = { italic: true, size: 10 }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/**
 * Keeps the exam's own name on the file, so a folder of these stays readable.
 * Characters a filesystem refuses become a space rather than nothing: deleting
 * the slash in "ภาค 2/2569" would fuse the numbers into "22569".
 */
export function iocSummaryWorkbookFileName(examTitle: string, generatedAt: Date = new Date()): string {
  const safe = examTitle
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || 'IOC'
  const stamp = generatedAt.toISOString().slice(0, 10)
  return `IOC-สรุปผล-${safe}-${stamp}.xlsx`
}
