import { describe, expect, it } from 'vitest'
import { fileAssignmentDescription, fileAssignmentQuestionOwner, fileAssignmentWithdrawalError, isFileAssignment, submissionFileLimitError } from './file-assignment'
import { sanitizeRichTextForStorage } from './rich-text-sanitize'

const ID = '11111111-1111-4111-8111-111111111111'
const files = (count: number) => Array.from({ length: count }, (_, index) => ({ url: `https://test.invalid/${index}.pdf`, name: `${index}.pdf`, type: 'application/pdf' }))
describe('assignment-owned file instructions', () => {
  it('binds the hidden marker and private prompt to one exact assignment', () => {
    const description = fileAssignmentDescription(ID, '<p>ทำใบงานให้ครบ</p>')
    expect(isFileAssignment({ id: ID, description })).toBe(true)
    expect(isFileAssignment({ id: 'other', description })).toBe(false)
    expect(isFileAssignment({ description: '<p>งานส่งไฟล์</p>' })).toBe(false)
    expect(fileAssignmentQuestionOwner({ file_assignment_id: ID })).toBe(ID)
    expect(fileAssignmentQuestionOwner({ file_assignment_id: 'anything' })).toBeNull()
    expect(sanitizeRichTextForStorage(description)).not.toContain('korkru:file-assignment')
    expect(sanitizeRichTextForStorage(description)).toContain('ทำใบงานให้ครบ')
  })
  it('accepts ten new files and rejects an eleventh without losing legacy responses', () => {
    expect(submissionFileLimitError(files(10))).toBeNull()
    expect(submissionFileLimitError(files(11))).toContain('10 ไฟล์')
    expect(submissionFileLimitError(files(12), files(12))).toBeNull()
    expect(submissionFileLimitError(files(11), files(12))).toBeNull()
    expect(submissionFileLimitError([...files(11), { url: 'new', name: 'new.pdf', type: 'application/pdf' }], files(12))).not.toBeNull()
    expect(submissionFileLimitError([...files(10), files(1)[0]])).toBeNull()
  })
})

describe('file assignment withdrawal', () => {
  const now = Date.parse('2026-11-02T05:00:00Z')
  const valid = { assignmentStatus: 'published', submissionStatus: 'submitted', dueAt: '2026-11-02T06:00:00Z', endAt: '2026-11-02T07:00:00Z', reviewed: false }
  it('allows withdrawal before both deadlines while the teacher has not reviewed', () => {
    expect(fileAssignmentWithdrawalError(valid, now)).toBeNull()
  })
  it('blocks reviewed work even when it received zero points', () => {
    expect(fileAssignmentWithdrawalError({ ...valid, reviewed: true }, now)).toContain('ครูตรวจงานแล้ว')
    expect(fileAssignmentWithdrawalError({ ...valid, submissionStatus: 'graded' }, now)).toContain('ครูตรวจงานแล้ว')
  })
  it('blocks at the exact due time, after close, and when already withdrawn', () => {
    expect(fileAssignmentWithdrawalError(valid, Date.parse(valid.dueAt))).toContain('พ้นกำหนด')
    expect(fileAssignmentWithdrawalError({ ...valid, assignmentStatus: 'closed' }, now)).toContain('ปิดรับ')
    expect(fileAssignmentWithdrawalError({ ...valid, submissionStatus: 'in_progress' }, now)).toContain('ไม่ได้อยู่ในสถานะส่งแล้ว')
    expect(fileAssignmentWithdrawalError({ ...valid, dueAt: 'invalid' }, now)).toContain('พ้นกำหนด')
  })
})
