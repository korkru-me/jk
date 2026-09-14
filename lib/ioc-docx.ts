/**
 * The same IOC document, as a file Word can edit.
 *
 * The A4 print page exists because a browser lays Thai out correctly and a PDF
 * library does not. This exists for the other half of the job: a committee that
 * sends the form back with wording to change, or a school whose report template
 * is a .docx and wants the table pasted straight in. A PDF is finished; this is
 * not meant to be.
 *
 * Both renderers read `PrintSection` from `lib/ioc-print.ts`, so neither one
 * computes a number of its own. What differs here is only how the same content
 * is drawn, plus the two things Word does better than the print page: it
 * repaginates by itself, so nothing has to measure row heights, and its page
 * number is a field rather than a count worked out in advance.
 */

import {
  AlignmentType,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
  convertMillimetersToTwip,
} from 'docx'
import type { IocPrintRow, IocSignatureBlock, PrintSection, SummaryPrintRow } from '@/lib/ioc-print'
import { groupRowsByStandard } from '@/lib/ioc-print'
import { htmlToDocxParagraphs, htmlToPlainText, type DocxParagraph } from '@/lib/ioc-docx-html'

/**
 * What Thai official paperwork is set in. If a teacher's machine does not have
 * it Word substitutes something else and the document still opens — which is
 * the whole reason this format is worth offering — so the font is a default
 * rather than a requirement.
 */
const DOC_FONT = 'TH SarabunPSK'
/** Half-points: Word's unit for run size. 32 is the usual 16pt of a Thai form. */
const BODY_SIZE = 32
const TITLE_SIZE = 36
const SMALL_SIZE = 28

/** A4 less the margins Thai documents use: 2.5cm at the top, 2cm elsewhere. */
const USABLE_WIDTH_MM = 170

export interface IocDocxInput {
  sections: readonly PrintSection[]
  criteriaNote: string | null
  watermarkText: string | null
  /** PNG bytes for each signature path this document will show. */
  signatureImages: ReadonlyMap<string, Uint8Array>
  /** Shown in the file's own properties, not on the page. */
  title: string
  author: string
}

/**
 * Width and height from a PNG's IHDR chunk.
 *
 * The bucket accepts PNG only and the browser re-encodes every upload, so the
 * header is always there — but a file that is not one still must not throw in
 * the middle of building a document, so anything unreadable falls back to a
 * shape rather than failing the export.
 */
export function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const FALLBACK = { width: 300, height: 100 }
  if (bytes.length < 24) return FALLBACK
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (signature.some((byte, index) => bytes[index] !== byte)) return FALLBACK

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (width <= 0 || height <= 0) return FALLBACK
  return { width, height }
}

/** Signatures print about this wide; the height follows the image's own ratio. */
const SIGNATURE_WIDTH_PX = 150
const SIGNATURE_MAX_HEIGHT_PX = 60

export function signatureImageSize(bytes: Uint8Array): { width: number; height: number } {
  const natural = pngDimensions(bytes)
  const scale = Math.min(
    SIGNATURE_WIDTH_PX / natural.width,
    SIGNATURE_MAX_HEIGHT_PX / natural.height,
  )
  return {
    width: Math.max(1, Math.round(natural.width * scale)),
    height: Math.max(1, Math.round(natural.height * scale)),
  }
}

function runs(paragraph: DocxParagraph): TextRun[] {
  return paragraph.runs.map(run => new TextRun({
    text: run.text,
    bold: run.bold,
    italics: run.italics,
    underline: run.underline ? {} : undefined,
    superScript: run.superScript,
    subScript: run.subScript,
  }))
}

/** Rich text from the question bank, as the paragraphs of one table cell. */
function richTextParagraphs(html: string): Paragraph[] {
  return htmlToDocxParagraphs(html).map(paragraph => new Paragraph({
    children: runs(paragraph),
    bullet: paragraph.bullet ? { level: 0 } : undefined,
    spacing: { after: 0 },
  }))
}

function text(value: string, options?: {
  bold?: boolean
  size?: number
  align?: (typeof AlignmentType)[keyof typeof AlignmentType]
  spacingAfter?: number
}): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: value, bold: options?.bold, size: options?.size })],
    alignment: options?.align,
    spacing: { after: options?.spacingAfter ?? 0 },
  })
}

function mm(value: number) {
  return { size: convertMillimetersToTwip(value), type: WidthType.DXA }
}

function cell(children: Paragraph[], options?: {
  widthMm?: number
  rowSpan?: number
  columnSpan?: number
}): TableCell {
  return new TableCell({
    children: children.length > 0 ? children : [new Paragraph({ children: [] })],
    width: options?.widthMm ? mm(options.widthMm) : undefined,
    rowSpan: options?.rowSpan,
    columnSpan: options?.columnSpan,
    verticalAlign: VerticalAlign.TOP,
    margins: {
      top: convertMillimetersToTwip(1),
      bottom: convertMillimetersToTwip(1),
      left: convertMillimetersToTwip(1.5),
      right: convertMillimetersToTwip(1.5),
    },
  })
}

function centeredCell(value: string, widthMm: number, options?: { bold?: boolean; rowSpan?: number; columnSpan?: number }): TableCell {
  return cell(
    value.split('\n').map(line => text(line, { bold: options?.bold, align: AlignmentType.CENTER })),
    { widthMm, rowSpan: options?.rowSpan, columnSpan: options?.columnSpan },
  )
}

/** Column widths in millimetres, summing to the usable width of an A4 page. */
function evaluationColumns(showComments: boolean): number[] {
  return showComments
    ? [33, 72, 10, 10, 10, 35]
    : [40, 100, 10, 10, 10]
}

const SUMMARY_COLUMNS = [47, 23, 20, 20, 20, 40]

function evaluationHeaderRows(showComments: boolean): TableRow[] {
  const widths = evaluationColumns(showComments)
  const first = [
    centeredCell('มาตรฐาน\nตัวชี้วัด', widths[0], { bold: true, rowSpan: 2 }),
    centeredCell('แบบทดสอบ', widths[1], { bold: true, rowSpan: 2 }),
    centeredCell('ค่าความสอดคล้อง', widths[2] + widths[3] + widths[4], { bold: true, columnSpan: 3 }),
  ]
  if (showComments) first.push(centeredCell('ข้อเสนอแนะ', widths[5], { bold: true, rowSpan: 2 }))

  return [
    // `tableHeader` is what makes Word repeat these two rows at the top of
    // every page the table spills onto, which the source document does too.
    new TableRow({ children: first, tableHeader: true, cantSplit: true }),
    new TableRow({
      children: [
        centeredCell('+1', widths[2], { bold: true }),
        centeredCell('0', widths[3], { bold: true }),
        centeredCell('−1', widths[4], { bold: true }),
      ],
      tableHeader: true,
      cantSplit: true,
    }),
  ]
}

function evaluationBodyRow(
  row: IocPrintRow,
  standardLabel: string,
  rowSpan: number | null,
  showComments: boolean,
): TableRow {
  const widths = evaluationColumns(showComments)
  const children: TableCell[] = []

  if (rowSpan !== null) {
    children.push(cell([text(standardLabel || '—')], { widthMm: widths[0], rowSpan }))
  }

  const itemBlocks: Paragraph[] = []
  if (row.sectionLabel) itemBlocks.push(text(row.sectionLabel, { bold: true }))
  itemBlocks.push(...richTextParagraphs(row.groupIntro))
  const prompt = htmlToDocxParagraphs(row.prompt)
  if (prompt.length === 0) {
    itemBlocks.push(text(`${row.itemLabel}.`, { bold: true }))
  } else {
    prompt.forEach((paragraph, index) => {
      itemBlocks.push(new Paragraph({
        children: index === 0
          ? [new TextRun({ text: `${row.itemLabel}. `, bold: true }), ...runs(paragraph)]
          : runs(paragraph),
        bullet: paragraph.bullet ? { level: 0 } : undefined,
        spacing: { after: 0 },
      }))
    })
  }
  for (const choice of row.choices) {
    const plain = htmlToPlainText(choice)
    if (plain) itemBlocks.push(text(plain))
  }
  children.push(cell(itemBlocks, { widthMm: widths[1] }))

  const tick = (score: -1 | 0 | 1) =>
    centeredCell(row.tick === score ? '✓' : '', widths[score === 1 ? 2 : score === 0 ? 3 : 4])
  children.push(tick(1), tick(0), tick(-1))

  if (showComments) children.push(cell([text(row.comment)], { widthMm: widths[5] }))

  // An exam item split across a page break is the defect the print page spends
  // its whole packing routine avoiding; Word gets there with one flag.
  return new TableRow({ children, cantSplit: true })
}

function summaryHeaderRows(): TableRow[] {
  const w = SUMMARY_COLUMNS
  return [
    new TableRow({
      children: [
        centeredCell('มาตรฐานตัวชี้วัด', w[0], { bold: true, rowSpan: 2 }),
        centeredCell('รายการประเมิน\nข้อสอบ (ข้อที่)', w[1], { bold: true, rowSpan: 2 }),
        centeredCell('ผลการประเมิน (คน)', w[2] + w[3] + w[4], { bold: true, columnSpan: 3 }),
        centeredCell('ดัชนีความ\nสอดคล้อง', w[5], { bold: true, rowSpan: 2 }),
      ],
      tableHeader: true,
      cantSplit: true,
    }),
    new TableRow({
      children: [
        centeredCell('สอดคล้อง', w[2], { bold: true }),
        centeredCell('ไม่แน่ใจ', w[3], { bold: true }),
        centeredCell('ไม่สอดคล้อง', w[4], { bold: true }),
      ],
      tableHeader: true,
      cantSplit: true,
    }),
  ]
}

function summaryBodyRow(row: SummaryPrintRow, rowSpan: number | null): TableRow {
  const w = SUMMARY_COLUMNS
  const children: TableCell[] = []
  if (rowSpan !== null) children.push(cell([text(row.standardLabel || '—')], { widthMm: w[0], rowSpan }))
  children.push(
    centeredCell(row.itemLabel, w[1]),
    centeredCell(String(row.agree), w[2]),
    centeredCell(String(row.unsure), w[3]),
    centeredCell(String(row.disagree), w[4]),
    // The asterisk marks an item below the threshold, explained in a footnote.
    centeredCell(row.belowThreshold ? `${row.index} *` : row.index, w[5]),
  )
  return new TableRow({ children, cantSplit: true })
}

function table(rows: TableRow[], columns: number[]): Table {
  return new Table({
    rows,
    width: mm(USABLE_WIDTH_MM),
    columnWidths: columns.map(width => convertMillimetersToTwip(width)),
  })
}

function signatureBlocks(blocks: readonly IocSignatureBlock[], images: ReadonlyMap<string, Uint8Array>): Paragraph[] {
  if (blocks.length === 0) return []
  const out: Paragraph[] = [new Paragraph({ children: [], spacing: { before: 400 } })]

  for (const block of blocks) {
    const bytes = block.signaturePath ? images.get(block.signaturePath) : undefined
    if (bytes) {
      const size = signatureImageSize(bytes)
      out.push(new Paragraph({
        children: [new ImageRun({ type: 'png', data: bytes, transformation: size })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
      }))
    } else if (block.typedName) {
      out.push(text(block.typedName, { align: AlignmentType.CENTER }))
    } else {
      out.push(text('……………………………………', { align: AlignmentType.CENTER }))
    }

    out.push(text(`(${block.name})`, { align: AlignmentType.CENTER }))
    out.push(text(block.role, { align: AlignmentType.CENTER, spacingAfter: block.signedAt ? 0 : 300 }))
    if (block.signedAt) {
      out.push(text(`ลงนามอิเล็กทรอนิกส์เมื่อ ${block.signedAt}`, {
        align: AlignmentType.CENTER,
        size: SMALL_SIZE,
        spacingAfter: 300,
      }))
    }
  }
  return out
}

function sectionChildren(
  section: PrintSection,
  images: ReadonlyMap<string, Uint8Array>,
): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = []

  for (const line of section.header.titleLines) {
    children.push(text(line, { bold: true, size: TITLE_SIZE, align: AlignmentType.CENTER }))
  }
  if (section.header.subtitle) {
    children.push(text(section.header.subtitle, { align: AlignmentType.CENTER, spacingAfter: 200 }))
  } else {
    children.push(new Paragraph({ children: [], spacing: { after: 200 } }))
  }

  if (section.kind === 'evaluation') {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: 'คำชี้แจง ', bold: true }),
        new TextRun({ text: section.instruction }),
      ],
      spacing: { after: 100 },
    }))
    children.push(text('+1 แน่ใจว่าแบบทดสอบสอดคล้องตัวชี้วัด'))
    children.push(text('  0 ไม่แน่ใจว่าแบบทดสอบสอดคล้องกับตัวชี้วัด'))
    children.push(text(' −1 แน่ใจว่าแบบทดสอบไม่สอดคล้องกับตัวชี้วัด', { spacingAfter: 200 }))

    const rows = [...evaluationHeaderRows(section.showComments)]
    for (const run of groupRowsByStandard(section.rows)) {
      run.rows.forEach((row, index) => {
        rows.push(evaluationBodyRow(
          row,
          section.standardLabels[row.standardId ?? ''] ?? '',
          index === 0 ? run.rows.length : null,
          section.showComments,
        ))
      })
    }
    children.push(table(rows, evaluationColumns(section.showComments)))
  } else {
    for (const fact of section.facts) children.push(text(fact))
    children.push(text(section.percentLine, { bold: true, spacingAfter: 100 }))
    if (section.paragraph) {
      children.push(text('สรุปผลการประเมิน', { bold: true }))
      children.push(text(section.paragraph, { spacingAfter: 200 }))
    }

    const rows = [...summaryHeaderRows()]
    let index = 0
    while (index < section.rows.length) {
      let end = index
      while (
        end + 1 < section.rows.length
        && section.rows[end + 1].standardLabel === section.rows[index].standardLabel
      ) end += 1
      for (let cursor = index; cursor <= end; cursor += 1) {
        rows.push(summaryBodyRow(section.rows[cursor], cursor === index ? end - index + 1 : null))
      }
      index = end + 1
    }
    children.push(table(rows, SUMMARY_COLUMNS))
  }

  children.push(...signatureBlocks(section.signatures, images))

  if (section.kind === 'summary') {
    for (const note of section.footnotes) {
      children.push(text(note, { size: SMALL_SIZE, spacingAfter: 60 }))
    }
  }

  return children
}

export function buildIocDocxDocument(input: IocDocxInput): Document {
  const children: (Paragraph | Table)[] = []

  input.sections.forEach((section, index) => {
    if (index > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }))
    }
    children.push(...sectionChildren(section, input.signatureImages))
  })

  return new Document({
    title: input.title,
    creator: input.author,
    description: 'แบบประเมินความสอดคล้องของมาตรฐานตัวชี้วัดกับแบบทดสอบ (IOC)',
    styles: {
      default: {
        document: {
          run: { font: DOC_FONT, size: BODY_SIZE },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
          margin: {
            top: convertMillimetersToTwip(25),
            right: convertMillimetersToTwip(20),
            bottom: convertMillimetersToTwip(20),
            left: convertMillimetersToTwip(20),
          },
        },
      },
      headers: input.watermarkText
        ? {
            // Word's real watermark is a VML shape this library does not build.
            // A stamp across the head of every page says the same thing, and
            // says it in text a reader can search for.
            default: new Header({
              children: [text(input.watermarkText, {
                align: AlignmentType.CENTER,
                size: SMALL_SIZE,
              })],
            }),
          }
        : undefined,
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              // Word counts the pages itself, so this is a field rather than a
              // number worked out in advance — edit the document and it stays
              // right, which a printed-to-PDF page number would not.
              tabStops: [{ type: TabStopType.RIGHT, position: convertMillimetersToTwip(USABLE_WIDTH_MM) }],
              children: [
                new TextRun({ text: input.criteriaNote ?? '', size: SMALL_SIZE }),
                new TextRun({ text: '\t หน้า ', size: SMALL_SIZE }),
                new TextRun({ children: [PageNumber.CURRENT], size: SMALL_SIZE }),
                new TextRun({ text: ' จาก ', size: SMALL_SIZE }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: SMALL_SIZE }),
              ],
            }),
          ],
        }),
      },
      children,
    }],
  })
}

export async function packIocDocx(document: Document): Promise<Buffer> {
  return Packer.toBuffer(document)
}

/**
 * A filename a teacher can find again, with the characters a filesystem
 * refuses turned into spaces rather than deleted — "ภาคเรียนที่ 2/2569" must
 * not come out as "22569".
 */
export function iocDocxFileName(input: {
  doc: 'blank' | 'expert' | 'summary' | 'book'
  examTitle: string
  expertName?: string | null
  generatedAt: Date
}): string {
  const kind = {
    blank: 'ฟอร์มเปล่า',
    expert: input.expertName ? `ฉบับ ${input.expertName}` : 'ฉบับผู้ทรงคุณวุฒิ',
    summary: 'สรุปผล',
    book: 'เล่มรวม',
  }[input.doc]

  // Only what a filesystem refuses, and it becomes a space rather than being
  // deleted: "ภาคเรียนที่ 2/2569" must not come out as "22569".
  const safe = (value: string) => value
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const stamp = input.generatedAt.toISOString().slice(0, 10)
  return `IOC-${safe(kind)}-${safe(input.examTitle).slice(0, 60) || 'IOC'}-${stamp}.docx`
}
