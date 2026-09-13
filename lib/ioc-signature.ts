/**
 * Signatures arrive from a canvas as a data URL and are stored as PNG files in
 * a private bucket. This is the gate between the two: nothing reaches Storage
 * that is not a PNG of a believable size.
 */

export type IocSignatureMode = 'drawn' | 'uploaded' | 'typed' | 'none'

/** The bucket caps a file at 256 KB; refuse earlier, with a sentence. */
export const IOC_SIGNATURE_MAX_BYTES = 200 * 1024

const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/

export type ParsedSignature =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: string }

/** PNG's magic number, so a renamed JPEG cannot walk in behind the prefix. */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function parseIocSignatureDataUrl(dataUrl: string): ParsedSignature {
  const match = PNG_DATA_URL.exec(dataUrl.trim())
  if (!match) return { ok: false, error: 'ลายเซ็นต้องเป็นรูป PNG' }

  let bytes: Uint8Array
  try {
    const binary = atob(match[1])
    bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  } catch {
    return { ok: false, error: 'อ่านรูปลายเซ็นไม่ได้ กรุณาเซ็นใหม่อีกครั้ง' }
  }

  if (bytes.length === 0) return { ok: false, error: 'ยังไม่ได้เซ็น กรุณาเซ็นในกรอบก่อน' }
  if (bytes.length > IOC_SIGNATURE_MAX_BYTES) {
    return { ok: false, error: 'รูปลายเซ็นใหญ่เกินไป กรุณาเซ็นใหม่หรือใช้รูปที่เล็กลง' }
  }
  if (PNG_MAGIC.some((byte, index) => bytes[index] !== byte)) {
    return { ok: false, error: 'ไฟล์นี้ไม่ใช่ PNG' }
  }

  return { ok: true, bytes }
}

/** Where one expert's signature lives, one file per expert per form. */
export function iocSignaturePath(orgId: string, formId: string, expertId: string): string {
  return `${orgId}/${formId}/expert-${expertId}.png`
}

/** The author signs once per form, separately from the panel. */
export function iocAuthorSignaturePath(orgId: string, formId: string): string {
  return `${orgId}/${formId}/author.png`
}
