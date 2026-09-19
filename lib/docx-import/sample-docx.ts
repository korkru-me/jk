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
import { AlignmentType, Document, LevelFormat, Packer, Paragraph, TextRun } from 'docx'
import { numberSampleLines, type ImportProfile, type SampleLine, type SampleSpan } from './profiles'

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

export function buildSampleDocument(profile: ImportProfile): Document {
  const children = numberSampleLines(profile.sample)
    .map(({ line, marker }) => paragraphFor(line, marker))

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
