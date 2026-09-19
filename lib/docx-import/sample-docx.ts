/**
 * The example worksheet, as a real .docx a teacher can open and copy.
 *
 * Built from the profile's own `sample` — the same lines the screen draws — so
 * the advice, the picture of the page, and the file handed over cannot say
 * three different things. What makes it worth generating rather than keeping a
 * file in `public/` is `sample-docx.test.ts`: it reads every generated sample
 * back through `parseDocx` and checks the โจทย์ that come out. A change to the
 * parser that would leave teachers with an example the app itself cannot read
 * fails there, in the same commit, instead of in someone's inbox.
 *
 * Server only — `docx` is a large dependency and nothing here belongs in a
 * browser bundle.
 */
import {
  AlignmentType, Document, HorizontalPositionRelativeFrom, ImageRun, LevelFormat, Packer, Paragraph,
  Table, TableCell, TableRow, TextRun, VerticalPositionRelativeFrom, WidthType, WpsShapeRun,
} from 'docx'
import { numberSampleLines, type ImportProfile, type NumberedSampleLine, type SampleLine, type SampleSpan } from './profiles'
import { SAMPLE_DIAGRAM_PNG, SAMPLE_DIAGRAM_SIZE } from './sample-diagram'

/** What Thai school paperwork is set in; Word substitutes if it is missing. */
const DOC_FONT = 'TH SarabunPSK'
/** Half-points, so 32 is the 16pt a Thai worksheet is usually typed at. */
const BODY_SIZE = 32

/**
 * Word's own "Dark Red" swatch, which is what a teacher reaches for when
 * marking a เฉลย. Bold as well as red: both are markers the parser accepts, and
 * an example that carries two survives a file passing through Google Docs or a
 * theme that rewrites colours.
 */
const ANSWER_COLOR = 'C00000'

const NUMBERING_REFERENCE = 'korkru-question-list'

function runsOf(spans: SampleSpan[], { bold = false } = {}): TextRun[] {
  return spans.map(span => new TextRun({
    text: span.text,
    font: DOC_FONT,
    size: BODY_SIZE,
    bold: bold || span.answer,
    color: span.answer ? ANSWER_COLOR : undefined,
  }))
}

function paragraphFor(line: SampleLine, marker: string): Paragraph {
  if (line.kind === 'heading') {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: runsOf(line.spans, { bold: true }),
    })
  }

  // โจทย์ and its sub-questions are numbered by Word, from the list definition
  // below — which is the one thing the parser needs in order to tell where one
  // โจทย์ ends and the next begins.
  if (line.kind === 'question') {
    return new Paragraph({
      numbering: { reference: NUMBERING_REFERENCE, level: 0 },
      spacing: { before: 120 },
      children: runsOf(line.spans),
    })
  }

  if (line.kind === 'part') {
    return new Paragraph({
      numbering: { reference: NUMBERING_REFERENCE, level: 1 },
      children: runsOf(line.spans),
    })
  }

  // A choice's "1)" — and a เรียงลำดับ item's "1." — is typed, not drawn by
  // Word: the parser reads it out of the text, and a worksheet written any
  // other way is one it cannot tell from a sub-question.
  return new Paragraph({
    indent: { left: 720 },
    // The orders a เรียงลำดับ ข้อ offers sit under its list with a line's air
    // between, the way the printed paper sets them.
    ...(line.kind === 'choice' ? { spacing: { before: 60 } } : {}),
    children: [
      new TextRun({ text: `${marker} `, font: DOC_FONT, size: BODY_SIZE }),
      ...runsOf(line.spans),
    ],
  })
}

const BOX_SIZE = { width: 88, height: 26 }

/** Word measures a floating shape's position in EMU and its size in pixels. */
const EMU_PER_PIXEL = 9525

/**
 * The diagram of a เติมคำในรูป ข้อ, with its answer boxes standing on it.
 *
 * The picture is placed inline — in the run order, not floating — because
 * that is the one thing the reader needs from it: a floating picture is
 * anchored whereever Word likes and cannot be said to belong to this ข้อ.
 * The boxes are the opposite: each is a floating text box, which is how a
 * teacher puts an answer somewhere in particular on a page, and is what the
 * reader counts to know how many ช่อง the ข้อ has.
 *
 * They stand on the picture rather than around it with lines drawn in, which
 * a worksheet more often does. Drawing those lines here would mean drawing
 * real Word *connectors* — anything else is a shape with no text in it, which
 * is precisely what an empty answer box is — and the plainer layout is the
 * truer example anyway: what makes a ช่อง is the box.
 */
function pictureParagraph(line: SampleLine): Paragraph {
  const boxes = line.boxes ?? []
  const percent = (value: number, total: number) => Math.round((value / 100) * total) * EMU_PER_PIXEL

  return new Paragraph({
    spacing: { before: 120, after: 120 },
    children: [
      new ImageRun({
        type: 'png',
        data: SAMPLE_DIAGRAM_PNG,
        transformation: SAMPLE_DIAGRAM_SIZE,
        altText: { name: 'วงจรไฟฟ้า', description: 'แผนผังวงจรไฟฟ้าอย่างง่าย', title: 'วงจรไฟฟ้า' },
      }),
      ...boxes.map(box => {
        return new WpsShapeRun({
          type: 'wps',
          transformation: BOX_SIZE,
          // A plain outlined box on white. Left to the theme it would come out
          // as Word's default filled blue shape, which reads as decoration
          // rather than as somewhere a student writes an answer.
          solidFill: { type: 'rgb', value: 'FFFFFF' },
          outline: { type: 'solidFill', solidFillType: 'rgb', value: '334155', width: 9525 },
          floating: {
            // Measured from the text column and from the top of this
            // paragraph, which is where the picture starts — the two the
            // reader can make sense of. See `DocxShape`.
            horizontalPosition: {
              relative: HorizontalPositionRelativeFrom.COLUMN,
              offset: percent(box.x, SAMPLE_DIAGRAM_SIZE.width),
            },
            verticalPosition: {
              relative: VerticalPositionRelativeFrom.PARAGRAPH,
              offset: percent(box.y, SAMPLE_DIAGRAM_SIZE.height),
            },
            allowOverlap: true,
          },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: runsOf([box]),
          })],
        })
      }),
    ],
  })
}

/**
 * One row of a จับคู่ table: the ข้อ on the left, the ตัวเลือก on the right.
 *
 * Written as a real Word table because that is the only thing the reader
 * accepts, and rightly: which cell sits beside which is the whole โจทย์, and a
 * worksheet that lays its two columns out with tab stops loses that the moment
 * the text is extracted.
 */
function pairRow({ line, marker, rightMarker }: NumberedSampleLine): TableRow {
  const cell = (label: string, spans: SampleSpan[]) => new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    children: [new Paragraph({
      children: spans.length === 0 && !label
        ? []
        : [new TextRun({ text: label ? `${label} ` : '', font: DOC_FONT, size: BODY_SIZE }), ...runsOf(spans)],
    })],
  })

  return new TableRow({
    children: [cell(marker, line.spans), cell(rightMarker ?? '', line.right ?? [])],
  })
}

/** Consecutive จับคู่ rows become one table; everything else stays a paragraph. */
function bodyOf(lines: NumberedSampleLine[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []
  let rows: NumberedSampleLine[] = []

  const flush = () => {
    if (rows.length === 0) return
    out.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: rows.map(pairRow),
    }))
    rows = []
  }

  for (const entry of lines) {
    if (entry.line.kind === 'pair') { rows.push(entry); continue }
    flush()
    out.push(entry.line.kind === 'picture'
      ? pictureParagraph(entry.line)
      : paragraphFor(entry.line, entry.marker))
  }
  flush()

  return out
}

export function buildSampleDocument(profile: ImportProfile): Document {
  const children = bodyOf(numberSampleLines(profile.sample))

  return new Document({
    title: `ตัวอย่างไฟล์นำเข้า ${profile.label}`,
    description: 'ไฟล์ตัวอย่างสำหรับการนำเข้าโจทย์จากไฟล์ Word ของ KorKru',
    numbering: {
      config: [{
        reference: NUMBERING_REFERENCE,
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START },
          // ก) ข) ค) — the labels a Thai worksheet gives sub-questions, and the
          // format `draft.ts` reads back to label them the same way.
          { level: 1, format: LevelFormat.THAI_LETTERS, text: '%2)', alignment: AlignmentType.START },
        ],
      }],
    },
    sections: [{
      properties: { page: { margin: { top: 1418, right: 1134, bottom: 1134, left: 1134 } } },
      children,
    }],
  })
}

export async function packSampleDocx(profile: ImportProfile): Promise<Buffer> {
  return Packer.toBuffer(buildSampleDocument(profile))
}

/** A name that says what the file is once it is sitting in Downloads. */
export function sampleFileName(profile: ImportProfile): string {
  return `ตัวอย่างไฟล์นำเข้า-${profile.label.replace(/[\\/:*?"<>|]/g, ' ').trim()}.docx`
}
