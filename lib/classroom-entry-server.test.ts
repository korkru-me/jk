import { createElement, Suspense, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ auth: vi.fn(), session: vi.fn(), admin: vi.fn(), posts: vi.fn(), seen: vi.fn(),
  acknowledgement: vi.fn(), practice: vi.fn(), recent: vi.fn(), homeroom: vi.fn(), detail: vi.fn(), loading: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`) }, notFound: () => { throw new Error('not-found') } }))
vi.mock('@/lib/auth/server', () => ({ getAuthUser: m.auth }))
vi.mock('@/lib/supabase/server', () => ({ createClient: m.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.admin }))
vi.mock('@/app/(app)/classrooms/[id]/_components/classroom-detail-client', () => ({ ClassroomDetailClient: m.detail }))
vi.mock('@/app/(app)/classrooms/[id]/_components/classroom-entry-loading', () => ({ ClassroomEntryLoading: m.loading }))
vi.mock('@/app/(app)/classrooms/[id]/_components/student-classroom-view', () => ({ StudentClassroomView: () => null }))
vi.mock('@/app/(app)/classrooms/[id]/_components/homeroom-student-view', () => ({ HomeroomStudentView: () => null }))
vi.mock('@/app/(app)/classrooms/[id]/_components/classroom-recent-view-tracker', () => ({ ClassroomRecentViewTracker: () => null }))
vi.mock('@/lib/actions/classroom-posts', () => ({ getClassroomPosts: m.posts, getPostSeenByPost: m.seen }))
vi.mock('@/lib/actions/classroom-announcement-acknowledgements', () => ({ getClassroomAnnouncementAcknowledgementStatus: m.acknowledgement }))
vi.mock('@/lib/classroom-announcement-acknowledgements', () => ({ isAnnouncementAcknowledgementEnabled: () => true }))
vi.mock('@/lib/practice-question', () => ({ isPracticeLibraryEnabled: () => true }))
vi.mock('@/lib/classroom-practice-libraries.server', () => ({ loadClassroomPracticeLibraries: m.practice }))
vi.mock('@/lib/classroom-recent-work.server', () => ({ loadClassroomRecentWork: m.recent }))
vi.mock('@/lib/homeroom-data', () => ({ getHomeroomAggregate: m.homeroom }))
vi.mock('@/lib/student-learning-calendar.server', () => ({ loadStudentLearningCalendar: vi.fn() }))
import ClassroomPage from '@/app/(app)/classrooms/[id]/page'

type Row = Record<string, unknown>
type Query = { table: string; columns: string; from: number; to: number; filters: [string, string, unknown][] }
const roomId = '10000000-0000-4000-8000-000000000001'
const actorId = 'teacher', studentId = 'student', assignmentId = 'assignment'
let room: Row, adminTables: Record<string, Row[]>, profile: Row, queries: Query[]
function valueAt(row: Row, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Row)[part] : undefined, row)
}
function client(tables: () => Record<string, Row[]>) {
  return { from(table: string) {
    const log: Query = { table, columns: '', from: 0, to: Infinity, filters: [] }
    let single = false
    const query = {
      select(columns: string) { log.columns = columns; return query },
      eq(key: string, value: unknown) { log.filters.push(['eq', key, value]); return query },
      neq(key: string, value: unknown) { log.filters.push(['neq', key, value]); return query },
      in(key: string, value: unknown[]) { log.filters.push(['in', key, value]); return query },
      is(key: string, value: unknown) { log.filters.push(['eq', key, value]); return query },
      gt() { return query }, order() { return query }, returns() { return query },
      range(from: number, to: number) { log.from = from; log.to = to; return query },
      limit(count: number) { log.to = count - 1; return query },
      single() { single = true; return query }, maybeSingle() { single = true; return query },
      then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) {
        queries.push(log)
        const rows = (tables()[table] ?? []).filter(row => log.filters.every(([op, key, value]) => {
          const actual = valueAt(row, key)
          return op === 'eq' ? actual === value : op === 'neq' ? actual !== value : (value as unknown[]).includes(actual)
        })).slice(log.from, log.to === Infinity ? undefined : log.to + 1)
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve, reject)
      },
    }
    return query
  } }
}
const page = (view?: string) => ClassroomPage({ params: Promise.resolve({ id: roomId }), searchParams: Promise.resolve({ view, back: '/dashboard' }) })
async function content(view?: string) {
  const shell = await page(view) as ReactElement<{ children: ReactElement<Record<string, unknown>> }>
  const child = shell.props.children
  const fragment = await (child.type as (props: Record<string, unknown>) => Promise<ReactElement<{ children: ReactElement[] }>>)(child.props)
  return fragment.props.children[1] as ReactElement<Record<string, unknown>>
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('React', { createElement }); queries = []
  room = { id: roomId, teacher_id: actorId, name: 'ห้องฟิสิกส์', description: 'ชั้น ม.4', classroom_type: 'subject', class_code: 'PRIVATE-CLASS-CODE' }
  profile = { id: actorId, role: 'teacher', full_name: 'ครู' }
  adminTables = {
    classrooms: [room], users: [{ id: actorId, full_name: 'ครู' }],
    classroom_students: [{ classroom_id: roomId, student_id: studentId, roster_order: null, users: { id: studentId, full_name: 'นักเรียน', email: 'student@example.test' } }],
    assignment_classrooms: [{ classroom_id: roomId, assignment_id: assignmentId, display_order: 1, group_ids: null, category_id: null }],
    assignments: [{ id: assignmentId, title: 'งาน', type: 'exercise', mode: 'online', status: 'published', question_ids: [], score_strategy: 'best', display_max_score: 20 }],
    submissions: [{ id: 'attempt-1', assignment_id: assignmentId, student_id: studentId, status: 'graded', total_score: 4, score_adjustment: 1, max_score: 8, voided_max_score: 2, submitted_at: null, attempt_number: 1 }],
    student_profiles: [{ student_id: studentId, grade_level: 'ม.4', class_number: 1 }],
  }
  m.auth.mockResolvedValue({ id: actorId }); m.session.mockResolvedValue(client(() => ({ users: [profile] })))
  m.admin.mockReturnValue(client(() => adminTables))
  m.posts.mockResolvedValue([{ id: 'post', comments: [] }]); m.seen.mockResolvedValue({}); m.acknowledgement.mockResolvedValue({})
  m.practice.mockResolvedValue({ items: [], error: null }); m.recent.mockResolvedValue({ items: [], error: null, asOf: 'now' })
  m.homeroom.mockResolvedValue({ assignments: [], submissions: [] })
})
afterEach(() => vi.unstubAllGlobals())

describe('authorized classroom streaming and deferred tab reads (mocked server requests)', () => {
  it('returns the real classroom shell before starting roster, score, post, or invite requests', async () => {
    const shell = await page() as ReactElement<{ fallback: ReactElement<{ classroom: Row }>; children: ReactElement }>
    expect(shell.type).toBe(Suspense); expect(shell.props.fallback.type).toBe(m.loading)
    expect(shell.props.fallback.props.classroom).toEqual({ id: roomId, name: room.name, description: room.description, classroom_type: 'subject' })
    expect(JSON.stringify(shell.props.fallback.props)).not.toContain('PRIVATE-CLASS-CODE')
    expect(queries.map(query => query.table).sort()).toEqual(['classrooms', 'users'])
    expect(m.posts).not.toHaveBeenCalled(); expect(m.practice).not.toHaveBeenCalled()
  })
  it('denies unauthenticated and unrelated actors before returning a classroom shell or starting heavy reads', async () => {
    m.auth.mockResolvedValueOnce(null)
    await expect(page()).rejects.toThrow('redirect:/login'); expect(queries).toEqual([])
    room.teacher_id = 'another-teacher'
    await expect(page()).rejects.toThrow('not-found')
    expect(queries.every(query => ['users', 'classrooms', 'classroom_co_teachers'].includes(query.table))).toBe(true)
    expect(m.posts).not.toHaveBeenCalled()
  })
  it('view-only co-teachers cannot request score data or receive invitation tokens through deferred tabs', async () => {
    room.teacher_id = 'another-teacher'
    adminTables.classroom_co_teachers = [{ id: 'co-teacher', classroom_id: roomId, user_id: actorId, permission: 'view' }]
    const result = await content('scores')
    expect(result.props.loadedNavigationItem).toBe('overview')
    expect(result.props.canManage).toBe(false)
    expect(queries.some(query => query.table === 'submissions' || query.table === 'classroom_invitations')).toBe(false)
    await content('coteachers')
    expect(queries.some(query => query.table === 'classroom_invitations')).toBe(false)
  })
  it('a slow announcement read does not hold back independent roster profiles and scores', async () => {
    let resolvePosts!: (posts: { id: string; comments: never[] }[]) => void
    m.posts.mockImplementationOnce(() => new Promise(resolve => { resolvePosts = resolve }))
    const loading = content()
    await vi.waitFor(() => {
      expect(queries.some(query => query.table === 'student_profiles')).toBe(true)
      expect(queries.some(query => query.table === 'submissions')).toBe(true)
    })
    resolvePosts([{ id: 'post', comments: [] }])
    await loading
  })
  it('overview preserves score scaling and full progress, while deferring co-teachers, libraries, recent work, and extensions', async () => {
    const result = await content()
    expect(result.props.loadedNavigationItem).toBe('overview')
    expect(result.props.classroomSubmissions).toEqual([expect.objectContaining({ id: 'attempt-1', total_score: 9, max_score: 16 })])
    expect(result.props.assignmentCount).toBe(1)
    expect(m.posts).toHaveBeenCalledOnce(); expect(m.acknowledgement).toHaveBeenCalledOnce()
    expect(m.practice).not.toHaveBeenCalled(); expect(m.recent).not.toHaveBeenCalled()
    expect(queries.some(query => query.table === 'classroom_invitations' || query.table === 'assignment_extensions')).toBe(false)
    const reads = queries.filter(query => query.table === 'submissions')
    expect(reads).toHaveLength(1); expect(reads[0].columns).toContain('voided_max_score')
    expect(reads[0].filters).toContainEqual(['in', 'student_id', [studentId]])
  })
  it.each(['students', 'assignments', 'scores', 'ability', 'coteachers'])('loads only requested %s tab extras, retaining server navigation identity', async view => {
    const result = await content(view)
    expect(result.props.loadedNavigationItem).toBe(view)
    expect(m.posts).not.toHaveBeenCalled(); expect(m.acknowledgement).not.toHaveBeenCalled()
    expect(m.practice.mock.calls.length).toBe(view === 'assignments' ? 1 : 0)
    expect(m.recent.mock.calls.length).toBe(view === 'assignments' ? 1 : 0)
    expect(queries.some(query => query.table === 'assignment_extensions')).toBe(view === 'scores')
    expect(queries.some(query => query.table === 'classroom_invitations')).toBe(view === 'coteachers')
    expect(queries.some(query => query.table === 'submissions')).toBe(!['students', 'coteachers'].includes(view))
  })
  it('keeps all roster attempts beyond the API row cap and excludes another classroom sharing the assignment', async () => {
    adminTables.submissions = Array.from({ length: 1001 }, (_, index): Row => ({ ...adminTables.submissions[0], id: `attempt-${index}`, attempt_number: index + 1 }))
      .concat([{ ...adminTables.submissions[0], id: 'other-room-attempt', student_id: 'another-student' }])
    const result = await content('scores')
    const submissions = result.props.classroomSubmissions as Row[]
    expect(submissions).toHaveLength(1001); expect(submissions.some(row => row.id === 'other-room-attempt')).toBe(false)
    expect(queries.filter(query => query.table === 'submissions').map(query => query.from)).toEqual([0, 1000])
  })
  it.each(['overview', 'students', 'homeroom'])('homeroom %s loads sensitive profiles/notes only for people and homeroom work tabs', async view => {
    room.classroom_type = 'homeroom'
    const result = await content(view)
    const profiles = queries.find(query => query.table === 'student_profiles')!
    expect(profiles.columns.includes('guardians')).toBe(view !== 'overview')
    expect(queries.some(query => query.table === 'student_notes')).toBe(view !== 'overview')
    expect(m.homeroom.mock.calls.length).toBe(view === 'students' ? 0 : 1)
    expect(result.props.loadedNavigationItem).toBe(view)
  })
})
