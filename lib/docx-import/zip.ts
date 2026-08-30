/**
 * The slice of the ZIP container a .docx needs, and nothing else.
 *
 * A .docx is a ZIP holding `word/document.xml` (the text), `word/numbering.xml`
 * (what "1." "2." actually say, since Word numbers lists rather than typing the
 * digits), `word/_rels/document.xml.rels` (which relationship id points at
 * which picture) and `word/media/*` (the picture bytes). Getting at those four
 * things is the whole reason this file exists.
 *
 * Written by hand rather than pulled from a package because the project has no
 * zip dependency of its own — `jszip` and `pako` are only in node_modules as
 * something `exceljs` happens to need, and reaching into another package's
 * transitive tree is a dependency the lockfile does not admit to. Inflating is
 * `DecompressionStream`, which browsers and Node both ship, so the same code
 * runs in the teacher's browser and in vitest.
 */

/** `PK\x03\x04` — start of a local file header. */
const LOCAL_HEADER_SIGNATURE = 0x04034b50
/** `PK\x01\x02` — start of a central directory entry. */
const CENTRAL_HEADER_SIGNATURE = 0x02014b50
/** `PK\x05\x06` — the end-of-central-directory record. */
const EOCD_SIGNATURE = 0x06054b50

/** EOCD is 22 bytes plus a comment that the format caps at 64 KB. */
const EOCD_MIN_SIZE = 22
const MAX_COMMENT_SIZE = 0xffff

const STORED = 0
const DEFLATED = 8

export class ZipError extends Error {}

/**
 * Inflates one raw deflate stream.
 *
 * `Blob.stream()` rather than writing into the transform by hand: a writer that
 * is not drained while nothing reads the other end deadlocks on anything larger
 * than the stream's internal queue, and `word/document.xml` is well past it.
 */
async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Walks back from the end of the file for the EOCD signature. */
function findEndOfCentralDirectory(view: DataView): number {
  const earliest = Math.max(0, view.byteLength - EOCD_MIN_SIZE - MAX_COMMENT_SIZE)
  for (let i = view.byteLength - EOCD_MIN_SIZE; i >= earliest; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) return i
  }
  throw new ZipError('ไฟล์นี้ไม่ใช่ไฟล์ .docx ที่อ่านได้')
}

export interface ZipReadOptions {
  /** Return only entries this says yes to. Everything else is skipped before
   *  it is inflated, which is most of a .docx — themes, fonts, settings. */
  include?: (name: string) => boolean
}

/**
 * Reads a ZIP into `path -> bytes`.
 *
 * Sizes and the compression method are taken from the central directory rather
 * than from each local header: a local header is allowed to defer both to a
 * trailing data descriptor and write zeros in their place, and Word does
 * exactly that often enough to matter. The local header is read only for its
 * two length fields, which say where this entry's bytes actually begin.
 */
export async function readZip(
  data: Uint8Array,
  { include }: ZipReadOptions = {},
): Promise<Map<string, Uint8Array>> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const eocd = findEndOfCentralDirectory(view)

  const entryCount = view.getUint16(eocd + 10, true)
  const directoryOffset = view.getUint32(eocd + 16, true)

  // ZIP64 parks these at their sentinel values and puts the real ones in a
  // separate record. No .docx a teacher can produce is anywhere near 4 GB or
  // 65,535 parts, so say so plainly instead of half-supporting it.
  if (directoryOffset === 0xffffffff || entryCount === 0xffff) {
    throw new ZipError('ไฟล์นี้ใหญ่เกินกว่าที่ระบบจะอ่านได้')
  }

  const decoder = new TextDecoder('utf-8')
  const files = new Map<string, Uint8Array>()

  let cursor = directoryOffset
  for (let i = 0; i < entryCount; i++) {
    if (cursor + 46 > view.byteLength || view.getUint32(cursor, true) !== CENTRAL_HEADER_SIGNATURE) {
      throw new ZipError('ไฟล์ .docx เสียหาย อ่านรายการไฟล์ข้างในไม่ได้')
    }

    const method = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = decoder.decode(data.subarray(cursor + 46, cursor + 46 + nameLength))

    cursor += 46 + nameLength + extraLength + commentLength

    if (include && !include(name)) continue
    // Directory entries are recorded like any other, with no bytes behind them.
    if (name.endsWith('/')) continue

    if (localOffset + 30 > view.byteLength || view.getUint32(localOffset, true) !== LOCAL_HEADER_SIGNATURE) {
      throw new ZipError(`ไฟล์ .docx เสียหายที่ส่วน "${name}"`)
    }
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const raw = data.subarray(start, start + compressedSize)

    if (method === STORED) files.set(name, raw)
    else if (method === DEFLATED) files.set(name, await inflateRaw(raw))
    else throw new ZipError(`ไฟล์ .docx ใช้การบีบอัดที่ระบบยังอ่านไม่ได้ (${method})`)
  }

  return files
}
