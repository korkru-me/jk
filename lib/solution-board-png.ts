import { validateDrawingScene, type DrawingSceneValidationResult } from '@/lib/drawing-board-policy'
import { MAX_WORK_SCENE_BYTES } from '@/lib/math-work'
import type { ScratchpadScene } from '@/lib/scratchpad'

/**
 * A board-drawn เฉลย carries its own scene inside its PNG.
 *
 * The picture is what students and every other page see; the scene is what
 * lets the teacher reopen it on the board and keep writing, the way a saved
 * กระดานสอน reopens. Keeping the scene in an `iTXt` chunk of the same file
 * means the two cannot drift apart, and needs no second file, column or
 * bucket rule — to everything else it is an ordinary PNG. The scene is only
 * ever read back into a teacher's own editor, and it passes the same strict
 * validator as a stored กระดานสอน before it gets there.
 */

export const SOLUTION_BOARD_SCENE_KEYWORD = 'korkru-solution-board'

/** Ceiling on the scene once inflated, so a crafted file cannot balloon. */
export const MAX_SOLUTION_BOARD_SCENE_BYTES = MAX_WORK_SCENE_BYTES

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let crc = 0xffffffff
  for (let index = start; index < end; index++) crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

interface Chunk {
  type: string
  start: number
  dataStart: number
  dataEnd: number
  end: number
}

/** Every chunk of a well-formed PNG that ends at its IEND, or null. */
function readChunks(bytes: Uint8Array): Chunk[] | null {
  if (bytes.length < SIGNATURE.length || SIGNATURE.some((byte, index) => bytes[index] !== byte)) return null
  const chunks: Chunk[] = []
  let offset = SIGNATURE.length
  while (offset + 12 <= bytes.length) {
    const dataStart = offset + 8
    const dataEnd = dataStart + readUint32(bytes, offset)
    const end = dataEnd + 4
    if (end > bytes.length) return null
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
    chunks.push({ type, start: offset, dataStart, dataEnd, end })
    if (type === 'IEND') return end === bytes.length ? chunks : null
    offset = end
  }
  return null
}

function keywordOf(bytes: Uint8Array, chunk: Chunk): string | null {
  const limit = Math.min(chunk.dataEnd, chunk.dataStart + 80)
  for (let index = chunk.dataStart; index < limit; index++) {
    if (bytes[index] === 0) return String.fromCharCode(...bytes.subarray(chunk.dataStart, index))
  }
  return null
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function textChunk(keyword: string, text: Uint8Array, compressed: boolean): Uint8Array {
  // keyword, NUL, compression flag, compression method (zlib), empty language
  // tag and translated keyword (each NUL-terminated), then the text itself.
  const data = concat([
    Uint8Array.from(keyword, character => character.charCodeAt(0)),
    Uint8Array.of(0, compressed ? 1 : 0, 0, 0, 0),
    text,
  ])
  const chunk = new Uint8Array(12 + data.length)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  chunk.set([0x69, 0x54, 0x58, 0x74], 4) // "iTXt"
  chunk.set(data, 8)
  view.setUint32(8 + data.length, crc32(chunk, 4, 8 + data.length))
  return chunk
}

/** Adds this keyword's `iTXt` chunk before IEND, replacing an older one. */
export function writePngText(png: Uint8Array, keyword: string, text: Uint8Array, compressed: boolean): Uint8Array<ArrayBuffer> {
  const chunks = readChunks(png)
  if (!chunks) throw new Error('ไฟล์ภาพจากกระดานไม่ใช่ PNG ที่อ่านได้')
  const kept = chunks.filter(chunk => !(chunk.type === 'iTXt' && keywordOf(png, chunk) === keyword))
  const iend = kept[kept.length - 1]
  return concat([
    png.subarray(0, SIGNATURE.length),
    ...kept.slice(0, -1).map(chunk => png.subarray(chunk.start, chunk.end)),
    textChunk(keyword, text, compressed),
    png.subarray(iend.start, iend.end),
  ])
}

/** This keyword's `iTXt` text, only if its chunk is intact. */
export function readPngText(png: Uint8Array, keyword: string): { text: Uint8Array<ArrayBuffer>; compressed: boolean } | null {
  const chunks = readChunks(png)
  if (!chunks) return null
  for (const chunk of chunks) {
    if (chunk.type !== 'iTXt' || keywordOf(png, chunk) !== keyword) continue
    if (crc32(png, chunk.start + 4, chunk.dataEnd) !== readUint32(png, chunk.dataEnd)) return null
    let offset = chunk.dataStart + keyword.length + 1
    const compressed = png[offset]
    const method = png[offset + 1]
    if ((compressed !== 0 && compressed !== 1) || method !== 0) return null
    offset += 2
    for (let terminators = 0; terminators < 2; terminators++) {
      while (offset < chunk.dataEnd && png[offset] !== 0) offset++
      if (offset >= chunk.dataEnd) return null
      offset++
    }
    return { text: png.slice(offset, chunk.dataEnd), compressed: compressed === 1 }
  }
  return null
}

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | null> {
  if (typeof CompressionStream !== 'function') return null
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function inflate(bytes: Uint8Array<ArrayBuffer>, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (typeof DecompressionStream !== 'function') return null
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader()
  const parts: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) {
        await reader.cancel()
        return null
      }
      parts.push(value)
    }
  } catch {
    return null
  }
  return concat(parts)
}

/**
 * Puts the scene into the board's PNG. Compressed where the browser can,
 * which is every current one; a browser that cannot still gets a board that
 * reopens, only in a larger file.
 */
export async function embedSolutionBoardScene(png: Uint8Array, scene: ScratchpadScene): Promise<Uint8Array<ArrayBuffer>> {
  const json = new TextEncoder().encode(JSON.stringify(scene))
  if (json.length > MAX_SOLUTION_BOARD_SCENE_BYTES) {
    throw new Error('กระดานนี้มีเส้นมากเกินกว่าจะเก็บไว้แก้ต่อได้ ลองแบ่งเป็นหลายขั้น')
  }
  const compressed = await deflate(json)
  return writePngText(png, SOLUTION_BOARD_SCENE_KEYWORD, compressed ?? json, compressed !== null)
}

/** The scene inside a board picture — unvalidated — or null when there is none to read. */
export async function extractSolutionBoardScene(png: Uint8Array): Promise<unknown> {
  const found = readPngText(png, SOLUTION_BOARD_SCENE_KEYWORD)
  if (!found) return null
  const bytes = found.compressed
    ? await inflate(found.text, MAX_SOLUTION_BOARD_SCENE_BYTES)
    : found.text.length <= MAX_SOLUTION_BOARD_SCENE_BYTES ? found.text : null
  if (!bytes) return null
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return null
  }
}

/**
 * The strict check a stored กระดานสอน passes, with one difference: the
 * กระดานเขียนเฉลย has no way to take a picture in, so any image is refused.
 */
export function validateSolutionBoardScene(value: unknown): DrawingSceneValidationResult {
  return validateDrawingScene(value, { role: 'teacher', verifyTeacherImage: () => 'invalid' })
}
