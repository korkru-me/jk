import { describe, expect, it, vi } from 'vitest'
import { readWithSubmissionRevision } from './submission-revision-compatibility'

const missing = { code: '42703', message: 'column submissions.seb_config_revision does not exist' }

describe('submission revision schema compatibility', () => {
  it('keeps the revision when the current schema is present without a second read', async () => {
    const read = vi.fn().mockResolvedValue({ data: { id: 'attempt', seb_config_revision: 4 }, error: null })
    expect(await readWithSubmissionRevision(read)).toEqual({ data: { id: 'attempt', seb_config_revision: 4 }, error: null, revisionColumnAvailable: true })
    expect(read).toHaveBeenCalledExactlyOnceWith(true)
  })
  it('reads the legacy projection only for the exact missing revision column', async () => {
    const read = vi.fn().mockResolvedValueOnce({ data: null, error: missing }).mockResolvedValueOnce({ data: { id: 'attempt' }, error: null })
    expect(await readWithSubmissionRevision(read)).toEqual({ data: { id: 'attempt' }, error: null, revisionColumnAvailable: false })
    expect(read.mock.calls).toEqual([[true], [false]])
  })
  it.each([
    { code: '42501', message: 'permission denied' },
    { code: '42703', message: 'column submissions.started_at does not exist' },
    { code: 'PGRST301', message: 'JWT expired' },
    { message: 'connection failed' },
  ])('does not retry permission, network or unrelated schema failures: $code', async error => {
    const read = vi.fn().mockResolvedValue({ data: null, error })
    expect((await readWithSubmissionRevision(read)).error).toEqual(error)
    expect(read).toHaveBeenCalledOnce()
  })
  it('preserves a failure of the legacy read', async () => {
    const read = vi.fn().mockResolvedValueOnce({ data: null, error: missing }).mockResolvedValueOnce({ data: null, error: { code: '42501' } })
    expect(await readWithSubmissionRevision(read)).toMatchObject({ data: null, error: { code: '42501' }, revisionColumnAvailable: false })
  })
})
