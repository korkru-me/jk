import { beforeEach, describe, expect, it, vi } from 'vitest'
import { composeQuestionSetDescription, parseQuestionSetDescription } from './question-set-theme'

const state = vi.hoisted(() => ({
  user: 'owner' as string | null,
  existing: '[korkru:set-theme:v1:red]\nเดิม',
  denied: false,
  writes: [] as Record<string, unknown>[],
  reads: [] as string[],
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null } }) },
  from: (table: string) => {
    let inserting = false
    const query = {
      insert: (row: Record<string, unknown>) => { inserting = true; state.writes.push(row); return query },
      update: (row: Record<string, unknown>) => { state.writes.push(row); return query },
      delete: () => query,
      eq: () => query,
      select: (fields: string) => { if (table === 'question_sets') state.reads.push(fields); return query },
      single: async () => inserting
        ? { data: { id: 'new-folder' }, error: null }
        : { data: state.denied ? null : { description: state.existing }, error: state.denied ? { message: 'denied' } : null },
      then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
    }
    return query
  },
}) }))
vi.mock('@/lib/actions/questions', () => ({ resolveOrgId: async () => ({ orgId: 'org' }) }))
vi.mock('@/lib/actions/team-org', () => ({ getMyTeamOrgIds: async () => [] }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import { createQuestionSet, saveQuestionSet } from './actions/question-sets'

const payload = { title: 'แฟ้มทดสอบ', description: 'คำอธิบายใหม่', question_ids: [], visibility: 'private' as const }

beforeEach(() => { state.user = 'owner'; state.denied = false; state.writes = []; state.reads = [] })

describe('question set theme write queries', () => {
  it('writes the selected colour together with the description', async () => {
    await createQuestionSet({ ...payload, theme: 'mint' })
    expect(parseQuestionSetDescription(state.writes[0].description as string)).toEqual({ description: payload.description, theme: 'mint' })
  })

  it('assigns an allowed colour when creating without a selection', async () => {
    await createQuestionSet(payload)
    expect(parseQuestionSetDescription(state.writes[0].description as string).theme).toBeDefined()
  })

  it('preserves the chosen colour through successive autosaves without an extra read', async () => {
    await saveQuestionSet('folder', { ...payload, theme: 'amber' })
    await saveQuestionSet('folder', { ...payload, title: 'เปลี่ยนชื่อ', theme: 'amber' })
    expect(state.writes.filter(row => 'description' in row).map(row => parseQuestionSetDescription(row.description as string).theme)).toEqual(['amber', 'amber'])
    expect(state.reads).toEqual([])
  })

  it('preserves saved colour when an older caller omits the theme', async () => {
    state.existing = composeQuestionSetDescription('เดิม', 'red')
    await saveQuestionSet('folder', payload)
    expect(parseQuestionSetDescription(state.writes[0].description as string)).toEqual({ description: payload.description, theme: 'red' })
  })

  it('rejects invalid colours and unauthenticated writes', async () => {
    expect(await createQuestionSet({ ...payload, theme: 'invented' })).toHaveProperty('error')
    state.user = null
    expect(await saveQuestionSet('folder', { ...payload, theme: 'blue' })).toHaveProperty('error')
    expect(state.writes).toEqual([])
  })

  it('does not overwrite data if a legacy read is denied', async () => {
    state.denied = true
    expect(await saveQuestionSet('folder', payload)).toHaveProperty('error')
    expect(state.writes).toEqual([])
  })
})
