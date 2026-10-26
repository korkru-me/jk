import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ auth: vi.fn(), waiting: vi.fn(), codeSession: vi.fn(), admin: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/auth/server', () => ({ getAuthUser: m.auth }))
vi.mock('@/lib/practice-access-session.server', () => ({ hasPracticeAccessSession: m.codeSession }))
vi.mock('@/lib/practice-question-access.server', () => ({ loadPracticeLibraryWaiting: m.waiting, loadPracticeQuestionForStudent: vi.fn() }))
vi.mock('@/lib/practice-run.server', () => ({ preparePracticeRunQuestion: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.admin }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }))
import { deletePracticeExercise } from './actions/practice-exercises'

afterEach(() => vi.unstubAllEnvs())
const libraryId = '00000000-0000-4000-8300-000000000001'
const id = '00000000-0000-4000-8400-000000000001'
const actor = '00000000-0000-4000-8500-000000000001'
const input = { id, libraryId, expectedRevision: 4 }
const filters: [string, unknown][] = []
let response: { data: { id: string } | null; error: { message: string } | null }
const remove = vi.fn()
const from = vi.fn()
beforeEach(() => {
  vi.clearAllMocks(); filters.length = 0
  vi.stubEnv('PRACTICE_LIBRARY_ENABLED', 'true')
  m.auth.mockResolvedValue({ id: actor, role: 'student', status: 'active' })
  m.waiting.mockResolvedValue({ status: 'ready', library: { id: libraryId, requiresAccessCode: false } })
  m.codeSession.mockResolvedValue(true)
  response = { data: { id }, error: null }
  const query = { delete: remove, eq: (column: string, value: unknown) => { filters.push([column, value]); return query }, select: vi.fn(() => query), maybeSingle: async () => response }
  remove.mockReturnValue(query); from.mockReturnValue(query); m.admin.mockReturnValue({ from })
})
it('scopes a successful deletion to the verified student, library, exercise and reviewed revision', async () => {
  expect(await deletePracticeExercise(input)).toEqual({ ok: true })
  expect(from).toHaveBeenCalledWith('student_practice_exercises')
  expect(filters).toEqual([['id', id], ['library_id', libraryId], ['student_id', actor], ['revision', 4]])
  expect(m.revalidate).toHaveBeenCalledWith(`/practice/${libraryId}/library`)
})
it('rejects injected ownership, invalid IDs and missing revisions before authorization or deletion', async () => {
  for (const value of [{ ...input, student_id: actor }, { ...input, id: 'invalid' }, { id, libraryId }]) {
    expect((await deletePracticeExercise(value)).ok).toBe(false)
  }
  expect(m.auth).not.toHaveBeenCalled(); expect(m.admin).not.toHaveBeenCalled()
})
it('never deletes when authentication, library access or code session fails', async () => {
  m.auth.mockResolvedValue(null)
  expect((await deletePracticeExercise(input)).ok).toBe(false)
  m.auth.mockResolvedValue({ id: actor })
  m.waiting.mockResolvedValue({ status: 'denied' })
  expect((await deletePracticeExercise(input)).ok).toBe(false)
  m.waiting.mockResolvedValue({ status: 'ready', library: { requiresAccessCode: true } })
  m.codeSession.mockResolvedValue(false)
  expect((await deletePracticeExercise(input)).ok).toBe(false)
  expect(m.admin).not.toHaveBeenCalled()
})
it('does not claim success when ownership/revision no longer matches or the database fails', async () => {
  response = { data: null, error: null }
  expect(await deletePracticeExercise(input)).toMatchObject({ ok: false, conflict: true })
  response = { data: null, error: { message: 'offline' } }
  expect((await deletePracticeExercise(input)).ok).toBe(false)
  expect(m.revalidate).not.toHaveBeenCalled()
})
