import { describe, it, expect } from 'vitest'
import {
  attachmentKindLabel, attachmentPaths, formatFileSize, isImageAttachment, isPostFileUrl,
  MAX_POST_ATTACHMENTS, sanitizeAttachments, shortenFileName,
} from './attachment-display'

describe('isImageAttachment', () => {
  it('separates pictures, which render inline, from files that do not', () => {
    expect(isImageAttachment('image/png')).toBe(true)
    expect(isImageAttachment('application/pdf')).toBe(false)
  })
})

describe('attachmentKindLabel', () => {
  it('names the office formats a teacher actually hands out', () => {
    expect(attachmentKindLabel('application/pdf')).toBe('PDF')
    expect(attachmentKindLabel('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('Word')
    expect(attachmentKindLabel('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('Excel')
    expect(attachmentKindLabel('application/vnd.ms-powerpoint')).toBe('PowerPoint')
  })

  it('falls back to the extension the person saw when the type is unknown', () => {
    expect(attachmentKindLabel('application/octet-stream', 'notes.odt')).toBe('ODT')
    expect(attachmentKindLabel('application/octet-stream', 'noextension')).toBe('ไฟล์')
  })
})

describe('formatFileSize', () => {
  it('scales the unit to the file', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(820 * 1024)).toBe('820 KB')
    expect(formatFileSize(Math.round(1.25 * 1024 * 1024))).toBe('1.3 MB')
  })

  it('drops the decimal once it stops meaning anything', () => {
    expect(formatFileSize(12 * 1024 * 1024)).toBe('12 MB')
  })

  it('says nothing rather than something wrong about an unknown size', () => {
    expect(formatFileSize(NaN)).toBe('')
  })
})

describe('shortenFileName', () => {
  it('leaves a name that already fits', () => {
    expect(shortenFileName('ใบงานที่ 3.pdf')).toBe('ใบงานที่ 3.pdf')
  })

  it('cuts the middle and keeps the extension', () => {
    const short = shortenFileName(`${'ก'.repeat(60)}.docx`, 20)
    expect(short.endsWith('.docx')).toBe(true)
    expect(short.length).toBeLessThanOrEqual(20)
  })

  it('survives a long name with no extension at all', () => {
    expect(shortenFileName('x'.repeat(50), 10)).toHaveLength(10)
  })
})

const BASE = 'https://libsutfinswqkruihwdx.supabase.co'
const own = (name: string) => `${BASE}/storage/v1/object/public/classroom-post-files/uid/${name}`

describe('isPostFileUrl', () => {
  it('accepts a file in this project bucket', () => {
    expect(isPostFileUrl(own('a.pdf'), BASE)).toBe(true)
  })

  it('rejects another host that copies the bucket path', () => {
    expect(isPostFileUrl('https://evil.example/storage/v1/object/public/classroom-post-files/x.png', BASE)).toBe(false)
  })

  it('rejects another bucket on the right host', () => {
    expect(isPostFileUrl(`${BASE}/storage/v1/object/public/question-images/uid/x.png`, BASE)).toBe(false)
  })

  it('rejects anything when the project URL is unknown, rather than trusting it', () => {
    expect(isPostFileUrl(own('a.pdf'), undefined)).toBe(false)
  })

  it('rejects a non-string', () => {
    expect(isPostFileUrl({ toString: () => own('a.pdf') }, BASE)).toBe(false)
  })
})

describe('sanitizeAttachments', () => {
  it('drops attachments that are not in the bucket', () => {
    const kept = sanitizeAttachments([
      { url: own('keep.pdf'), name: 'keep.pdf', mime: 'application/pdf', size: 10 },
      { url: 'https://evil.example/storage/v1/object/public/classroom-post-files/x.png', name: 'x', mime: 'image/png', size: 1 },
    ], BASE)
    expect(kept).toHaveLength(1)
    expect(kept[0].name).toBe('keep.pdf')
  })

  it('caps how many one announcement can carry', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ url: own(`f${i}.pdf`), name: `f${i}`, mime: 'application/pdf', size: 1 }))
    expect(sanitizeAttachments(many, BASE)).toHaveLength(MAX_POST_ATTACHMENTS)
  })

  it('keeps a filename from reading as a path, and bounds its length', () => {
    const [file] = sanitizeAttachments([
      { url: own('a.pdf'), name: '../../etc/passwd', mime: 'application/pdf', size: 1 },
    ], BASE)
    expect(file.name).toBe('.._.._etc_passwd')
    const [long] = sanitizeAttachments([
      { url: own('a.pdf'), name: 'x'.repeat(400), mime: 'application/pdf', size: 1 },
    ], BASE)
    expect(long.name).toHaveLength(120)
  })

  it('never stores a nonsense size', () => {
    const [file] = sanitizeAttachments([
      { url: own('a.pdf'), name: 'a.pdf', mime: 'application/pdf', size: -5 },
    ], BASE)
    expect(file.size).toBe(0)
  })

  it('survives junk instead of a list', () => {
    expect(sanitizeAttachments(undefined, BASE)).toEqual([])
    expect(sanitizeAttachments('nope', BASE)).toEqual([])
    expect(sanitizeAttachments([null, 7], BASE)).toEqual([])
  })
})

describe('attachmentPaths', () => {
  it('gives back the storage path, decoded', () => {
    expect(attachmentPaths([
      { url: own('%E0%B9%83%E0%B8%9A%E0%B8%87%E0%B8%B2%E0%B8%99.pdf'), name: 'ใบงาน.pdf', mime: 'application/pdf', size: 1 },
    ])).toEqual(['uid/ใบงาน.pdf'])
  })
})
