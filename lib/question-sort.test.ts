import { describe, it, expect } from 'vitest'
import {
  applyQuestionSort,
  compareQuestions,
  isDatabaseSortable,
  rankQuestionIds,
  DEFAULT_QUESTION_SORT,
  questionSortParams,
  readQuestionSort,
  QUESTION_SORTS,
  QUESTION_SORT_KEYS,
  TEAM_QUESTION_SORT_KEYS,
  type QuestionSort,
  type QuestionStatsForSort,
  type SortableQuestion,
} from './question-sort'

/** Item analysis for one question, overridable per case. */
const stat = (over: Partial<QuestionStatsForSort>): QuestionStatsForSort => ({
  attempts: 10,
  pValue: 0.5,
  discrimination: 0.3,
  usedIn: 1,
  lastUsedAt: '2026-01-01T00:00:00Z',
  ...over,
})

/** A row with everything the sort can read, overridable per case. */
const row = (over: Partial<SortableQuestion> & { id: string }): SortableQuestion => ({
  title: 'โจทย์',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  difficulty: 'medium',
  question_type: 'mcq',
  ...over,
})

const idsAfterSort = (rows: SortableQuestion[], sort: QuestionSort) =>
  [...rows].sort(compareQuestions(sort)).map(r => r.id)

describe('readQuestionSort', () => {
  it('falls back to newest-first, so links written before ordering existed still work', () => {
    expect(readQuestionSort({})).toEqual({ key: 'created', dir: 'desc' })
    expect(readQuestionSort({})).toEqual(DEFAULT_QUESTION_SORT)
  })

  it('ignores a key or direction it does not recognise', () => {
    expect(readQuestionSort({ sort: 'drop table', dir: 'sideways' }))
      .toEqual({ key: 'created', dir: 'desc' })
  })

  it("starts a key at its own default direction, not at ascending", () => {
    expect(readQuestionSort({ sort: 'updated' })).toEqual({ key: 'updated', dir: 'desc' })
    expect(readQuestionSort({ sort: 'title' })).toEqual({ key: 'title', dir: 'asc' })
  })

  it('reads an explicit direction', () => {
    expect(readQuestionSort({ sort: 'title', dir: 'desc' })).toEqual({ key: 'title', dir: 'desc' })
  })

  it('reads the team list from its own params, so the two lists order independently', () => {
    const sp = { sort: 'title', dir: 'desc', tsort: 'updated' }
    expect(readQuestionSort(sp)).toEqual({ key: 'title', dir: 'desc' })
    expect(readQuestionSort(sp, 't')).toEqual({ key: 'updated', dir: 'desc' })
  })

  it('ignores a repeated param rather than sorting by an array', () => {
    expect(readQuestionSort({ sort: ['title', 'updated'] })).toEqual(DEFAULT_QUESTION_SORT)
  })

  it('refuses a team-only key on the own bank, whose query never joins it', () => {
    expect(readQuestionSort({ sort: 'creator' })).toEqual(DEFAULT_QUESTION_SORT)
    expect(readQuestionSort({ sort: 'team' })).toEqual(DEFAULT_QUESTION_SORT)
  })

  it('accepts the team-only keys on the team list', () => {
    expect(readQuestionSort({ tsort: 'creator' }, 't')).toEqual({ key: 'creator', dir: 'asc' })
    expect(readQuestionSort({ tsort: 'team', tdir: 'desc' }, 't'))
      .toEqual({ key: 'team', dir: 'desc' })
  })

  it('keeps each list to the keys its query can answer', () => {
    // Stored on the question: both lists.
    for (const key of ['created', 'updated', 'title', 'subject', 'category', 'type'] as const) {
      expect(QUESTION_SORT_KEYS).toContain(key)
      expect(TEAM_QUESTION_SORT_KEYS).toContain(key)
    }
    // Read from this teacher's own students' answers: own bank only.
    for (const key of ['usage', 'pvalue', 'discrimination', 'lastUsed'] as const) {
      expect(QUESTION_SORT_KEYS).toContain(key)
      expect(TEAM_QUESTION_SORT_KEYS).not.toContain(key)
      expect(readQuestionSort({ tsort: key }, 't')).toEqual(DEFAULT_QUESTION_SORT)
    }
    // About whose question it is: team list only.
    for (const key of ['creator', 'team'] as const) {
      expect(TEAM_QUESTION_SORT_KEYS).toContain(key)
      expect(QUESTION_SORT_KEYS).not.toContain(key)
    }
  })

  it('round-trips the own-bank keys through the URL as well', () => {
    for (const key of QUESTION_SORT_KEYS) {
      for (const dir of ['asc', 'desc'] as const) {
        const written = questionSortParams({ key, dir })
        const url: Record<string, string> = {}
        for (const [k, v] of Object.entries(written)) if (v !== null) url[k] = v
        expect(readQuestionSort(url)).toEqual({ key, dir })
      }
    }
  })
})

describe('questionSortParams', () => {
  it('keeps the default order out of the URL', () => {
    expect(questionSortParams({ key: 'created', dir: 'desc' })).toEqual({ sort: null, dir: null })
  })

  it('drops a direction that is already the key default', () => {
    expect(questionSortParams({ key: 'title', dir: 'asc' })).toEqual({ sort: 'title', dir: null })
  })

  it('spells out a direction that is not', () => {
    expect(questionSortParams({ key: 'title', dir: 'desc' })).toEqual({ sort: 'title', dir: 'desc' })
    expect(questionSortParams({ key: 'created', dir: 'asc' })).toEqual({ sort: null, dir: 'asc' })
  })

  it('writes the team list to its own params', () => {
    expect(questionSortParams({ key: 'creator', dir: 'asc' }, 't'))
      .toEqual({ tsort: 'creator', tdir: null })
    expect(questionSortParams({ key: 'created', dir: 'desc' }, 't'))
      .toEqual({ tsort: null, tdir: null })
  })

  it('round-trips every key in both directions', () => {
    for (const key of TEAM_QUESTION_SORT_KEYS) {
      for (const dir of ['asc', 'desc'] as const) {
        const sort: QuestionSort = { key, dir }
        const written = questionSortParams(sort, 't')
        const url: Record<string, string> = {}
        for (const [k, v] of Object.entries(written)) if (v !== null) url[k] = v
        expect(readQuestionSort(url, 't')).toEqual(sort)
      }
    }
  })
})

describe('applyQuestionSort', () => {
  /** Records what a PostgREST builder would have been asked to order by. */
  function spy() {
    const calls: { column: string; ascending: boolean; nullsFirst?: boolean }[] = []
    const query = {
      calls,
      order(column: string, options: { ascending: boolean; nullsFirst?: boolean }) {
        calls.push({ column, ...options })
        return query
      },
    }
    return query
  }

  it('orders by the key column, then breaks ties on id', () => {
    expect(applyQuestionSort(spy(), { key: 'updated', dir: 'desc' }).calls).toEqual([
      { column: 'updated_at', ascending: false, nullsFirst: false },
      { column: 'id', ascending: false },
    ])
  })

  it('runs the tiebreaker in the same direction as the key', () => {
    for (const key of TEAM_QUESTION_SORT_KEYS) {
      for (const dir of ['asc', 'desc'] as const) {
        const calls = applyQuestionSort(spy(), { key, dir }).calls
        expect(calls[0].column).toBe(QUESTION_SORTS[key].column)
        expect(calls[1]).toEqual({ column: 'id', ascending: dir === 'asc' })
        expect(calls[0].ascending).toBe(calls[1].ascending)
      }
    }
  })

  it('keeps rows with nothing in the sort column at the bottom either way', () => {
    for (const dir of ['asc', 'desc'] as const) {
      expect(applyQuestionSort(spy(), { key: 'title', dir }).calls[0].nullsFirst).toBe(false)
    }
  })
})

describe('compareQuestions', () => {
  it('matches the database on dates, newest first by default', () => {
    const rows = [
      row({ id: 'b', created_at: '2026-03-01T00:00:00Z' }),
      row({ id: 'a', created_at: '2026-01-01T00:00:00Z' }),
      row({ id: 'c', created_at: '2026-02-01T00:00:00Z' }),
    ]
    expect(idsAfterSort(rows, { key: 'created', dir: 'desc' })).toEqual(['b', 'c', 'a'])
    expect(idsAfterSort(rows, { key: 'created', dir: 'asc' })).toEqual(['a', 'c', 'b'])
  })

  it('orders difficulty and type by enum position, not by label', () => {
    const diffs = ['analytical', 'easy', 'hard', 'medium']
      .map((difficulty, i) => row({ id: String(i), difficulty }))
    expect(idsAfterSort(diffs, { key: 'difficulty', dir: 'asc' })
      .map(id => diffs[Number(id)].difficulty))
      .toEqual(['easy', 'medium', 'hard', 'analytical'])

    const types = ['composite', 'mcq', 'essay']
      .map((question_type, i) => row({ id: String(i), question_type }))
    expect(idsAfterSort(types, { key: 'type', dir: 'asc' })
      .map(id => types[Number(id)].question_type))
      .toEqual(['mcq', 'essay', 'composite'])
  })

  it('sorts Thai titles the way Thai is read, leading vowels and all', () => {
    // เ/แ/ใ/ไ are written before their consonant but sort after it, which is
    // what the database does too — เมฆ belongs under ม, between ภ and ห.
    const rows = [
      row({ id: '3', title: 'หาก' }),
      row({ id: '1', title: 'ภูมิภาค' }),
      row({ id: '2', title: 'เมฆ' }),
    ]
    expect(idsAfterSort(rows, { key: 'title', dir: 'asc' })).toEqual(['1', '2', '3'])
    expect(idsAfterSort(rows, { key: 'title', dir: 'desc' })).toEqual(['3', '2', '1'])
  })

  it('keeps rows with no value at the bottom in both directions', () => {
    const rows = [
      row({ id: 'none' }),
      row({ id: 'som', users: { full_name: 'สมชาย' } }),
      row({ id: 'kan', users: { full_name: 'กรรณิการ์' } }),
    ]
    expect(idsAfterSort(rows, { key: 'creator', dir: 'asc' })).toEqual(['kan', 'som', 'none'])
    expect(idsAfterSort(rows, { key: 'creator', dir: 'desc' })).toEqual(['som', 'kan', 'none'])
  })

  it('breaks ties on id so a merged list has one settled order', () => {
    const rows = [
      row({ id: 'c', title: 'เท่ากัน' }),
      row({ id: 'a', title: 'เท่ากัน' }),
      row({ id: 'b', title: 'เท่ากัน' }),
    ]
    expect(idsAfterSort(rows, { key: 'title', dir: 'asc' })).toEqual(['a', 'b', 'c'])
    expect(idsAfterSort(rows, { key: 'title', dir: 'desc' })).toEqual(['c', 'b', 'a'])
  })

  it('is a total order — sorting an already-sorted list changes nothing', () => {
    const rows = [
      row({ id: 'a', title: 'ก' }),
      row({ id: 'b', title: 'ข' }),
      row({ id: 'c', title: 'ค' }),
      row({ id: 'd' }),
    ]
    for (const dir of ['asc', 'desc'] as const) {
      const once = [...rows].sort(compareQuestions({ key: 'title', dir }))
      const twice = [...once].sort(compareQuestions({ key: 'title', dir }))
      expect(twice.map(r => r.id)).toEqual(once.map(r => r.id))
    }
  })
})

describe('the keys added for วิชา, หมวดหมู่ and แท็ก', () => {
  it('orders by วิชา and by หมวดหมู่ as two different things', () => {
    const rows = [
      row({ id: 'c', subject: 'ฟิสิกส์', question_categories: { name: 'แสง' } }),
      row({ id: 'a', subject: 'เคมี', question_categories: { name: 'กรด-เบส' } }),
      row({ id: 'b', subject: 'ฟิสิกส์', question_categories: { name: 'ความร้อน' } }),
    ]
    // เคมี before ฟิสิกส์; inside ฟิสิกส์, ความร้อน before แสง.
    expect(idsAfterSort(rows, { key: 'subject', dir: 'asc' })).toEqual(['a', 'b', 'c'])
    expect(idsAfterSort(rows, { key: 'category', dir: 'asc' })).toEqual(['a', 'b', 'c'])
    // …and they really are different orders, not one aliased to the other.
    const byCategory = [
      row({ id: 'x', subject: 'ฟิสิกส์', question_categories: { name: 'กรด-เบส' } }),
      row({ id: 'y', subject: 'เคมี', question_categories: { name: 'แสง' } }),
    ]
    expect(idsAfterSort(byCategory, { key: 'subject', dir: 'asc' })).toEqual(['y', 'x'])
    expect(idsAfterSort(byCategory, { key: 'category', dir: 'asc' })).toEqual(['x', 'y'])
  })

  it('counts an untagged question as zero tags, not as unknown', () => {
    const rows = [
      row({ id: 'two', tags: ['ก', 'ข'] }),
      row({ id: 'none' }),
      row({ id: 'empty', tags: [] }),
      row({ id: 'one', tags: ['ก'] }),
    ]
    // Descending: most tags first, and both kinds of untagged at the bottom —
    // where nulls-last would have put them in *both* directions.
    expect(idsAfterSort(rows, { key: 'tags', dir: 'desc' }))
      .toEqual(['two', 'one', 'none', 'empty'])
    // Ascending is the tagging worklist: nothing-yet first.
    expect(idsAfterSort(rows, { key: 'tags', dir: 'asc' }))
      .toEqual(['empty', 'none', 'one', 'two'])
  })

  it('leaves a question with no วิชา at the bottom either way', () => {
    const rows = [row({ id: 'none' }), row({ id: 'has', subject: 'ฟิสิกส์' })]
    expect(idsAfterSort(rows, { key: 'subject', dir: 'asc' })).toEqual(['has', 'none'])
    expect(idsAfterSort(rows, { key: 'subject', dir: 'desc' })).toEqual(['has', 'none'])
  })

  it('offers วิชา, หมวดหมู่ and แท็ก on both lists', () => {
    for (const key of ['subject', 'category', 'tags'] as const) {
      expect(QUESTION_SORT_KEYS).toContain(key)
      expect(TEAM_QUESTION_SORT_KEYS).toContain(key)
      expect(readQuestionSort({ sort: key })).toEqual({ key, dir: QUESTION_SORTS[key].defaultDir })
      expect(readQuestionSort({ tsort: key }, 't')).toEqual({ key, dir: QUESTION_SORTS[key].defaultDir })
    }
  })
})

describe('rankQuestionIds', () => {
  const ids = ['a', 'b', 'c', 'd']
  const stats = {
    a: stat({ usedIn: 1, pValue: 0.9, discrimination: 0.1, lastUsedAt: '2026-01-01T00:00:00Z' }),
    b: stat({ usedIn: 5, pValue: 0.2, discrimination: 0.6, lastUsedAt: '2026-06-01T00:00:00Z' }),
    c: stat({ usedIn: 3, pValue: 0.5, discrimination: null, lastUsedAt: null }),
    // 'd' has never been answered and so has no entry at all.
  }

  it('knows which keys the database cannot sort', () => {
    for (const key of ['usage', 'pvalue', 'discrimination', 'lastUsed'] as const) {
      expect(isDatabaseSortable(key)).toBe(false)
    }
    for (const key of ['created', 'title', 'tags', 'category', 'creator'] as const) {
      expect(isDatabaseSortable(key)).toBe(true)
    }
  })

  it('ranks by how often a question has been used', () => {
    expect(rankQuestionIds(ids, stats, { key: 'usage', dir: 'desc' })).toEqual(['b', 'c', 'a', 'd'])
    expect(rankQuestionIds(ids, stats, { key: 'usage', dir: 'asc' })).toEqual(['a', 'c', 'b', 'd'])
  })

  it('reads a low p as a hard question, so ascending is hardest first', () => {
    expect(rankQuestionIds(ids, stats, { key: 'pvalue', dir: 'asc' })).toEqual(['b', 'c', 'a', 'd'])
    expect(rankQuestionIds(ids, stats, { key: 'pvalue', dir: 'desc' })).toEqual(['a', 'c', 'b', 'd'])
  })

  it('treats an uncomputable discrimination as unmeasured, not as zero', () => {
    // 'c' has stats but no correlation, so it joins 'd' at the bottom rather
    // than sorting below 'a' as if it had scored 0.
    expect(rankQuestionIds(ids, stats, { key: 'discrimination', dir: 'desc' }))
      .toEqual(['b', 'a', 'c', 'd'])
    expect(rankQuestionIds(ids, stats, { key: 'discrimination', dir: 'asc' }))
      .toEqual(['a', 'b', 'c', 'd'])
  })

  it('ranks by when a question was last put in front of students', () => {
    expect(rankQuestionIds(ids, stats, { key: 'lastUsed', dir: 'desc' })).toEqual(['b', 'a', 'c', 'd'])
    expect(rankQuestionIds(ids, stats, { key: 'lastUsed', dir: 'asc' })).toEqual(['a', 'b', 'c', 'd'])
  })

  it('leaves unmeasured questions in the order they arrived, in both directions', () => {
    // The incoming ids are already newest-first, and that is what the tail of
    // the list should keep looking like.
    const many = ['n1', 'n2', 'n3']
    for (const dir of ['asc', 'desc'] as const) {
      expect(rankQuestionIds(many, {}, { key: 'pvalue', dir })).toEqual(many)
    }
  })

  it('does not lose or duplicate a question, whatever the key', () => {
    for (const key of ['usage', 'pvalue', 'discrimination', 'lastUsed'] as const) {
      for (const dir of ['asc', 'desc'] as const) {
        const out = rankQuestionIds(ids, stats, { key, dir })
        expect([...out].sort()).toEqual([...ids].sort())
      }
    }
  })

  it('leaves the ids alone for a key the database sorts', () => {
    expect(rankQuestionIds(ids, stats, { key: 'title', dir: 'asc' })).toEqual(ids)
  })
})

describe('applyQuestionSort with a key it cannot express', () => {
  it('falls back to the default column rather than sending an unknown one', () => {
    const calls: { column: string; ascending: boolean }[] = []
    const query = {
      calls,
      order(column: string, options: { ascending: boolean; nullsFirst?: boolean }) {
        calls.push({ column, ascending: options.ascending })
        return query
      },
    }
    applyQuestionSort(query, { key: 'pvalue', dir: 'asc' })
    // created_at, not "pvalue" — a column PostgREST would reject outright,
    // emptying the คลัง instead of merely ordering it unhelpfully.
    expect(calls[0].column).toBe('created_at')
  })
})
