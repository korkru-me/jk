import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
vi.mock('server-only', () => ({}))
import { startSebSubmissionAtomic, type AtomicSebStartInput } from './seb-start.server'

const ASSIGNMENT = '30000000-0000-4000-8000-000000000001'
const STUDENT = '20000000-0000-4000-8000-000000000002'
const QUESTION = '60000000-0000-4000-8000-000000000001'
const SUBMISSION = '70000000-0000-4000-8000-000000000001'
const VERSION = '2026-01-01T00:00:00.123456+00:00'
const rpc = vi.fn()
const admin = { rpc } as unknown as Pick<SupabaseClient, 'rpc'>
function input(): AtomicSebStartInput {
  return { assignmentId: ASSIGNMENT, studentId: STUDENT,
    releaseId: `asr-${ASSIGNMENT.replaceAll('-', '')}-r1-${'a'.repeat(16)}`,
    configRevision: 1, verifiedAt: '2026-10-09T00:00:00.000Z', validUntil: '2026-10-09T12:00:00.000Z',
    platform: 'windows', version: 'SEB_Windows_3.10.2.920', predecessorId: null, assignmentUpdatedAt: VERSION,
    questionVersions: [{ questionId: QUESTION, updatedAt: VERSION }],
    freshAnswers: [{ question_id: QUESTION, random_values: { x: 1 }, correct_answer: 'MCQ:0', max_score: 1,
      order_index: 0, option_order: null }], carriedAnswerIds: [] }
}
function row() { return { submission_id: SUBMISSION, started_at: '2026-10-09T00:00:01.123456+00:00',
  submission_status: 'in_progress', attempt_number: 1, seb_config_revision: 1, created: true } }
beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: [row()], error: null }) })
describe('private atomic SEB start adapter', () => {
  it('passes an allowlisted RPC payload, preserving database timestamp precision', async () => {
    const result = await startSebSubmissionAtomic(admin, input())
    expect(result).toEqual({ ok: true, submissionId: SUBMISSION, startedAt: row().started_at, status: 'in_progress',
      attemptNumber: 1, configRevision: 1, created: true })
    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc.mock.calls[0][0]).toBe('start_seb_submission_atomic')
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_assignment_id: ASSIGNMENT, p_student_id: STUDENT,
      p_assignment_updated_at: VERSION, p_question_versions: [{ question_id: QUESTION, updated_at: VERSION }],
      p_expected_predecessor_id: null, p_carried_answer_ids: [] })
    expect(Object.keys(rpc.mock.calls[0][1])).toHaveLength(13)
    expect(JSON.stringify(result)).not.toContain('MCQ:0')
  })
  it('accepts a completed idempotent receipt without claiming newly created', async () => {
    rpc.mockResolvedValue({ data: [{ ...row(), submission_status: 'submitted', created: false }], error: null })
    expect(await startSebSubmissionAtomic(admin, input())).toMatchObject({ ok: true, status: 'submitted', created: false })
  })
  it.each([
    ['42501', 'denied'], ['40001', 'conflict'], ['23505', 'conflict'], ['40P01', 'conflict'],
    ['PT410', 'expired'], ['22023', 'invalid_input'], ['22P02', 'invalid_input'], ['22003', 'invalid_input'],
    ['22007', 'invalid_input'], ['unknown', 'failed'],
  ])('sanitizes SQLSTATE %s to %s', async (code, expected) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: 'secret correct_answer private SQL', details: STUDENT } })
    expect(await startSebSubmissionAtomic(admin, input())).toEqual({ ok: false, code: expected })
  })
  it('sanitizes thrown transport failures', async () => {
    rpc.mockRejectedValue(new Error('private credential and SQL'))
    expect(await startSebSubmissionAtomic(admin, input())).toEqual({ ok: false, code: 'failed' })
  })
  it.each([
    null, [], [row(), row()], [{ ...row(), correct_answer: 'secret' }], [{ ...row(), seb_config_revision: 2 }],
    [{ ...row(), submission_id: STUDENT.replace('2000', 'oops') }], [{ ...row(), started_at: 'invalid' }],
    [{ ...row(), attempt_number: 0 }], [{ ...row(), attempt_number: 1.5 }],
    [{ ...row(), submission_status: 'submitted' }], [{ ...row(), created: 'true' }],
    [{ ...row(), submission_status: ['in_progress'] }],
  ].map(data => ({ data })))('rejects malformed response %#', async ({ data }) => {
    rpc.mockResolvedValue({ data, error: null })
    expect(await startSebSubmissionAtomic(admin, input())).toEqual({ ok: false, code: 'failed' })
  })
  it.each([
    { assignmentId: 'wrong' }, { studentId: 'wrong' }, { releaseId: 'wrong' }, { configRevision: 0 },
    { configRevision: 1.5 }, { platform: 'android' }, { version: 'bad\nversion' },
    { predecessorId: 'wrong' }, { assignmentUpdatedAt: 'bad' }, { verifiedAt: 'bad' }, { validUntil: 'bad' },
    { carriedAnswerIds: [STUDENT, STUDENT] },
    { questionVersions: [{ questionId: QUESTION, updatedAt: VERSION }, { questionId: QUESTION, updatedAt: VERSION }] },
  ])('rejects invalid private input without RPC %#', async invalid => {
    expect(await startSebSubmissionAtomic(admin, { ...input(), ...invalid } as AtomicSebStartInput)).toEqual({ ok: false, code: 'invalid_input' })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('rejects answer authority extras and nonfinite values before JSON serialization', async () => {
    const base = input()
    for (const freshAnswers of [
      [{ ...base.freshAnswers[0], org_id: STUDENT }],
      [{ ...base.freshAnswers[0], max_score: Infinity }],
      [{ ...base.freshAnswers[0], random_values: { x: NaN } }],
      [{ ...base.freshAnswers[0], option_order: [0, 0] }],
    ]) {
      expect(await startSebSubmissionAtomic(admin, { ...base, freshAnswers })).toEqual({ ok: false, code: 'invalid_input' })
    }
    expect(rpc).not.toHaveBeenCalled()
  })
})
