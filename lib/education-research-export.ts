import { randomInt } from 'node:crypto'
import ExcelJS, { type Worksheet } from 'exceljs'

export const EDUCATION_RESEARCH_EXPORT_ROW_LIMIT = 2000

const DATA_HEADER_ROW = 7
const FIRST_DATA_ROW = DATA_HEADER_ROW + 1

export type EducationResearchExportMode = 'anonymous' | 'identified'

export interface EducationResearchExportRow {
  order: number
  studentCode: string | null
  fullName: string
  anonymousCode?: string
  pretest: number | null
  posttest: number | null
  includedPaired: boolean
  includedCriterion: boolean
  passedCriterion: boolean | null
  exclusionReason: string | null
}

export interface BuildEducationResearchDataExportInput {
  mode: EducationResearchExportMode
  project: {
    title: string
    topic: string
    classroomName: string
    thresholdPercent: number
  }
  pretestMaxScore: number | null
  posttestMaxScore: number | null
  rows: EducationResearchExportRow[]
  generatedAt?: Date
}

export class EducationResearchExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EducationResearchExportError'
  }
}

/**
 * Remove roster order as an indirect identifier by shuffling before assigning
 * short per-file participant codes. No identity or UUID is copied into the
 * returned rows. The optional picker keeps the helper deterministic in tests.
 */
export function anonymizeEducationResearchRows(
  rows: EducationResearchExportRow[],
  pickIndex: (upperExclusive: number) => number = randomInt,
): EducationResearchExportRow[] {
  const shuffled = rows.map(row => ({
    ...row,
    studentCode: null,
    fullName: '',
    anonymousCode: undefined,
  }))

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const selected = pickIndex(index + 1)
    if (!Number.isInteger(selected) || selected < 0 || selected > index) {
      throw new EducationResearchExportError('สร้างรหัสผู้เข้าร่วมไม่สำเร็จ')
    }
    ;[shuffled[index], shuffled[selected]] = [shuffled[selected], shuffled[index]]
  }

  const codeWidth = Math.max(3, String(shuffled.length).length)
  return shuffled.map((row, index) => ({
    ...row,
    order: index + 1,
    anonymousCode: `P${String(index + 1).padStart(codeWidth, '0')}`,
  }))
}

export async function buildEducationResearchDataExportWorkbook(
  input: BuildEducationResearchDataExportInput,
): Promise<Buffer> {
  validateExportInput(input)

  const generatedAt = input.generatedAt ?? new Date()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'KorKru'
  workbook.lastModifiedBy = 'KorKru'
  workbook.created = generatedAt
  workbook.modified = generatedAt

  const identified = input.mode === 'identified'
  const sheet = workbook.addWorksheet(identified ? 'ข้อมูลมีชื่อและรหัส' : 'ข้อมูลไม่ระบุตัวตน', {
    views: [{ state: 'frozen', ySplit: DATA_HEADER_ROW, activeCell: `A${FIRST_DATA_ROW}` }],
    properties: { defaultRowHeight: 22 },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  sheet.columns = identified
    ? [
        { key: 'order', width: 9 },
        { key: 'studentCode', width: 18 },
        { key: 'fullName', width: 32 },
        { key: 'pretest', width: 18 },
        { key: 'posttest', width: 18 },
        { key: 'paired', width: 18 },
        { key: 'criterion', width: 18 },
        { key: 'passed', width: 18 },
        { key: 'reason', width: 34 },
      ]
    : [
        { key: 'anonymousCode', width: 18 },
        { key: 'pretest', width: 18 },
        { key: 'posttest', width: 18 },
        { key: 'paired', width: 18 },
        { key: 'criterion', width: 18 },
        { key: 'passed', width: 18 },
        { key: 'reason', width: 34 },
      ]

  const columnCount = identified ? 9 : 7
  styleHeading(sheet, input, generatedAt, columnCount)

  const headers = identified
    ? ['เลขที่', 'รหัสนักเรียน', 'ชื่อ–นามสกุล', scoreHeader('ก่อนเรียน', input.pretestMaxScore), scoreHeader('หลังเรียน', input.posttestMaxScore), 'ใช้วิเคราะห์ก่อน–หลัง', 'ใช้วิเคราะห์เทียบเกณฑ์', 'ผลเทียบเกณฑ์', 'เหตุผลที่ไม่รวม']
    : ['รหัสผู้เข้าร่วม', scoreHeader('ก่อนเรียน', input.pretestMaxScore), scoreHeader('หลังเรียน', input.posttestMaxScore), 'ใช้วิเคราะห์ก่อน–หลัง', 'ใช้วิเคราะห์เทียบเกณฑ์', 'ผลเทียบเกณฑ์', 'เหตุผลที่ไม่รวม']

  const headerRow = sheet.getRow(DATA_HEADER_ROW)
  headerRow.values = headers
  headerRow.height = 34
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = thinBorder('FFCBD5E1')
  })

  input.rows.forEach((item, index) => {
    const row = sheet.getRow(FIRST_DATA_ROW + index)
    row.values = identified
      ? [
          item.order,
          safeText(item.studentCode ?? '—', 120),
          safeText(item.fullName, 240),
          item.pretest,
          item.posttest,
          useLabel(item.includedPaired),
          useLabel(item.includedCriterion),
          criterionLabel(item.includedCriterion, item.passedCriterion),
          safeText(item.exclusionReason ?? 'ข้อมูลครบตามกติกา', 500),
        ]
      : [
          item.anonymousCode,
          item.pretest,
          item.posttest,
          useLabel(item.includedPaired),
          useLabel(item.includedCriterion),
          criterionLabel(item.includedCriterion, item.passedCriterion),
          safeText(item.exclusionReason ?? 'ข้อมูลครบตามกติกา', 500),
        ]

    row.height = 25
    row.eachCell({ includeEmpty: true }, cell => {
      cell.alignment = { vertical: 'middle', wrapText: true }
      cell.border = thinBorder('FFE2E8F0')
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: index % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC' },
      }
    })
    const scoreColumns = identified ? [4, 5] : [2, 3]
    scoreColumns.forEach(column => {
      row.getCell(column).numFmt = '0.00##'
      row.getCell(column).alignment = { vertical: 'middle', horizontal: 'right' }
    })
  })

  const lastRow = Math.max(DATA_HEADER_ROW, FIRST_DATA_ROW + input.rows.length - 1)
  sheet.autoFilter = {
    from: { row: DATA_HEADER_ROW, column: 1 },
    to: { row: lastRow, column: columnCount },
  }
  sheet.pageSetup.printTitlesRow = `1:${DATA_HEADER_ROW}`
  sheet.pageSetup.printArea = `A1:${columnLetter(columnCount)}${lastRow}`

  addPrivacySheet(workbook, input.mode)

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export function educationResearchDataExportFileName(
  projectTitle: string,
  mode: EducationResearchExportMode,
): string {
  const safeTitle = projectTitle
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 70) || 'research'
  const modeLabel = mode === 'identified' ? 'มีชื่อและรหัส' : 'ไม่ระบุตัวตน'
  return `KorKru-ข้อมูลวิจัย-${modeLabel}-${safeTitle}.xlsx`
}

function validateExportInput(input: BuildEducationResearchDataExportInput) {
  if (input.mode !== 'anonymous' && input.mode !== 'identified') {
    throw new EducationResearchExportError('ชนิดไฟล์ส่งออกไม่ถูกต้อง')
  }
  if (input.rows.length === 0 || input.rows.length > EDUCATION_RESEARCH_EXPORT_ROW_LIMIT) {
    throw new EducationResearchExportError('จำนวนผู้เข้าร่วมไม่อยู่ในช่วงที่ส่งออกได้')
  }
  if (!Number.isFinite(input.project.thresholdPercent)
    || input.project.thresholdPercent <= 0
    || input.project.thresholdPercent > 100) {
    throw new EducationResearchExportError('เกณฑ์ผ่านของโครงการไม่ถูกต้อง')
  }
  input.rows.forEach(row => {
    if (!Number.isInteger(row.order) || row.order <= 0) {
      throw new EducationResearchExportError('ลำดับผู้เข้าร่วมไม่ถูกต้อง')
    }
    if (input.mode === 'anonymous' && !/^P\d{3,}$/.test(row.anonymousCode ?? '')) {
      throw new EducationResearchExportError('รหัสผู้เข้าร่วมแบบไม่ระบุตัวตนไม่ถูกต้อง')
    }
    validateScore(row.pretest, input.pretestMaxScore)
    validateScore(row.posttest, input.posttestMaxScore)
  })
}

function validateScore(score: number | null, maxScore: number | null) {
  if (score === null) return
  if (!Number.isFinite(score) || score < 0 || maxScore === null || score > maxScore) {
    throw new EducationResearchExportError('พบคะแนนที่อยู่นอกช่วงของแบบทดสอบ')
  }
}

function styleHeading(
  sheet: Worksheet,
  input: BuildEducationResearchDataExportInput,
  generatedAt: Date,
  columnCount: number,
) {
  const lastColumn = columnLetter(columnCount)
  sheet.mergeCells(`A1:${lastColumn}1`)
  sheet.getCell('A1').value = 'ข้อมูลรายบุคคลที่ใช้ในการวิเคราะห์งานวิจัย'
  sheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FF1E3A8A' } }
  sheet.getRow(1).height = 32

  sheet.mergeCells(`A2:${lastColumn}2`)
  sheet.getCell('A2').value = safeText(`${input.project.title} · ${input.project.topic}`, 500)
  sheet.getCell('A2').font = { bold: true, size: 12, color: { argb: 'FF0F172A' } }

  sheet.mergeCells(`A3:${lastColumn}3`)
  sheet.getCell('A3').value = safeText(`ห้อง ${input.project.classroomName} · ผู้เข้าร่วม ${input.rows.length} คน · เกณฑ์ผ่าน ${formatNumber(input.project.thresholdPercent)}%`, 500)
  sheet.getCell('A3').font = { size: 10, color: { argb: 'FF475569' } }

  sheet.mergeCells(`A4:${lastColumn}4`)
  sheet.getCell('A4').value = input.mode === 'identified'
    ? 'ไฟล์นี้มีชื่อ รหัสนักเรียน และคะแนนรายบุคคล ใช้ภายในเท่าที่จำเป็นและจำกัดผู้เข้าถึง'
    : 'ไฟล์นี้ไม่ใส่ชื่อ รหัสนักเรียน UUID หรือเลขที่ในห้อง และสุ่มลำดับใหม่ก่อนกำหนดรหัสผู้เข้าร่วม'
  sheet.getCell('A4').font = {
    bold: true,
    size: 10,
    color: { argb: input.mode === 'identified' ? 'FFB45309' : 'FF047857' },
  }
  sheet.getCell('A4').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: input.mode === 'identified' ? 'FFFFF7ED' : 'FFECFDF5' },
  }

  sheet.mergeCells(`A5:${lastColumn}5`)
  sheet.getCell('A5').value = `สร้างจากข้อมูลล่าสุดใน KorKru เมื่อ ${formatBangkokDate(generatedAt)} · ช่องว่างไม่ได้ถูกแทนด้วย 0`
  sheet.getCell('A5').font = { size: 10, color: { argb: 'FF475569' } }
}

function addPrivacySheet(workbook: ExcelJS.Workbook, mode: EducationResearchExportMode) {
  const sheet = workbook.addWorksheet('คำแนะนำการใช้ไฟล์', {
    properties: { defaultRowHeight: 24 },
  })
  sheet.columns = [{ width: 24 }, { width: 90 }]
  sheet.addRows([
    ['หัวข้อ', 'รายละเอียด'],
    ['ชนิดไฟล์', mode === 'identified' ? 'มีชื่อและรหัสนักเรียน' : 'ไม่ระบุตัวตนในไฟล์'],
    ['การใช้ข้อมูล', 'ใช้เพื่อวิเคราะห์และตรวจสอบงานวิจัยตามวัตถุประสงค์ที่กำหนดเท่านั้น'],
    ['การจัดเก็บ', 'จำกัดผู้เข้าถึง เก็บในพื้นที่ปลอดภัย และลบสำเนาเมื่อหมดความจำเป็น'],
    ['ข้อจำกัด', mode === 'identified'
      ? 'ข้อมูลในไฟล์สามารถระบุตัวนักเรียนได้โดยตรง หลีกเลี่ยงการส่งต่อหากไม่จำเป็น'
      : 'แม้ไม่มีชื่อและรหัส คะแนนรายบุคคลอาจเชื่อมโยงกลับได้เมื่อรวมกับข้อมูลอื่น จึงยังต้องดูแลอย่างเหมาะสม'],
    ['แหล่งข้อมูล', 'สร้างใหม่จากคะแนนล่าสุดใน KorKru ขณะดาวน์โหลด และไม่ได้เก็บเป็นลิงก์สาธารณะ'],
  ])
  const header = sheet.getRow(1)
  header.height = 30
  header.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
    cell.alignment = { vertical: 'middle' }
    cell.border = thinBorder('FFCBD5E1')
  })
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    row.eachCell(cell => {
      cell.alignment = { vertical: 'top', wrapText: true }
      cell.border = thinBorder('FFE2E8F0')
    })
    row.getCell(1).font = { bold: true, color: { argb: 'FF334155' } }
  }
}

function safeText(value: string, maxLength: number): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength)
}

function scoreHeader(label: string, maxScore: number | null): string {
  return `${label} (เต็ม ${maxScore === null ? '—' : formatNumber(maxScore)})`
}

function useLabel(included: boolean): string {
  return included ? 'ใช้' : 'ไม่ใช้'
}

function criterionLabel(included: boolean, passed: boolean | null): string {
  if (!included || passed === null) return '—'
  return passed ? 'ผ่าน' : 'ไม่ผ่าน'
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function formatBangkokDate(value: Date): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(value)
}

function columnLetter(column: number): string {
  return String.fromCharCode(64 + column)
}

function thinBorder(color: string): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: color } },
    left: { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    right: { style: 'thin', color: { argb: color } },
  }
}
