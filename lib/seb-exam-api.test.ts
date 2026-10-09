import { describe, expect, it } from 'vitest'
import { sebExamApiSchema, sebExamOperationObject } from './seb-exam-api'
import { readBoundedExamBody } from './seb-exam-http'

const id = '11111111-1111-4111-8111-111111111111'
describe('closed waiting exam JSON protocol', () => {
  it.each(['getQuestions', 'getSolutions', 'updateSubmissionAnswerScore', 'getTeachingBoardScene', 'deleteClassroom', '__proto__', 'logout'])('rejects unrelated operation %s', operation => {
    expect(sebExamApiSchema.safeParse({ operation, args: [id] }).success).toBe(false)
  })
  it('rejects extra authority fields and surplus args', () => {
    expect(sebExamApiSchema.safeParse({ operation: 'saveAnswer', args: [id, '1'], userId: id }).success).toBe(false)
    expect(sebExamApiSchema.safeParse({ operation: 'submitSubmission', args: [id, id] }).success).toBe(false)
  })
  it.each([
    ['saveAnswer', [id, '1'], 'answer'], ['submitSubmission', [id], 'submission'],
    ['deleteStudentWorkArtifact', [id], 'artifact'],
    ['recordProctorSignal', [{ submissionId: id, clientInstanceId: id, tabVisible: true, fullscreen: true, events: [] }], 'submission'],
  ])('resolves %s through its object kind', (operation, args, kind) => {
    const parsed = sebExamApiSchema.parse({ operation, args })
    expect(sebExamOperationObject(parsed)).toEqual({ kind, id })
  })
  it('start carries an intent, never an arbitrary student or predecessor', () => {
    expect(sebExamApiSchema.safeParse({ operation: 'start', args: ['intent'] }).success).toBe(true)
    expect(sebExamApiSchema.safeParse({ operation: 'start', args: [{ predecessorId: id }] }).success).toBe(false)
  })
  it('does not lower the existing ten MiB attachment ceiling', () => {
    const args = [{ submissionAnswerId: id, kind: 'submission_file', uploadId: id, name: 'test.pdf', mimeType: 'application/pdf', size: 10 * 1024 * 1024 }]
    expect(sebExamApiSchema.safeParse({ operation: 'completeExamAttachmentUpload', args }).success).toBe(true)
  })
})

describe('bounded exam HTTP body', () => {
  const request = (body: string, declared?: string) => new Request('https://example.invalid/api', { method: 'POST', body, headers: declared ? { 'content-length': declared } : {} })
  it('accepts exact bounded bytes without trusting a missing length', async () => {
    expect(await readBoundedExamBody(request('123'), 3)).toEqual(new TextEncoder().encode('123'))
  })
  it.each(['4', '1', '-1', 'abc'])('rejects dishonest length %s', async declared => {
    expect(await readBoundedExamBody(request('123', declared), 3)).toBeNull()
  })
  it('rejects overflow even when no length is supplied', async () => {
    expect(await readBoundedExamBody(request('1234'), 3)).toBeNull()
  })
})
