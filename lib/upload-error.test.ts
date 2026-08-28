import { describe, it, expect } from 'vitest'
import { DEFAULT_MAX_UPLOAD_MB, uploadErrorMessage } from './upload-error'

describe('uploadErrorMessage', () => {
  it('names the size limit, and says what to do about it', () => {
    const msg = uploadErrorMessage('The object exceeded the maximum allowed size')
    expect(msg).toContain(`${DEFAULT_MAX_UPLOAD_MB} MB`)
    expect(msg).toContain('ย่อรูป')
  })

  it('recognises the other wordings Supabase has used for the same refusal', () => {
    for (const raw of ['Payload too large', 'Request Entity Too Large', 'maximum allowed size is 5MB']) {
      expect(uploadErrorMessage(raw)).toContain('ไฟล์ใหญ่เกิน')
    }
  })

  it('quotes the bucket that is actually being written to, not always 5 MB', () => {
    // submission-files allows 10 MB — telling a student to shrink below 5
    // would send them to fix a file that was never the problem.
    expect(uploadErrorMessage('Payload too large', 'งาน.pdf', 10)).toContain('10 MB')
  })

  it('lists the accepted types when the type is what was refused', () => {
    const msg = uploadErrorMessage('mime type image/heic is not supported')
    expect(msg).toContain('PDF')
    expect(msg).not.toContain('ไฟล์ใหญ่เกิน')
  })

  it('names the file when it knows which one failed, so a batch is not ambiguous', () => {
    expect(uploadErrorMessage('Payload too large', 'รูปข้อ 3.jpg')).toContain('รูปข้อ 3.jpg')
  })

  it('passes an unrecognised failure through rather than inventing a cause', () => {
    const msg = uploadErrorMessage('network request failed')
    expect(msg).toContain('network request failed')
  })
})
