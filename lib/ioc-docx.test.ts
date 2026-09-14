import { describe, expect, it } from 'vitest'
import {
  buildIocDocxDocument,
  iocDocxFileName,
  packIocDocx,
  pngDimensions,
  signatureImageSize,
} from './ioc-docx'
import type { PrintSection } from './ioc-print'

/** A real 1×1 PNG, so the packer has bytes it can actually embed. */
const TINY_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
)

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return bytes
}

function evaluationSection(overrides: Partial<Extract<PrintSection, { kind: 'evaluation' }>> = {}): PrintSection {
  return {
    kind: 'evaluation',
    key: 'blank',
    header: { titleLines: ['แบบประเมินความสอดคล้อง'], subtitle: null },
    instruction: 'โปรดพิจารณาข้อสอบแต่ละข้อ',
    rows: [
      {
        itemId: 'a',
        itemLabel: '1',
        sectionLabel: 'ตอนที่ 1',
        groupIntro: '',
        prompt: '<p>ข้อใดถูกต้อง</p>',
        choices: ['<p>ก. หนึ่ง</p>', '<p>ข. สอง</p>'],
        standardId: 's1',
        tick: 1,
        comment: 'ชัดเจนดี',
      },
      {
        itemId: 'b',
        itemLabel: '2',
        sectionLabel: '',
        groupIntro: '',
        prompt: '<p>จงหาค่า x</p>',
        choices: [],
        standardId: 's1',
        tick: -1,
        comment: '',
      },
    ],
    standardLabels: { s1: 'ค 3.1 ม.6/1 ใช้ข้อมูลข่าวสาร' },
    showComments: true,
    signatures: [
      { name: 'ครูสมชาย', role: 'ผู้ออกข้อสอบ', imageUrl: null, signaturePath: null, typedName: null, signedAt: null },
    ],
    ...overrides,
  } as PrintSection
}

const summarySection: PrintSection = {
  kind: 'summary',
  key: 'summary',
  header: { titleLines: ['ตารางแสดงผลการประเมิน'], subtitle: null },
  facts: ['ผู้ออกข้อสอบ ครูสมชาย'],
  percentLine: 'ร้อยละความสอดคล้อง 50.00',
  paragraph: 'ผลการประเมินพบว่า 1 จาก 2 ข้อผ่านเกณฑ์',
  rows: [
    { itemLabel: '1', standardLabel: 'ค 3.1 ม.6/1', agree: 3, unsure: 0, disagree: 0, index: '1.00', belowThreshold: false },
    { itemLabel: '2', standardLabel: 'ค 3.1 ม.6/1', agree: 1, unsure: 1, disagree: 1, index: '0.00', belowThreshold: true },
  ],
  footnotes: ['N = 3'],
  signatures: [],
}

function input(sections: PrintSection[], signatureImages = new Map<string, Uint8Array>()) {
  return {
    sections,
    criteriaNote: 'เกณฑ์: ค่า IOC ตั้งแต่ 0.50 ขึ้นไป',
    watermarkText: 'สำเนาเพื่อประเมินความสอดคล้อง',
    signatureImages,
    title: 'แบบทดสอบกลางภาค',
    author: 'ครูสมชาย',
  }
}

/**
 * Entry names sit uncompressed in a zip's local headers, so the parts of the
 * document can be listed without inflating anything — which keeps this test
 * from depending on a zip library the project does not declare.
 */
function zipEntryNames(file: Buffer): string[] {
  const names: string[] = []
  for (let at = 0; at + 30 <= file.length; at += 1) {
    if (file.readUInt32LE(at) !== 0x04034b50) continue
    const nameLength = file.readUInt16LE(at + 26)
    if (nameLength === 0 || at + 30 + nameLength > file.length) continue
    names.push(file.subarray(at + 30, at + 30 + nameLength).toString('utf8'))
  }
  return names
}

describe('pngDimensions', () => {
  it('reads width and height out of the IHDR chunk', () => {
    expect(pngDimensions(pngHeader(640, 200))).toEqual({ width: 640, height: 200 })
  })

  it('falls back rather than throwing on something that is not a PNG', () => {
    expect(pngDimensions(Uint8Array.from([1, 2, 3]))).toEqual({ width: 300, height: 100 })
    expect(pngDimensions(new Uint8Array(30))).toEqual({ width: 300, height: 100 })
  })
})

describe('signatureImageSize', () => {
  it('fits a wide signature to the printed width', () => {
    expect(signatureImageSize(pngHeader(900, 300))).toEqual({ width: 150, height: 50 })
  })

  it('fits a tall signature to the printed height instead', () => {
    expect(signatureImageSize(pngHeader(300, 300))).toEqual({ width: 60, height: 60 })
  })

  it('never scales to nothing', () => {
    const size = signatureImageSize(pngHeader(5000, 1))
    expect(size.width).toBeGreaterThan(0)
    expect(size.height).toBeGreaterThan(0)
  })
})

describe('iocDocxFileName', () => {
  const at = new Date('2026-09-14T10:00:00Z')

  it('names each document by what it is', () => {
    expect(iocDocxFileName({ doc: 'blank', examTitle: 'กลางภาค', generatedAt: at }))
      .toBe('IOC-ฟอร์มเปล่า-กลางภาค-2026-09-14.docx')
    expect(iocDocxFileName({ doc: 'summary', examTitle: 'กลางภาค', generatedAt: at }))
      .toBe('IOC-สรุปผล-กลางภาค-2026-09-14.docx')
    expect(iocDocxFileName({ doc: 'book', examTitle: 'กลางภาค', generatedAt: at }))
      .toBe('IOC-เล่มรวม-กลางภาค-2026-09-14.docx')
  })

  it('puts the expert’s name on their own copy', () => {
    expect(iocDocxFileName({ doc: 'expert', examTitle: 'กลางภาค', expertName: 'ดร.สมหญิง', generatedAt: at }))
      .toBe('IOC-ฉบับ ดร.สมหญิง-กลางภาค-2026-09-14.docx')
  })

  it('turns a slash into a space instead of deleting it', () => {
    // "2/2569" must not come out as "22569".
    expect(iocDocxFileName({ doc: 'summary', examTitle: 'ภาคเรียนที่ 2/2569', generatedAt: at }))
      .toBe('IOC-สรุปผล-ภาคเรียนที่ 2 2569-2026-09-14.docx')
  })

  it('still produces a name when the exam has no title', () => {
    expect(iocDocxFileName({ doc: 'blank', examTitle: '', generatedAt: at }))
      .toBe('IOC-ฟอร์มเปล่า-IOC-2026-09-14.docx')
  })
})

describe('buildIocDocxDocument', () => {
  it('packs an evaluation document into a readable docx zip', async () => {
    const file = await packIocDocx(buildIocDocxDocument(input([evaluationSection()])))
    expect(file.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    const names = zipEntryNames(file)
    expect(names).toContain('word/document.xml')
    expect(names).toContain('word/footer1.xml')
    expect(names).toContain('word/header1.xml')
  })

  it('leaves out the header part when no watermark was asked for', async () => {
    const file = await packIocDocx(buildIocDocxDocument({ ...input([evaluationSection()]), watermarkText: null }))
    expect(zipEntryNames(file)).not.toContain('word/header1.xml')
  })

  it('embeds a signature image as a media part', async () => {
    const section = evaluationSection({
      signatures: [
        { name: 'ครูสมชาย', role: 'ผู้ออกข้อสอบ', imageUrl: null, signaturePath: 'a/b.png', typedName: null, signedAt: null },
      ],
    })
    const file = await packIocDocx(buildIocDocxDocument(
      input([section], new Map([['a/b.png', TINY_PNG]])),
    ))
    expect(zipEntryNames(file).some(name => name.startsWith('word/media/'))).toBe(true)
  })

  it('carries no media when signatures were turned off', async () => {
    const file = await packIocDocx(buildIocDocxDocument(input([evaluationSection()])))
    expect(zipEntryNames(file).some(name => name.startsWith('word/media/'))).toBe(false)
  })

  it('packs the summary document', async () => {
    const file = await packIocDocx(buildIocDocxDocument(input([summarySection])))
    expect(zipEntryNames(file)).toContain('word/document.xml')
  })

  it('grows when the whole book is bound together', async () => {
    const one = await packIocDocx(buildIocDocxDocument(input([evaluationSection()])))
    const book = await packIocDocx(buildIocDocxDocument(
      input([evaluationSection(), evaluationSection({ key: 'expert-1' }), summarySection]),
    ))
    expect(book.length).toBeGreaterThan(one.length)
  })

  it('builds a document with no rows at all rather than throwing', async () => {
    const empty = evaluationSection({ rows: [], standardLabels: {} })
    await expect(packIocDocx(buildIocDocxDocument(input([empty])))).resolves.toBeInstanceOf(Buffer)
  })
})
