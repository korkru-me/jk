import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({
  client: vi.fn(), manage: vi.fn(), org: vi.fn(), notify: vi.fn(), questions: vi.fn(),
  rooms: vi.fn(), release: vi.fn(), password: vi.fn(), revalidate: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: m.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.client }))
vi.mock('@/lib/auth/assignment-access', () => ({ canManageAssignment: m.manage }))
vi.mock('@/lib/actions/org', () => ({ getMyOrgId: m.org }))
vi.mock('@/lib/assignment-publication-notifications', () => ({ notifyAssignmentPublished: m.notify }))
vi.mock('@/lib/assignment-question-access.server', () => ({ loadAssignmentQuestionsByProvenance: m.questions }))
vi.mock('@/lib/classroom-groups-server', () => ({ manageableClassroomIds: m.rooms }))
vi.mock('@/lib/seb', () => ({ inspectSebReadiness: () => ({ siteUrlReady: true }), readSebSessionSecret: () => 'synthetic-secret' }))
vi.mock('@/lib/seb-assignment-release.server', () => ({ hasCurrentAssignmentSebRelease: m.release }))
vi.mock('@/lib/seb-quit-password-service.server', () => ({ createSebQuitPasswordRevisionForOwner: m.password }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }))
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`REDIRECT:${href}`) } }))

import { createAssignment, updateAssignmentGroupTargets, updateAssignmentStatus } from './assignments'
import { ASSIGNMENT_NOTIFICATION_WARNING } from '@/lib/assignment-publication-feedback'

const ID = 'a0000000-0000-4000-8000-000000000001'
const ACTOR = 'a0000000-0000-4000-8000-000000000002'
const ROOM = 'a0000000-0000-4000-8000-000000000003'
const QUESTION = 'a0000000-0000-4000-8000-000000000004'
const GROUP = 'a0000000-0000-4000-8000-000000000005'
type Reply = { data: unknown; error: { message: string } | null }
let events: string[]
let replies: Record<string, Reply>
let authenticated: boolean

function query(table: string) {
  let operation = 'select'
  const finish = () => {
    const key = `${table}:${operation}`
    events.push(key)
    return replies[key] ?? { data: null, error: null }
  }
  const builder = {
    select: () => builder,
    insert: () => { operation = 'insert'; return builder },
    update: () => { operation = 'update'; return builder },
    delete: () => { operation = 'delete'; return builder },
    eq: () => builder, in: () => builder,
    single: async () => finish(), maybeSingle: async () => finish(),
    then: (resolve: (value: Reply) => unknown) => Promise.resolve(finish()).then(resolve),
  }
  return builder
}

function input(overrides: Partial<Parameters<typeof createAssignment>[0]> = {}): Parameters<typeof createAssignment>[0] {
  return {
    classroom_ids: [ROOM], title: 'งานสังเคราะห์', description: '', question_ids: [QUESTION],
    mode: 'online', type: 'exercise', status: 'published',
    start_at: null, due_at: null, end_at: null, duration_minutes: null, ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  authenticated = true
  events = []
  replies = {
    'assignments:insert': { data: { id: ID }, error: null },
    'assignments:select': { data: { created_by: ACTOR, org_id: ID, secure_browser_mode: 'browser', question_ids: [QUESTION], status: 'published', end_at: null }, error: null },
    'assignments:update': { data: { id: ID, status: 'published' }, error: null },
    'assignment_classrooms:select': { data: [{ id: ID, classroom_id: ROOM, group_ids: [GROUP] }], error: null },
    'assignment_classrooms:update': { data: { id: ID }, error: null },
    'classroom_groups:select': { data: [{ id: GROUP, classroom_id: ROOM }], error: null },
  }
  m.client.mockImplementation(() => ({ auth: { getUser: async () => ({ data: { user: authenticated ? { id: ACTOR } : null } }) }, from: query }))
  m.manage.mockResolvedValue(true)
  m.org.mockResolvedValue(ID)
  m.questions.mockResolvedValue({ missingQuestionIds: [], duplicateQuestionCount: 0 })
  m.rooms.mockResolvedValue(new Set([ROOM]))
  m.release.mockResolvedValue(true)
  m.password.mockResolvedValue(undefined)
  m.notify.mockImplementation(async () => { events.push('notify'); return { success: true, notified: 2 } })
})

describe('published assignment notification hooks', () => {
  it.each(['exercise', 'exam'] as const)('notifies a new %s only after both assignment and links persist', async type => {
    await expect(createAssignment(input({ type }))).rejects.toThrow(`REDIRECT:/classrooms/${ROOM}?view=assignments`)
    expect(events).toEqual(['assignments:insert', 'assignment_classrooms:insert', 'notify'])
    expect(m.notify).toHaveBeenCalledWith(ID, ACTOR)
  })

  it('does not notify draft creation', async () => {
    await expect(createAssignment(input({ status: 'draft' }))).rejects.toThrow('REDIRECT:')
    expect(m.notify).not.toHaveBeenCalled()
  })

  it('does not notify a new SEB exam that remains draft despite requested publication', async () => {
    const password = 'Synthetic-QA-A7!d9Q2z'
    await expect(createAssignment(input({ type: 'exam', secure_browser_mode: 'seb_required',
      seb_quit_password: { password, confirmation: password } }))).rejects.toThrow('REDIRECT:')
    expect(m.password).toHaveBeenCalled()
    expect(events).toContain('assignment_classrooms:insert')
    expect(m.notify).not.toHaveBeenCalled()
  })

  it.each(['assignments:insert', 'assignment_classrooms:insert'])('does not notify after failed %s', async table => {
    replies[table] = { data: null, error: { message: 'synthetic write rejected' } }
    expect(await createAssignment(input())).toHaveProperty('error')
    expect(m.notify).not.toHaveBeenCalled()
  })

  it('keeps a successful creation redirect and surfaces a delivery warning', async () => {
    m.notify.mockResolvedValue({ error: 'synthetic fanout failed' })
    await expect(createAssignment(input())).rejects.toThrow('&notification=assignment-notification-warning')
    expect(events).toContain('assignment_classrooms:insert')
  })

  it('keeps the redirect even if delivery throws after creation', async () => {
    m.notify.mockRejectedValue(new Error('transport failure'))
    await expect(createAssignment(input())).rejects.toThrow('&notification=assignment-notification-warning')
  })

  it('notifies after an acknowledged published status update', async () => {
    expect(await updateAssignmentStatus(ID, 'published')).toEqual({ success: true })
    expect(events).toEqual(['assignments:select', 'assignments:update', 'notify'])
  })

  it.each([
    { data: null, error: null },
    { data: null, error: { message: 'synthetic write rejected' } },
  ])('does not notify an unacknowledged status update', async reply => {
    replies['assignments:update'] = reply
    expect(await updateAssignmentStatus(ID, 'published')).toHaveProperty('error')
    expect(m.notify).not.toHaveBeenCalled()
  })

  it('does not notify when provenance validation rejects publication', async () => {
    m.questions.mockResolvedValue({ missingQuestionIds: [QUESTION], duplicateQuestionCount: 0 })
    expect(await updateAssignmentStatus(ID, 'published')).toHaveProperty('error')
    expect(events).not.toContain('assignments:update')
    expect(m.notify).not.toHaveBeenCalled()
  })

  it('does not notify an SEB exam whose release is not enrolled', async () => {
    replies['assignments:select'].data = { ...(replies['assignments:select'].data as object), secure_browser_mode: 'seb_required' }
    m.release.mockResolvedValue(false)
    expect(await updateAssignmentStatus(ID, 'published')).toHaveProperty('error')
    expect(events).not.toContain('assignments:update')
    expect(m.notify).not.toHaveBeenCalled()
  })

  it('does not notify a closed assignment', async () => {
    replies['assignments:update'].data = { id: ID, status: 'closed' }
    expect(await updateAssignmentStatus(ID, 'closed')).toEqual({ success: true })
    expect(m.notify).not.toHaveBeenCalled()
  })

  it.each(['error', 'throw'])('preserves committed publish success after notification %s', async mode => {
    if (mode === 'error') m.notify.mockResolvedValue({ error: 'synthetic failure' })
    else m.notify.mockRejectedValue(new Error('synthetic transport failure'))
    expect(await updateAssignmentStatus(ID, 'published')).toEqual({ success: true, notificationWarning: ASSIGNMENT_NOTIFICATION_WARNING })
    expect(events).toContain('assignments:update')
  })

  it('notifies newly included group members only after the link update succeeds', async () => {
    expect(await updateAssignmentGroupTargets(ID, { [ROOM]: null })).toEqual({ success: true })
    expect(events).toEqual(['assignments:select', 'assignment_classrooms:select', 'assignment_classrooms:update', 'notify'])
  })

  it.each(['draft', 'closed'])('does not notify saved group targets while assignment is %s', async status => {
    replies['assignments:select'].data = { status }
    expect(await updateAssignmentGroupTargets(ID, { [ROOM]: null })).toEqual({ success: true })
    expect(events).toContain('assignment_classrooms:update')
    expect(m.notify).not.toHaveBeenCalled()
  })

  it('does not notify an empty group link update receipt', async () => {
    replies['assignment_classrooms:update'] = { data: null, error: null }
    expect(await updateAssignmentGroupTargets(ID, { [ROOM]: null })).toHaveProperty('error')
    expect(m.notify).not.toHaveBeenCalled()
  })

  it('does not notify when a group-target write fails', async () => {
    replies['assignment_classrooms:update'] = { data: null, error: { message: 'synthetic rejection' } }
    expect(await updateAssignmentGroupTargets(ID, { [ROOM]: null })).toHaveProperty('error')
    expect(m.notify).not.toHaveBeenCalled()
  })

  it('keeps successful group assignment when notification fails', async () => {
    m.notify.mockRejectedValue(new Error('synthetic transport failure'))
    expect(await updateAssignmentGroupTargets(ID, { [ROOM]: null })).toEqual({ success: true, notificationWarning: ASSIGNMENT_NOTIFICATION_WARNING })
  })

  it('never notifies without an authenticated teacher session', async () => {
    authenticated = false
    expect(await updateAssignmentStatus(ID, 'published')).toHaveProperty('error')
    expect(await createAssignment(input())).toHaveProperty('error')
    expect(await updateAssignmentGroupTargets(ID, { [ROOM]: null })).toHaveProperty('error')
    expect(m.notify).not.toHaveBeenCalled()
  })
})
