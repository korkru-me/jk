import { expect, it, vi } from 'vitest'
import { loadPracticeCopyQuestions } from '@/app/(app)/practice/_lib/teacher-data'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('Copy must use ordinary RLS') } }))

type Row = Record<string, unknown>
function client(owned: Row[], visible: Row[], error: unknown = null) {
  const calls: string[][] = []
  const from = vi.fn(() => {
    let ids: string[] = []
    const query = {
      select: () => query, eq: () => query, neq: () => query, order: () => query,
      in: (_column: string, values: string[]) => { ids = values; calls.push(values); return query },
      range: async () => ({ data: owned, error: null }),
      then: (resolve: (value: { data: Row[]; error: unknown }) => unknown) => Promise.resolve(resolve({ data: visible.filter(row => ids.includes(String(row.id))), error })),
    }
    return query
  })
  return { value: { from } as unknown as Parameters<typeof loadPracticeCopyQuestions>[0], calls }
}
const row = (id: string, type = 'written') => ({
  id, created_by: 'owner', title: id, question_text: '<p>โจทย์</p>', difficulty: 'medium', question_type: type,
  subject: null, tags: [], variables: [], logic_rules: [], answer_formula: '42', answer_parts: null,
  mcq_options: null, extra_data: {},
})

it('loads only requested source IDs through RLS and strips answer-bearing fields from the form DTO', async () => {
  const db = client([row('own')], [row('shared')])
  const result = await loadPracticeCopyQuestions(db.value, 'teacher', ['own', 'shared', 'private'])
  expect(db.calls).toEqual([['shared', 'private']])
  expect(result.missingIds).toEqual(['private'])
  expect(result.questions.map(question => question.id)).toEqual(['own', 'shared'])
  for (const question of result.questions) {
    expect(question).not.toHaveProperty('answer_formula')
    expect(question).not.toHaveProperty('extra_data')
    expect(question).not.toHaveProperty('created_by')
  }
})

it('identifies unsupported questions rather than silently removing them from the source selection', async () => {
  const db = client([], [row('essay', 'essay')])
  const result = await loadPracticeCopyQuestions(db.value, 'teacher', ['essay'])
  expect(result.unsupportedIds).toEqual(['essay'])
  expect(result.questions).toEqual([])
  expect(result.missingIds).toEqual([])
})

it('rejects a partial result when any RLS lookup fails', async () => {
  const db = client([row('own')], [row('shared')], new Error('query failed'))
  const result = await loadPracticeCopyQuestions(db.value, 'teacher', ['own', 'shared'])
  expect(result.error).toBeTruthy()
  expect(result.questions.map(question => question.id)).toEqual(['own'])
  expect(result.missingIds).toEqual(['shared'])
})
