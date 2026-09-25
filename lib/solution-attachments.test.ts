import { describe, expect, it, vi } from 'vitest'
import {
  checkSolutionFile,
  isSolutionTextImageSrc,
  SOLUTION_IMAGE_MAX_BYTES,
  SOLUTION_PDF_MAX_BYTES,
  solutionAttachmentKind,
  solutionUploadPath,
  splitSolutionAttachments,
} from '@/lib/solution-attachments'

const BUCKET = 'https://project.supabase.co/storage/v1/object/public/question-images/user-1'

describe('solution attachments', () => {
  it('reads each file’s kind off its URL', () => {
    expect(solutionAttachmentKind(`${BUCKET}/solution_1_abc.webp`)).toBe('image')
    expect(solutionAttachmentKind(`${BUCKET}/1727_abc.jpg`)).toBe('image')
    expect(solutionAttachmentKind(`${BUCKET}/solution_1_abc.pdf`)).toBe('pdf')
    expect(solutionAttachmentKind(`${BUCKET}/solution_1_abc.PDF?v=2`)).toBe('pdf')
    expect(solutionAttachmentKind(`${BUCKET}/solution-board_1_abc.png`)).toBe('board')
    expect(solutionAttachmentKind(`${BUCKET}/solution-board_1_abc.png#top`)).toBe('board')
    // Only the name decides: a folder called solution-board_ is not a board.
    expect(solutionAttachmentKind(`${BUCKET}/solution-board_x/diagram.png`)).toBe('image')
    // The lab's in-memory files carry their name after a `#`.
    expect(solutionAttachmentKind('blob:http://localhost:3010/0f3c#lab/solution-board_1_x.png')).toBe('board')
    expect(solutionAttachmentKind('blob:http://localhost:3010/0f3c#lab/solution_1_x.pdf')).toBe('pdf')
  })

  it('keeps board pictures with the pictures and PDFs apart, in order', () => {
    const urls = [
      `${BUCKET}/a.webp`,
      `${BUCKET}/solution_1.pdf`,
      `${BUCKET}/solution-board_2.png`,
      `${BUCKET}/solution_3.pdf`,
    ]
    expect(splitSolutionAttachments(urls)).toEqual({
      images: [urls[0], urls[2]],
      pdfs: [urls[1], urls[3]],
    })
  })

  it('names uploads under the teacher’s own folder, boards apart from files', () => {
    expect(solutionUploadPath('user-1', 'board', 'png', 1700, 0.5)).toBe('user-1/solution-board_1700_i.png')
    expect(solutionUploadPath('user-1', 'file', 'pdf', 1700, 0.25)).toBe('user-1/solution_1700_9.pdf')
    expect(solutionAttachmentKind(solutionUploadPath('u', 'board', 'png'))).toBe('board')
    expect(solutionAttachmentKind(solutionUploadPath('u', 'file', 'pdf'))).toBe('pdf')
    // A picture typed into the text is named apart and never reads as a board.
    expect(solutionUploadPath('user-1', 'inline', 'webp', 1700, 0.5)).toBe('user-1/solution-inline_1700_i.webp')
    expect(solutionAttachmentKind(solutionUploadPath('u', 'inline', 'png'))).toBe('image')
  })

  it('keeps only this app’s own pictures in typed เฉลย', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
    expect(isSolutionTextImageSrc(`${BUCKET}/solution-inline_1_a.webp`)).toBe(true)
    expect(isSolutionTextImageSrc('blob:http://localhost:3010/0f3c#lab/solution-inline_1_a.png')).toBe(true)
    // Pictures that ride in with text copied off a web page are not hot-linked.
    expect(isSolutionTextImageSrc('https://example.com/diagram.png')).toBe(false)
    expect(isSolutionTextImageSrc('http://project.supabase.co/storage/v1/object/public/question-images/a.png')).toBe(false)
    expect(isSolutionTextImageSrc('https://project.supabase.co/storage/v1/object/public/work-images/a.png')).toBe(false)
    expect(isSolutionTextImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe(false)
    expect(isSolutionTextImageSrc('javascript:alert(1)')).toBe(false)
    expect(isSolutionTextImageSrc('')).toBe(false)
    // The same bucket path on another project — Staging, or anyone's — is still another host.
    expect(isSolutionTextImageSrc('https://other.supabase.co/storage/v1/object/public/question-images/a.png')).toBe(false)
    // The lab's in-memory pictures exist only in a development build.
    vi.stubEnv('NODE_ENV', 'production')
    expect(isSolutionTextImageSrc('blob:http://localhost:3010/0f3c#lab/solution-inline_1_a.png')).toBe(false)
    vi.unstubAllEnvs()
  })

  it('takes a PDF up to 5 MB and a shrunk picture up to 2 MB', () => {
    expect(checkSolutionFile({ name: 'a.pdf', type: 'application/pdf', size: SOLUTION_PDF_MAX_BYTES }))
      .toEqual({ ok: true, kind: 'pdf', extension: 'pdf' })
    expect(checkSolutionFile({ name: 'a.webp', type: 'image/webp', size: SOLUTION_IMAGE_MAX_BYTES }))
      .toEqual({ ok: true, kind: 'image', extension: 'webp' })
    expect(checkSolutionFile({ name: 'a.jpg', type: 'image/jpeg', size: 10 }))
      .toEqual({ ok: true, kind: 'image', extension: 'jpg' })

    const bigPdf = checkSolutionFile({ name: 'เฉลย.pdf', type: 'application/pdf', size: SOLUTION_PDF_MAX_BYTES + 1 })
    expect(bigPdf).toMatchObject({ ok: false })
    expect(!bigPdf.ok && bigPdf.message).toContain('5 MB')
    const bigGif = checkSolutionFile({ name: 'a.gif', type: 'image/gif', size: SOLUTION_IMAGE_MAX_BYTES + 1 })
    expect(!bigGif.ok && bigGif.message).toContain('2 MB')
  })

  it('refuses what the bucket would refuse, before uploading it', () => {
    expect(checkSolutionFile({ name: 'a.svg', type: 'image/svg+xml', size: 10 })).toMatchObject({ ok: false })
    expect(checkSolutionFile({ name: 'a.heic', type: 'image/heic', size: 10 })).toMatchObject({ ok: false })
    expect(checkSolutionFile({ name: 'a.docx', type: '', size: 10 })).toMatchObject({ ok: false })
  })
})
