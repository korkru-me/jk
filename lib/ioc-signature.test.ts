import { describe, expect, it } from 'vitest'
import {
  IOC_SIGNATURE_MAX_BYTES,
  iocAuthorSignaturePath,
  iocSignaturePath,
  parseIocSignatureDataUrl,
} from '@/lib/ioc-signature'

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function dataUrl(bytes: number[], mime = 'image/png'): string {
  const binary = String.fromCharCode(...bytes)
  return `data:${mime};base64,${btoa(binary)}`
}

describe('parseIocSignatureDataUrl', () => {
  it('accepts a small PNG and hands back its bytes', () => {
    const result = parseIocSignatureDataUrl(dataUrl([...PNG_HEADER, 1, 2, 3]))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Array.from(result.bytes.slice(0, 8))).toEqual(PNG_HEADER)
    }
  })

  it('refuses anything that is not declared PNG', () => {
    const jpeg = parseIocSignatureDataUrl(dataUrl([...PNG_HEADER], 'image/jpeg'))
    expect(jpeg).toEqual({ ok: false, error: 'ลายเซ็นต้องเป็นรูป PNG' })
    expect(parseIocSignatureDataUrl('https://example.com/signature.png').ok).toBe(false)
    expect(parseIocSignatureDataUrl('').ok).toBe(false)
  })

  it('refuses a file that only claims to be PNG in its prefix', () => {
    // A JPEG renamed by relabelling the data URL: the magic number is the check
    // that the bucket's mime allow-list cannot make for us.
    const renamed = parseIocSignatureDataUrl(dataUrl([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]))
    expect(renamed).toEqual({ ok: false, error: 'ไฟล์นี้ไม่ใช่ PNG' })
  })

  it('refuses an empty signature with a sentence about signing', () => {
    expect(parseIocSignatureDataUrl('data:image/png;base64,')).toEqual({
      ok: false,
      error: 'ลายเซ็นต้องเป็นรูป PNG',
    })
  })

  it('refuses a file bigger than the bucket would take', () => {
    let binary = String.fromCharCode(...PNG_HEADER)
    const filler = 'x'.repeat(8192)
    while (binary.length <= IOC_SIGNATURE_MAX_BYTES) binary += filler
    const result = parseIocSignatureDataUrl(`data:image/png;base64,${btoa(binary)}`)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('ใหญ่เกินไป')
  })
})

describe('signature paths', () => {
  it('gives one file per expert per form, and one for the author', () => {
    expect(iocSignaturePath('org-1', 'form-2', 'expert-3')).toBe('org-1/form-2/expert-expert-3.png')
    expect(iocAuthorSignaturePath('org-1', 'form-2')).toBe('org-1/form-2/author.png')
  })
})
