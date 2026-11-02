import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ admin: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.admin }))
import { loadAssignmentQuestionsByProvenance } from './assignment-question-access.server'

const ASSIGNMENT = '10000000-0000-4000-8000-000000000001'
const QUESTION = '20000000-0000-4000-8000-000000000001'
let prompt: Record<string, unknown>
beforeEach(() => {
  prompt = { id: QUESTION, created_by: 'teacher', org_id: 'org', visibility: 'private', is_research_snapshot: false, extra_data: { file_assignment_id: ASSIGNMENT } }
  m.admin.mockReturnValue({ from: (table: string) => {
    const data = () => table === 'questions' ? [prompt] : table === 'question_shares' ? [] : null
    const query = {
      select: () => query, in: () => query, eq: () => query,
      maybeSingle: async () => ({ data: data(), error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: data(), error: null }).then(resolve),
    }
    return query
  } })
})
const refs = { id: ASSIGNMENT, created_by: 'teacher', org_id: 'org', question_ids: [QUESTION] }
describe('assignment-owned prompt provenance', () => {
  it('loads the inline file prompt only in its exact authorized assignment context', async () => {
    expect(await loadAssignmentQuestionsByProvenance(refs)).toMatchObject({ questions: [prompt], missingQuestionIds: [] })
    expect(await loadAssignmentQuestionsByProvenance({ ...refs, id: 'another' })).toMatchObject({ questions: [], missingQuestionIds: [QUESTION] })
    const { id: _id, ...ordinaryCreate } = refs
    expect(await loadAssignmentQuestionsByProvenance(ordinaryCreate)).toMatchObject({ questions: [], missingQuestionIds: [QUESTION] })
  })
  it('requires the exact creator and organization even if the prompt was made public', async () => {
    prompt.visibility = 'public'
    expect(await loadAssignmentQuestionsByProvenance({ ...refs, created_by: 'other' })).toMatchObject({ questions: [] })
    expect(await loadAssignmentQuestionsByProvenance({ ...refs, org_id: 'other' })).toMatchObject({ questions: [] })
  })
  it('preserves legacy file-upload questions with no assignment-only metadata', async () => {
    prompt.extra_data = { attachment_urls: [] }
    expect(await loadAssignmentQuestionsByProvenance({ ...refs, id: 'legacy-assignment' })).toMatchObject({ questions: [prompt] })
  })
})
