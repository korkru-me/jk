import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ session: vi.fn(), notify: vi.fn(), revalidate: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.session }))
vi.mock('@/lib/assignment-publication-notifications', () => ({ notifyAssignmentPublished: mocks.notify }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { createEducationResearchProject, updateEducationResearchSchedule } from './actions/education-research'

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const actor = id(1), project = id(2), classroom = id(3), pretest = id(4), posttest = id(5), measurement = id(6)
const question = id(7)
const online = (publish_mode: 'draft' | 'immediate' | 'scheduled' = 'immediate') => ({
  source_type: 'korkru_exam' as const, question_ids: [question], selection_mode: 'individual' as const,
  source_set_id: null, source_sections: [], duration_minutes: 30, publish_mode,
  start_at: publish_mode === 'scheduled' ? '2099-01-01T01:00:00Z' : null,
  end_at: publish_mode === 'draft' ? null : '2099-01-01T02:00:00Z', access_code: null,
})
const createInput = () => ({ title: 'โครงการ', topic: 'แรง', classroom_id: classroom,
  passing_threshold_percent: 50, pretest: online(), posttest: online('draft') })
const scheduleInput = (publish_mode: 'draft' | 'immediate' | 'scheduled' = 'immediate') => ({
  measurement_id: measurement, publish_mode, start_at: publish_mode === 'scheduled' ? '2099-01-01T01:00:00Z' : null,
  end_at: publish_mode === 'draft' ? null : '2099-01-01T02:00:00Z', access_code: null,
})

interface Query { table: string; columns: string; eq: [string, unknown][]; update?: Record<string, unknown>; single: boolean }
interface Fixture {
  user: { id: string } | null
  role: string
  rpcError: boolean
  manageable: boolean
  measurementError: boolean
  missingMeasurement: boolean
  updateError: boolean
  updateMissing: boolean
  persistedStatus?: string
  measurementAssignments: { assignment_id: string | null; assignments: { status: string } | { status: string }[] | null }[]
  timeline: string[]
  queries: Query[]
}
let fixture: Fixture
function install() {
  mocks.session.mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: fixture.user } })) },
    rpc: vi.fn(async (name: string) => {
      if (name === 'create_education_research_project') {
        fixture.timeline.push('create-committed')
        return { data: fixture.rpcError ? null : project, error: fixture.rpcError ? { message: 'internal unsafe details' } : null }
      }
      return { data: fixture.manageable, error: null }
    }),
    from(table: string) {
      const log: Query = { table, columns: '', eq: [], single: false }
      fixture.queries.push(log)
      const query = {
        select(columns: string) { log.columns = columns; return query },
        eq(key: string, value: unknown) { log.eq.push([key, value]); return query },
        update(value: Record<string, unknown>) { log.update = value; return query },
        maybeSingle() { log.single = true; return query },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          let data: unknown = null, error: unknown = null
          if (table === 'users') data = { role: fixture.role }
          if (table === 'education_research_measurements') {
            if (log.eq.some(([key]) => key === 'id')) data = fixture.missingMeasurement ? null : {
              id: measurement, project_id: project, org_id: id(8), assignment_id: pretest, measurement_type: 'pretest',
            }
            else {
              fixture.timeline.push('read-persisted-measurements')
              data = fixture.measurementAssignments
              if (fixture.measurementError) { data = null; error = { message: 'private read failure' } }
            }
          }
          if (table === 'assignments' && log.update) {
            fixture.timeline.push('schedule-committed')
            data = fixture.updateMissing ? null : { id: pretest, status: fixture.persistedStatus ?? log.update.status }
            if (fixture.updateError) { data = null; error = { message: 'write denied' } }
          }
          // A completed project does not need a project-status update; this
          // keeps these tests focused on the actual assignment publication.
          if (table === 'education_research_projects') data = { status: 'completed' }
          return Promise.resolve({ data, error }).then(resolve, reject)
        },
      }
      return query
    },
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  fixture = { user: { id: actor }, role: 'teacher', rpcError: false, manageable: true,
    measurementError: false, missingMeasurement: false, updateError: false, updateMissing: false,
    measurementAssignments: [{ assignment_id: pretest, assignments: { status: 'published' } },
      { assignment_id: posttest, assignments: { status: 'draft' } }], timeline: [], queries: [] }
  mocks.notify.mockImplementation(async (assignmentId: string) => {
    fixture.timeline.push(`notify:${assignmentId}`)
    return { success: true, notified: 2 }
  })
  install()
})

describe('research project publication hooks after the committed RPC', () => {
  it('notifies only canonical published linked measurements after creation succeeds', async () => {
    expect(await createEducationResearchProject(createInput())).toEqual({ project_id: project, notificationWarning: undefined })
    expect(fixture.timeline).toEqual(['create-committed', 'read-persisted-measurements', `notify:${pretest}`])
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(pretest, actor)
    expect(fixture.queries.find(row => row.table === 'education_research_measurements')?.eq).toEqual([['project_id', project]])
  })
  it('handles both published exams and de-duplicates canonical assignment IDs', async () => {
    fixture.measurementAssignments = [
      { assignment_id: pretest, assignments: { status: 'published' } },
      { assignment_id: posttest, assignments: [{ status: 'published' }] },
      { assignment_id: pretest, assignments: { status: 'published' } },
      { assignment_id: null, assignments: null },
    ]
    expect(await createEducationResearchProject({ ...createInput(), posttest: online('scheduled') })).toMatchObject({ project_id: project })
    expect(mocks.notify.mock.calls).toEqual([[pretest, actor], [posttest, actor]])
  })
  it('does not infer publication from requested settings when the persisted assignment remains draft', async () => {
    fixture.measurementAssignments = [{ assignment_id: pretest, assignments: { status: 'draft' } }]
    expect(await createEducationResearchProject(createInput())).toMatchObject({ project_id: project })
    expect(mocks.notify).not.toHaveBeenCalled()
  })
  it('does not notify or enumerate measurements for an all-draft project', async () => {
    expect(await createEducationResearchProject({ ...createInput(), pretest: online('draft') })).toMatchObject({ project_id: project })
    expect(mocks.notify).not.toHaveBeenCalled()
    expect(fixture.queries.some(row => row.table === 'education_research_measurements')).toBe(false)
  })
  it('does not notify for offline-only project measurements', async () => {
    expect(await createEducationResearchProject({ ...createInput(),
      pretest: { source_type: 'manual', max_score: 10 }, posttest: { source_type: 'excel', max_score: 10 },
    })).toMatchObject({ project_id: project })
    expect(mocks.notify).not.toHaveBeenCalled()
  })
  it.each(['unauthenticated', 'invalid', 'rpc-failed'] as const)('never sends for %s creation', async kind => {
    if (kind === 'unauthenticated') fixture.user = null
    if (kind === 'rpc-failed') fixture.rpcError = true
    const input = kind === 'invalid' ? { ...createInput(), title: '' } : createInput()
    expect(await createEducationResearchProject(input)).toHaveProperty('error')
    expect(mocks.notify).not.toHaveBeenCalled()
    expect(fixture.queries.some(row => row.table === 'education_research_measurements')).toBe(false)
  })
  it.each(['return-error', 'throw', 'measurement-read-error', 'empty-measurements'] as const)('keeps committed project success with a safe warning on %s', async kind => {
    if (kind === 'return-error') mocks.notify.mockResolvedValue({ error: 'PRIVATE_SEND_FAILURE' })
    if (kind === 'throw') mocks.notify.mockRejectedValue(new Error('PRIVATE_SEND_FAILURE'))
    if (kind === 'measurement-read-error') fixture.measurementError = true
    if (kind === 'empty-measurements') fixture.measurementAssignments = []
    const result = await createEducationResearchProject(createInput())
    expect(result).toMatchObject({ project_id: project, notificationWarning: expect.any(String) })
    expect(result.error).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('PRIVATE_SEND_FAILURE')
    expect(mocks.revalidate).toHaveBeenCalledWith(`/classrooms/${classroom}`)
  })
})

describe('research schedule publication hooks after acknowledged writes', () => {
  it.each(['immediate', 'scheduled'] as const)('notifies after a persisted %s publication', async mode => {
    expect(await updateEducationResearchSchedule(scheduleInput(mode))).toEqual({ success: true, notificationWarning: undefined })
    expect(fixture.timeline).toEqual(['schedule-committed', `notify:${pretest}`])
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(pretest, actor)
    expect(fixture.queries.find(row => row.table === 'assignments')?.columns).toBe('id, status')
  })
  it('does not notify a saved draft or an actual draft returned after a requested publication', async () => {
    expect(await updateEducationResearchSchedule(scheduleInput('draft'))).toMatchObject({ success: true })
    fixture.persistedStatus = 'draft'
    expect(await updateEducationResearchSchedule(scheduleInput())).toMatchObject({ success: true })
    expect(mocks.notify).not.toHaveBeenCalled()
  })
  it.each(['denied', 'write-error', 'zero-rows', 'missing-measurement'] as const)('does not notify a %s schedule write', async kind => {
    if (kind === 'denied') fixture.manageable = false
    if (kind === 'write-error') fixture.updateError = true
    if (kind === 'zero-rows') fixture.updateMissing = true
    if (kind === 'missing-measurement') fixture.missingMeasurement = true
    expect(await updateEducationResearchSchedule(scheduleInput())).toHaveProperty('error')
    expect(mocks.notify).not.toHaveBeenCalled()
  })
  it.each(['return-error', 'throw'] as const)('keeps persisted schedule success with a warning on delivery %s', async kind => {
    if (kind === 'return-error') mocks.notify.mockResolvedValue({ error: 'PRIVATE_SEND_FAILURE' })
    else mocks.notify.mockRejectedValue(new Error('PRIVATE_SEND_FAILURE'))
    const result = await updateEducationResearchSchedule(scheduleInput())
    expect(result).toMatchObject({ success: true, notificationWarning: expect.any(String) })
    expect(result.error).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('PRIVATE_SEND_FAILURE')
    expect(mocks.revalidate).toHaveBeenCalledWith(`/assignments/${pretest}`)
  })
})
