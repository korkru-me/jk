import ExcelJS, { type CellValue, type Worksheet } from 'exceljs'
import type { EducationResearchSourceType } from '@/lib/types'

const WORKBOOK_SCHEMA = 'korkru-education-research-scores'
const WORKBOOK_SCHEMA_VERSION = 1
const SCORE_SHEET_NAME = 'กรอกคะแนน'
const METADATA_SHEET_NAME = '__KORKRU_META'
const HEADER_ROW = 8
const FIRST_DATA_ROW = HEADER_ROW + 1
const MAX_IMPORT_ROWS = 2000

export interface EducationResearchExcelMeasurement {
  source_type: EducationResearchSourceType | null
  max_score: number | null
}

export interface EducationResearchExcelTemplateRow {
  row_token: string
  roster_order: number | null
  student_code: string | null
  full_name: string
  current_pretest: number | null
  current_posttest: number | null
}

export interface BuildEducationResearchWorkbookInput {
  project: {
    id: string
    title: string
    topic: string
    classroom_name: string
  }
  template: { id: string; version: number }
  pretest: EducationResearchExcelMeasurement | null
  posttest: EducationResearchExcelMeasurement | null
  rows: EducationResearchExcelTemplateRow[]
  generated_at?: Date
}

export interface ParsedEducationResearchWorkbookRow {
  row_number: number
  row_token: string | null
  student_code: string | null
  full_name: string | null
  note: string | null
  pretest: number | null
  posttest: number | null
  parse_errors: string[]
}

export interface ParsedEducationResearchWorkbook {
  project_id: string
  template_id: string
  template_version: number
  rows: ParsedEducationResearchWorkbookRow[]
}

export class EducationResearchWorkbookError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EducationResearchWorkbookError'
  }
}

export async function buildEducationResearchScoreWorkbook(
  input: BuildEducationResearchWorkbookInput,
): Promise<Buffer> {
  if (input.rows.length === 0 || input.rows.length > MAX_IMPORT_ROWS) {
    throw new EducationResearchWorkbookError('จำนวนผู้เข้าร่วมไม่อยู่ในช่วงที่สร้างแม่แบบได้')
  }
  if (input.pretest?.source_type !== 'excel' && input.posttest?.source_type !== 'excel') {
    throw new EducationResearchWorkbookError('โครงการนี้ไม่ได้กำหนดให้รับคะแนนจาก Excel')
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'KorKru'
  workbook.lastModifiedBy = 'KorKru'
  workbook.created = input.generated_at ?? new Date()
  workbook.modified = input.generated_at ?? new Date()
  workbook.calcProperties.fullCalcOnLoad = true

  const sheet = workbook.addWorksheet(SCORE_SHEET_NAME, {
    views: [{ state: 'frozen', xSplit: 4, ySplit: HEADER_ROW, activeCell: `E${FIRST_DATA_ROW}` }],
    properties: { defaultRowHeight: 22 },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  sheet.columns = [
    { key: 'row_token', width: 2, hidden: true },
    { key: 'order', width: 9 },
    { key: 'student_code', width: 18 },
    { key: 'full_name', width: 32 },
    { key: 'pretest', width: 19 },
    { key: 'posttest', width: 19 },
    { key: 'note', width: 32 },
  ]

  styleWorkbookHeading(sheet, input)
  const headers = ['รหัสแถว', 'เลขที่', 'รหัสนักเรียน', 'ชื่อ–นามสกุล', scoreHeader('ก่อนเรียน', input.pretest), scoreHeader('หลังเรียน', input.posttest), 'หมายเหตุ (ไม่บังคับ)']
  const headerRow = sheet.getRow(HEADER_ROW)
  headerRow.values = headers
  headerRow.height = 30
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = thinBorder('FFCBD5E1')
    cell.protection = { locked: true }
  })

  input.rows.forEach((item, index) => {
    const rowNumber = FIRST_DATA_ROW + index
    const row = sheet.getRow(rowNumber)
    row.values = [
      item.row_token,
      item.roster_order ?? index + 1,
      item.student_code ?? '—',
      item.full_name,
      item.current_pretest,
      item.current_posttest,
      '\u200B',
    ]
    row.height = 25
    row.eachCell({ includeEmpty: true }, cell => {
      cell.alignment = { vertical: 'middle', wrapText: false }
      cell.border = thinBorder('FFE2E8F0')
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC' } }
      cell.protection = { locked: true }
    })
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' }
    configureScoreCell(row.getCell(5), input.pretest)
    configureScoreCell(row.getCell(6), input.posttest)
    row.getCell(7).protection = { locked: false }
  })

  const lastDataRow = FIRST_DATA_ROW + input.rows.length - 1
  sheet.autoFilter = { from: { row: HEADER_ROW, column: 2 }, to: { row: lastDataRow, column: 7 } }
  addScoreValidation(sheet, 5, FIRST_DATA_ROW, lastDataRow, input.pretest)
  addScoreValidation(sheet, 6, FIRST_DATA_ROW, lastDataRow, input.posttest)
  sheet.pageSetup.printTitlesRow = `1:${HEADER_ROW}`
  sheet.pageSetup.printArea = `B1:G${lastDataRow}`

  await sheet.protect('korkru-template-v1', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertRows: false,
    deleteRows: false,
    sort: true,
    autoFilter: true,
  })

  const metadata = workbook.addWorksheet(METADATA_SHEET_NAME, { state: 'veryHidden' })
  metadata.addRows([
    ['schema', WORKBOOK_SCHEMA],
    ['schema_version', WORKBOOK_SCHEMA_VERSION],
    ['project_id', input.project.id],
    ['template_id', input.template.id],
    ['template_version', input.template.version],
    ['score_sheet', SCORE_SHEET_NAME],
    ['header_row', HEADER_ROW],
    ['pretest_source', input.pretest?.source_type ?? 'none'],
    ['posttest_source', input.posttest?.source_type ?? 'none'],
  ])
  metadata.state = 'veryHidden'

  const output = await workbook.xlsx.writeBuffer()
  return Buffer.from(output)
}

export async function parseEducationResearchScoreWorkbook(
  buffer: Buffer,
): Promise<ParsedEducationResearchWorkbook> {
  validateXlsxArchive(buffer)
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
  } catch {
    throw new EducationResearchWorkbookError('เปิดไฟล์ไม่ได้ กรุณาใช้ไฟล์ .xlsx ที่ดาวน์โหลดจาก KorKru')
  }

  const metadata = workbook.getWorksheet(METADATA_SHEET_NAME)
  const sheet = workbook.getWorksheet(SCORE_SHEET_NAME)
  if (!metadata || !sheet) {
    throw new EducationResearchWorkbookError('ไม่พบข้อมูลแม่แบบ KorKru ในไฟล์นี้')
  }

  const values = new Map<string, string>()
  metadata.eachRow(row => {
    const key = cellText(row.getCell(1).value)
    if (key) values.set(key, cellText(row.getCell(2).value))
  })
  if (values.get('schema') !== WORKBOOK_SCHEMA || Number(values.get('schema_version')) !== WORKBOOK_SCHEMA_VERSION) {
    throw new EducationResearchWorkbookError('แม่แบบไฟล์นี้เป็นคนละรุ่นกับระบบปัจจุบัน กรุณาดาวน์โหลดใหม่')
  }

  const projectId = values.get('project_id') ?? ''
  const templateId = values.get('template_id') ?? ''
  const templateVersion = Number(values.get('template_version'))
  const pretestUsesExcel = values.get('pretest_source') === 'excel'
  const posttestUsesExcel = values.get('posttest_source') === 'excel'
  if (!isUuid(projectId) || !isUuid(templateId) || !Number.isInteger(templateVersion) || templateVersion < 1) {
    throw new EducationResearchWorkbookError('ข้อมูลอ้างอิงแม่แบบไม่สมบูรณ์ กรุณาดาวน์โหลดไฟล์ใหม่')
  }

  const rows: ParsedEducationResearchWorkbookRow[] = []
  for (let rowNumber = FIRST_DATA_ROW; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const rowToken = nullableCellText(row.getCell(1).value)
    const studentCodeText = nullableCellText(row.getCell(3).value)
    const studentCode = studentCodeText === '—' ? null : studentCodeText
    const fullName = nullableCellText(row.getCell(4).value)
    const pretest = parseScoreCell(row.getCell(5).value, 'คะแนนก่อนเรียน')
    const posttest = parseScoreCell(row.getCell(6).value, 'คะแนนหลังเรียน')
    const note = nullableCellText(row.getCell(7).value)
    const noteErrors = note && note.length > 500 ? ['หมายเหตุต้องยาวไม่เกิน 500 ตัวอักษร'] : []
    const hasAnyContent = Boolean(rowToken || studentCode || fullName || pretest.hasContent || posttest.hasContent || note)
    if (!hasAnyContent) continue

    rows.push({
      row_number: rowNumber,
      row_token: rowToken,
      student_code: studentCode,
      full_name: fullName,
      note: note && note.length > 500 ? note.slice(0, 500) : note,
      pretest: pretestUsesExcel ? pretest.value : null,
      posttest: posttestUsesExcel ? posttest.value : null,
      parse_errors: [
        ...(pretestUsesExcel ? pretest.errors : []),
        ...(posttestUsesExcel ? posttest.errors : []),
        ...noteErrors,
      ],
    })
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new EducationResearchWorkbookError(`ไฟล์มีข้อมูลเกิน ${MAX_IMPORT_ROWS} แถว`)
    }
  }

  if (rows.length === 0) {
    throw new EducationResearchWorkbookError('ไม่พบรายชื่อนักเรียนในไฟล์')
  }
  return { project_id: projectId, template_id: templateId, template_version: templateVersion, rows }
}

export function educationResearchWorkbookFileName(projectTitle: string): string {
  const safeTitle = projectTitle.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-').slice(0, 80) || 'research'
  return `KorKru-คะแนนก่อนหลัง-${safeTitle}.xlsx`
}

function styleWorkbookHeading(sheet: Worksheet, input: BuildEducationResearchWorkbookInput) {
  sheet.mergeCells('B1:G1')
  sheet.getCell('B1').value = 'แม่แบบบันทึกคะแนนก่อน–หลังเรียน'
  sheet.getCell('B1').font = { bold: true, size: 18, color: { argb: 'FF1E3A8A' } }
  sheet.getCell('B1').alignment = { vertical: 'middle' }
  sheet.getRow(1).height = 32
  sheet.mergeCells('B2:G2')
  sheet.getCell('B2').value = `${input.project.title} · ${input.project.topic}`
  sheet.getCell('B2').font = { bold: true, size: 12, color: { argb: 'FF0F172A' } }
  sheet.mergeCells('B3:G3')
  sheet.getCell('B3').value = `ห้อง ${input.project.classroom_name} · แม่แบบรุ่น ${input.template.version} · รายชื่อ ${input.rows.length} คน`
  sheet.getCell('B3').font = { size: 10, color: { argb: 'FF475569' } }
  sheet.mergeCells('B5:G5')
  sheet.getCell('B5').value = 'กรอกเฉพาะช่องพื้นสีฟ้าอ่อน • ช่องว่างหมายถึงยังไม่มีคะแนน • คะแนน 0 ต้องพิมพ์เลข 0'
  sheet.getCell('B5').font = { bold: true, size: 10, color: { argb: 'FF1D4ED8' } }
  sheet.getCell('B5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }
  sheet.mergeCells('B6:G6')
  sheet.getCell('B6').value = 'ห้ามเพิ่ม ลบ หรือสลับแถวนักเรียน ระบบจะตรวจแม่แบบและแสดงตัวอย่างก่อนบันทึกคะแนนจริงทุกครั้ง'
  sheet.getCell('B6').font = { size: 10, color: { argb: 'FFB45309' } }
}

function configureScoreCell(cell: ExcelJS.Cell, measurement: EducationResearchExcelMeasurement | null) {
  cell.numFmt = '0.00##'
  cell.alignment = { vertical: 'middle', horizontal: 'center' }
  if (measurement?.source_type === 'excel') {
    cell.protection = { locked: false }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
  } else {
    cell.protection = { locked: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
    cell.font = { color: { argb: 'FF64748B' } }
  }
}

function addScoreValidation(
  sheet: Worksheet,
  column: number,
  firstRow: number,
  lastRow: number,
  measurement: EducationResearchExcelMeasurement | null,
) {
  if (measurement?.source_type !== 'excel' || measurement.max_score === null) return
  for (let rowNumber = firstRow; rowNumber <= lastRow; rowNumber += 1) {
    sheet.getCell(rowNumber, column).dataValidation = {
      type: 'decimal',
      operator: 'between',
      allowBlank: true,
      showErrorMessage: true,
      showInputMessage: true,
      formulae: [0, measurement.max_score],
      promptTitle: 'กรอกคะแนน',
      prompt: `กรอกตัวเลขตั้งแต่ 0 ถึง ${measurement.max_score}`,
      errorTitle: 'คะแนนไม่ถูกต้อง',
      error: `คะแนนต้องอยู่ระหว่าง 0 ถึง ${measurement.max_score}`,
    }
  }
}

function scoreHeader(label: string, measurement: EducationResearchExcelMeasurement | null): string {
  if (!measurement) return `${label} (ยังไม่กำหนด)`
  const max = measurement.max_score === null ? '—' : measurement.max_score
  return measurement.source_type === 'excel' ? `${label} (เต็ม ${max})` : `${label} (ดูอย่างเดียว)`
}

function parseScoreCell(value: CellValue, label: string): { value: number | null; errors: string[]; hasContent: boolean } {
  if (value === null || value === undefined || value === '') return { value: null, errors: [], hasContent: false }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { value, errors: [], hasContent: true }
      : { value: null, errors: [`${label}ไม่ใช่ตัวเลขที่ใช้ได้`], hasContent: true }
  }
  return { value: null, errors: [`${label}ต้องเป็นตัวเลขที่พิมพ์ในเซลล์ ห้ามใช้สูตรหรือข้อความ`], hasContent: true }
}

function cellText(value: CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).replaceAll('\u200B', '').trim()
  if (value instanceof Date) return value.toISOString()
  if ('text' in value && typeof value.text === 'string') return value.text.trim()
  if ('richText' in value && Array.isArray(value.richText)) return value.richText.map(part => part.text).join('').trim()
  if ('result' in value) return value.result === undefined ? '' : String(value.result).trim()
  return ''
}

function nullableCellText(value: CellValue): string | null {
  return cellText(value) || null
}

function thinBorder(color: string): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: color } },
    left: { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    right: { style: 'thin', color: { argb: color } },
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function validateXlsxArchive(buffer: Buffer) {
  const eocdSignature = 0x06054b50
  const centralSignature = 0x02014b50
  const searchStart = Math.max(0, buffer.length - 65_557)
  let eocdOffset = -1
  for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === eocdSignature) {
      eocdOffset = offset
      break
    }
  }
  if (eocdOffset < 0) throw new EducationResearchWorkbookError('ไฟล์นี้ไม่ใช่สมุดงาน .xlsx ที่สมบูรณ์')

  const entryCount = buffer.readUInt16LE(eocdOffset + 10)
  const centralSize = buffer.readUInt32LE(eocdOffset + 12)
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16)
  if (entryCount === 0 || entryCount > 1_000 || centralOffset + centralSize > buffer.length) {
    throw new EducationResearchWorkbookError('โครงสร้างไฟล์ .xlsx มีขนาดหรือจำนวนส่วนประกอบเกินที่ระบบรองรับ')
  }

  let offset = centralOffset
  let totalUncompressed = 0
  let hasContentTypes = false
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== centralSignature) {
      throw new EducationResearchWorkbookError('โครงสร้างภายในไฟล์ .xlsx ไม่ถูกต้อง')
    }
    const flags = buffer.readUInt16LE(offset + 8)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const fileNameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const nextOffset = offset + 46 + fileNameLength + extraLength + commentLength
    if (nextOffset > buffer.length || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new EducationResearchWorkbookError('ไฟล์ .xlsx แบบ ZIP64 หรือโครงสร้างขนาดใหญ่พิเศษยังไม่รองรับ')
    }
    if ((flags & 0x1) !== 0) throw new EducationResearchWorkbookError('ไม่รองรับไฟล์ .xlsx ที่เข้ารหัสภายใน')

    const fileName = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8')
    const normalizedName = fileName.replaceAll('\\', '/').toLocaleLowerCase('en-US')
    if (normalizedName === '[content_types].xml') hasContentTypes = true
    if (normalizedName.endsWith('/vbaproject.bin') || normalizedName.includes('/macrosheets/')) {
      throw new EducationResearchWorkbookError('ไม่รองรับไฟล์ที่มี macro กรุณาใช้แม่แบบ .xlsx เดิมจาก KorKru')
    }

    totalUncompressed += uncompressedSize
    const compressionRatio = uncompressedSize / Math.max(compressedSize, 1)
    if (uncompressedSize > 25 * 1024 * 1024 || totalUncompressed > 60 * 1024 * 1024 || compressionRatio > 250) {
      throw new EducationResearchWorkbookError('เนื้อหาภายในไฟล์มีขนาดหรืออัตราการบีบอัดสูงเกินที่ระบบรองรับ')
    }
    offset = nextOffset
  }
  if (!hasContentTypes) throw new EducationResearchWorkbookError('ไฟล์นี้ไม่มีโครงสร้างสมุดงาน Excel ที่ระบบรองรับ')
}
