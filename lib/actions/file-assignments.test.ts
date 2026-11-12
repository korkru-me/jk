import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fileAssignmentDescription } from '@/lib/file-assignment'

const m = vi.hoisted(() => ({ client: vi.fn(), admin: vi.fn(), access: vi.fn(), manage: vi.fn(), inline: vi.fn(), start: vi.fn(), submit: vi.fn(), org: vi.fn(), rooms: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: m.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.admin }))
vi.mock('@/lib/auth/assignment-access', () => ({ studentHasAssignment: m.access, canManageAssignment: m.manage }))
vi.mock('@/lib/actions/assignments', () => ({ createInlineFileAssignment: m.inline }))
vi.mock('@/lib/actions/submissions', () => ({ startSubmission: m.start, submitSubmission: m.submit }))
vi.mock('@/lib/actions/org', () => ({ getMyOrgId: m.org }))
vi.mock('@/lib/classroom-groups-server', () => ({ manageableClassroomIds: m.rooms }))

import { createFileAssignment, readFileAssignment, submitFileAssignment, updateFileAssignment, withdrawFileAssignment } from './file-assignments'

const ID = '10000000-0000-4000-8000-000000000001'
const QUESTION = '20000000-0000-4000-8000-000000000001'
const STUDENT = '30000000-0000-4000-8000-000000000001'
const SUBMISSION = '40000000-0000-4000-8000-000000000001'
const ROOM = '50000000-0000-4000-8000-000000000001'
const files = (count: number) => Array.from({ length: count }, (_, index) => ({ url: `https://example.invalid/${index}.pdf`, name: `${index}.pdf`, type: 'application/pdf' }))

function database() {
  const rows: Record<string, Record<string, unknown> | null> = {
    assignments: { id: ID, title: 'ใบงาน', description: fileAssignmentDescription(ID, '<p>คำสั่ง</p>'), question_ids: [QUESTION], classroom_id: ROOM, status: 'published', start_at: null, due_at: '2099-01-01T00:00:00Z', end_at: '2099-01-02T00:00:00Z' },
    questions: { id: QUESTION, question_text: '<p>คำสั่ง</p>', extra_data: { file_assignment_id: ID, attachment_urls: [], file_assignment_max_score: 10 } },
    submissions: { id: SUBMISSION, status: 'submitted', submitted_at: '2026-11-02T01:00:00Z', total_score: 0 },
    submission_answers: { id: 'answer', student_answer: JSON.stringify(files(1)), is_correct: null, answer_reviewed_at: null, work_reviewed_at: null },
  }
  let count = 1
  const queries: Array<{ table: string; calls: Array<[string, unknown[]]> }> = []
  const from = vi.fn((table: string) => {
    const calls: Array<[string, unknown[]]> = []
    queries.push({ table, calls })
    const query: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'neq', 'in', 'order', 'limit', 'insert', 'update', 'delete']) {
      query[method] = (...args: unknown[]) => { calls.push([method, args]); return query }
    }
    const result = () => ({ data: table === 'assignment_classrooms' ? [{ classroom_id: ROOM }] : rows[table] ?? null, error: null, count })
    query.single = vi.fn(async () => result())
    query.maybeSingle = vi.fn(async () => result())
    query.then = (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve)
    return query
  })
  const client = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: STUDENT } } })) }, from }
  m.client.mockResolvedValue(client)
  m.admin.mockReturnValue({ from })
  return { rows, queries, from, client, loseUpdate: () => { count = 0 } }
}

afterEach(() => vi.unstubAllEnvs())

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
  vi.clearAllMocks()
  m.access.mockResolvedValue(true)
  m.manage.mockResolvedValue(true)
  m.org.mockResolvedValue('org')
  m.rooms.mockResolvedValue(new Set([ROOM]))
  m.submit.mockResolvedValue({ success: true })
})

describe('file assignment access and submission (mocked services)', () => {
  it('rejects a student outside the assignment audience before reading instructions/files', async () => {
    const db = database()
    m.access.mockResolvedValue(false)
    expect(await readFileAssignment(ID)).toHaveProperty('error')
    expect(db.from).not.toHaveBeenCalled()
  })
  it('does not accept a private prompt that belongs to another assignment', async () => {
    const db = database()
    db.rows.questions!.extra_data = { file_assignment_id: ROOM }
    expect(await readFileAssignment(ID)).toHaveProperty('error')
    expect(db.queries.some(query => query.table === 'submissions')).toBe(false)
  })
  it('returns only this student’s file references and withholds an ungraded provisional score', async () => {
    const db = database()
    const result = await readFileAssignment(ID)
    expect(result).toMatchObject({ view: { title: 'ใบงาน', submission: { files: files(1), score: null } } })
    expect(db.queries.find(query => query.table === 'submissions')?.calls).toContainEqual(['eq', ['student_id', STUDENT]])
    expect(JSON.stringify(result)).not.toContain('access_code')
  })
  it.each([0, 11])('refuses %i files before calling finalization', async count => {
    const db = database()
    db.rows.submissions!.status = 'in_progress'
    db.rows.submission_answers!.student_answer = JSON.stringify(files(count))
    expect(await submitFileAssignment(ID, SUBMISSION)).toHaveProperty('error')
    expect(m.submit).not.toHaveBeenCalled()
  })
  it('accepts exactly ten files through the existing manual-review finalizer', async () => {
    const db = database()
    db.rows.submissions!.status = 'in_progress'
    db.rows.submission_answers!.student_answer = JSON.stringify(files(10))
    expect(await submitFileAssignment(ID, SUBMISSION)).toEqual({ success: true })
    expect(m.submit).toHaveBeenCalledExactlyOnceWith(SUBMISSION)
  })
})

describe('file assignment withdrawal (mocked services)', () => {
  it('reopens the same header without modifying or deleting any submitted files', async () => {
    const db = database()
    expect(await withdrawFileAssignment(ID, SUBMISSION)).toEqual({ success: true })
    const write = db.queries.find(query => query.calls.some(([name]) => name === 'update'))!
    expect(write.table).toBe('submissions')
    expect(write.calls).toContainEqual(['eq', ['student_id', STUDENT]])
    expect(write.calls).toContainEqual(['eq', ['status', 'submitted']])
    expect(write.calls).toContainEqual(['eq', ['submitted_at', '2026-11-02T01:00:00Z']])
    expect(write.calls).toContainEqual(['update', [{ status: 'in_progress', submitted_at: null, closed_at: null, close_reason: null, total_score: null }, { count: 'exact' }]])
    expect(db.queries.filter(query => query.table === 'submission_answers').every(query => !query.calls.some(([name]) => name === 'update' || name === 'delete'))).toBe(true)
  })
  it('blocks reviewed work, including an explicit zero score', async () => {
    const db = database()
    db.rows.submission_answers!.answer_reviewed_at = '2026-11-02T02:00:00Z'
    expect(await withdrawFileAssignment(ID, SUBMISSION)).toHaveProperty('error')
    expect(db.queries.every(query => !query.calls.some(([name]) => name === 'update'))).toBe(true)
  })
  it('does not claim success when a concurrent grader changes the header first', async () => {
    const db = database()
    db.loseUpdate()
    expect(await withdrawFileAssignment(ID, SUBMISSION)).toHaveProperty('error')
  })
})

describe('file assignment creation boundaries (mocked services)', () => {
  const input = { classroom_ids: [ROOM], title: 'ใบงาน', instructions: '<p>ทำทุกข้อ</p>', attachment_urls: [], max_score: 10, due_at: null, status: 'draft' as const }
  it.each(['draft', 'published'] as const)('accepts blank instructions and adds one orange late band for %s work', async status => {
    database()
    m.inline.mockResolvedValueOnce({ success: true })
    expect(await createFileAssignment({ ...input, instructions: '', due_at: '2026-11-20T10:05:00+07:00', status })).toEqual({ success: true })
    expect(m.inline).toHaveBeenCalledWith(expect.objectContaining({
      description: '', start_at: null, end_at: null, due_at: '2026-11-20T03:05:00.000Z',
      late_bands: [expect.objectContaining({ starts_at: '2026-11-20T03:05:00.000Z', label: 'ส่งช้า', color: 'orange' })],
    }), expect.any(String), QUESTION)
  })

  it('rejects a blank title before creating a prompt', async () => {
    const db = database()
    expect(await createFileAssignment({ ...input, title: '   ' })).toHaveProperty('error')
    expect(db.queries).toHaveLength(0)
  })

  it('does not create private content for a classroom the actor cannot manage', async () => {
    const db = database()
    m.rooms.mockResolvedValue(new Set())
    expect(await createFileAssignment(input)).toHaveProperty('error')
    expect(db.queries.every(query => !query.calls.some(([name]) => name === 'insert'))).toBe(true)
  })
  it('marks the prompt private and bound to the new assignment, and cleans up a rejected create', async () => {
    const db = database()
    db.rows.assignments = null
    m.inline.mockResolvedValueOnce({ error: 'create rejected' })
    expect(await createFileAssignment(input)).toHaveProperty('error')
    const created = db.queries.find(query => query.table === 'questions' && query.calls.some(([name]) => name === 'insert'))!
    const payload = created.calls.find(([name]) => name === 'insert')![1][0] as { visibility: string; extra_data: Record<string, unknown> }
    expect(payload.visibility).toBe('private')
    expect(payload.extra_data.file_assignment_id).toBe(m.inline.mock.calls[0][1])
    expect(payload.extra_data.file_assignment_max_score).toBe(10)
    expect(db.queries.some(query => query.table === 'questions' && query.calls.some(([name]) => name === 'delete'))).toBe(true)
  })
  it('rejects a traversal out of the uploading teacher namespace', async () => {
    const db = database()
    const url = `https://project.supabase.co/storage/v1/object/public/question-images/${STUDENT}/../other/file.pdf`
    expect(await createFileAssignment({ ...input, attachment_urls: [url] })).toHaveProperty('error')
    expect(db.queries.every(query => !query.calls.some(([name]) => name === 'insert'))).toBe(true)
  })
  it('rejects malformed points and foreign teacher attachments before creating content', async () => {
    const db = database()
    expect(await createFileAssignment({ ...input, max_score: 0 })).toHaveProperty('error')
    expect(await createFileAssignment({ ...input, attachment_urls: ['https://elsewhere.invalid/file.pdf'] })).toHaveProperty('error')
    expect(db.queries.every(query => !query.calls.some(([name]) => name === 'insert'))).toBe(true)
  })
  it('accepts owner-scoped instruction documents and refuses another uploader or a post file', async () => {
    const own = `https://project.supabase.co/storage/v1/object/public/classroom-post-files/${STUDENT}/file-assignment-instructions/upload/worksheet.docx`
    database()
    m.inline.mockResolvedValueOnce({ success: true })
    expect(await createFileAssignment({ ...input, attachment_urls: [own] })).toEqual({ success: true })
    for (const url of [own.replace(STUDENT, ROOM), own.replace('/file-assignment-instructions/upload/', '/')]) {
      const db = database()
      expect(await createFileAssignment({ ...input, attachment_urls: [url] })).toHaveProperty('error')
      expect(db.queries.every(query => !query.calls.some(([name]) => name === 'insert'))).toBe(true)
    }
  })
})

describe('file assignment due date edits (mocked services)', () => {
  const edit = { classroom_ids: [ROOM], title: 'ใบงานใหม่', instructions: '<p>คำสั่ง</p>', attachment_urls: [], max_score: 10, status: 'published' as const }

  it('keeps an existing published schedule when only the title changes', async () => {
    const db = database()
    await updateFileAssignment(ID, { ...edit, due_at: '2099-01-01T07:00:00+07:00' })
    const update = db.queries.find(query => query.table === 'assignments' && query.calls.some(([name]) => name === 'update'))
    const payload = update?.calls.find(([name]) => name === 'update')?.[1][0]
    expect(payload).toHaveProperty('title', edit.title)
    for (const key of ['start_at', 'due_at', 'end_at', 'late_bands']) expect(payload).not.toHaveProperty(key)
  })
})
