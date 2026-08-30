/**
 * Reading a Word worksheet into draft โจทย์.
 *
 * The whole path runs in the teacher's browser: the .docx never leaves their
 * machine, and only the pictures they confirm are uploaded. That is a privacy
 * property worth keeping — an exam file before the exam is the one document a
 * teacher is least willing to post anywhere — and it is also what lets the
 * import work with no key, no quota and no per-file cost attached to it.
 *
 * `parseDocxFile` is the whole public surface. Everything under it is split by
 * what it reads rather than by what it produces, so each piece is testable on
 * its own: `zip` unwraps the container, `xml` reads a part, `omml` turns Word
 * equations into TeX, `docx` reduces a document to blocks, `draft` decides
 * where one โจทย์ ends and the next begins.
 */
import { readZip, ZipError } from './zip'
import { readDocument, DocxError } from './docx'
import { buildDrafts, type DraftQuestion, type DraftResult } from './draft'

export type {
  DraftQuestion, DraftChoice, DraftPart, DraftResult, DraftWarning,
  DraftWarningCode, DraftQuestionType,
} from './draft'
export { DocxError } from './docx'
export { ZipError } from './zip'

const DOCUMENT_PART = 'word/document.xml'
const NUMBERING_PART = 'word/numbering.xml'
const RELS_PART = 'word/_rels/document.xml.rels'
const MEDIA_PREFIX = 'word/media/'

export interface DocxMedia {
  /** Path inside the package, e.g. `media/image1.png`. */
  path: string
  bytes: Uint8Array
  /** Guessed from the extension — enough for an upload and a preview. */
  contentType: string
}

export interface ParsedDocx extends DraftResult {
  /** Relationship id → the picture it points at. Ids with no picture behind
   *  them are left out, so a caller can treat a missing id as "no image". */
  media: Map<string, DocxMedia>
}

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  emf: 'image/emf',
  wmf: 'image/wmf',
}

function contentTypeOf(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  return CONTENT_TYPES[extension] ?? 'application/octet-stream'
}

/** Formats Word stores that no browser can display or upload as a picture. */
export function isDisplayableImage(contentType: string): boolean {
  return contentType === 'image/png'
    || contentType === 'image/jpeg'
    || contentType === 'image/gif'
    || contentType === 'image/webp'
}

export class DocxImportError extends Error {}

/**
 * Parses one .docx into draft โจทย์ plus the pictures they refer to.
 *
 * Only the four parts that matter are inflated. A worksheet's theme, fonts and
 * settings are most of the file and none of the meaning.
 */
export async function parseDocx(bytes: Uint8Array): Promise<ParsedDocx> {
  let parts: Map<string, Uint8Array>
  try {
    parts = await readZip(bytes, {
      include: name =>
        name === DOCUMENT_PART || name === NUMBERING_PART || name === RELS_PART || name.startsWith(MEDIA_PREFIX),
    })
  } catch (error) {
    if (error instanceof ZipError) throw new DocxImportError(error.message)
    throw new DocxImportError('เปิดไฟล์ .docx ไม่ได้ ไฟล์อาจเสียหาย')
  }

  const documentPart = parts.get(DOCUMENT_PART)
  if (!documentPart) {
    throw new DocxImportError('ไฟล์นี้ไม่ใช่เอกสาร Word (.docx) — ถ้าเป็นไฟล์ .doc รุ่นเก่า ให้เปิดใน Word แล้ว Save As เป็น .docx ก่อน')
  }

  const decoder = new TextDecoder('utf-8')
  const decode = (part: Uint8Array | undefined) => part ? decoder.decode(part) : null

  let document
  try {
    document = readDocument({
      document: decoder.decode(documentPart),
      numbering: decode(parts.get(NUMBERING_PART)),
      rels: decode(parts.get(RELS_PART)),
    })
  } catch (error) {
    if (error instanceof DocxError) throw new DocxImportError(error.message)
    throw new DocxImportError('อ่านเนื้อหาในไฟล์ Word ไม่ได้ ไฟล์อาจเสียหาย')
  }

  const drafts = buildDrafts(document)

  const media = new Map<string, DocxMedia>()
  for (const [relId, target] of document.rels) {
    // A document's relationships point at its styles, its numbering and its
    // settings as well as at its pictures; only the pictures belong here.
    if (!target.startsWith('media/')) continue
    const bytes = parts.get(`word/${target}`)
    if (!bytes) continue
    media.set(relId, { path: target, bytes, contentType: contentTypeOf(target) })
  }

  return { ...drafts, media }
}

/** Every relationship id the drafts actually point at, in first-seen order. */
export function usedImageRelIds(questions: DraftQuestion[]): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  for (const question of questions) {
    for (const relId of question.imageRelIds) {
      if (seen.has(relId)) continue
      seen.add(relId)
      order.push(relId)
    }
  }
  return order
}
