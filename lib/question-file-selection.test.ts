import { describe, expect, it } from 'vitest'
import { INSTRUCTION_DOCUMENT_TYPES, QUESTION_FILE_MAX_BYTES, QUESTION_FILE_TYPES, questionFileSelectionError, fileAssignmentInstructionStoragePath, instructionAttachmentName } from './question-file-selection'

const file = (type = 'application/pdf', size = 1024) => ({ name: 'ใบงาน.pdf', type, size })
describe('teacher instruction attachment selection', () => {
  it('accepts each Storage-supported type up to the ten MB boundary', () => {
    for (const type of QUESTION_FILE_TYPES) expect(questionFileSelectionError([file(type, QUESTION_FILE_MAX_BYTES)], 0, 10)).toBeNull()
  })
  it('counts existing attachments and rejects the whole selection over the limit', () => {
    expect(questionFileSelectionError([file()], 9, 10)).toBeNull()
    expect(questionFileSelectionError([file(), file()], 9, 10)).toContain('ไม่เกิน 10 ไฟล์')
  })
  it('rejects unsupported files and files larger than the Storage limit', () => {
    expect(questionFileSelectionError([file('text/html')], 0, 10)).toContain('ใช้ไม่ได้')
    expect(questionFileSelectionError([file('application/pdf', QUESTION_FILE_MAX_BYTES + 1)], 0, 10)).toContain('เกิน 10 MB')
  })
  it('preserves the unlimited-count option used by legacy question editors', () => {
    expect(questionFileSelectionError([file()], 15)).toBeNull()
  })
  it('accepts Office documents, text and ZIP only in the explicit instruction mode', () => {
    for (const [extension, type] of Object.entries(INSTRUCTION_DOCUMENT_TYPES)) {
      expect(questionFileSelectionError([{ name: `ใบงาน.${extension}`, type, size: 1024 }], 0, 10, true)).toBeNull()
      expect(questionFileSelectionError([{ name: `ใบงาน.${extension}`, type: '', size: 1024 }], 0, 10, true)).toBeNull()
      expect(questionFileSelectionError([file(type)], 0, 10)).not.toBeNull()
    }
    expect(questionFileSelectionError([file('text/html')], 0, 10, true)).not.toBeNull()
  })
  it('trusts only the own-project instruction namespace and preserves legacy URLs', () => {
    const origin = 'https://project.supabase.co'
    const base = `${origin}/storage/v1/object/public/`
    expect(fileAssignmentInstructionStoragePath(`${base}classroom-post-files/user/file-assignment-instructions/id/sheet.docx`, origin)).toBe('user/file-assignment-instructions/id/sheet.docx')
    expect(fileAssignmentInstructionStoragePath(`${base}question-images/user/sheet.pdf`, origin)).toBe('user/sheet.pdf')
    for (const url of [`${base}classroom-post-files/user/post.docx`, `${base}classroom-post-files/user/file-assignment-instructions/%2e%2e/file.docx`, `${base}submission-files/user/file.docx`, `${base}classroom-post-files/user/file-assignment-instructions/id/sheet.docx?download=1`, 'https://other.invalid/file.docx']) {
      expect(fileAssignmentInstructionStoragePath(url, origin)).toBeNull()
    }
    expect(instructionAttachmentName('blob:http://localhost/id#%E0%B9%83%E0%B8%9A%E0%B8%87%E0%B8%B2%E0%B8%99.docx')).toBe('ใบงาน.docx')
  })
})
