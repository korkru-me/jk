/**
 * How the คลังโจทย์ is ordered.
 *
 * The bank used to have exactly one order — newest first — spelled out at every
 * query in `app/(app)/questions/page.tsx`. Eight copies of the same two
 * `.order()` calls is fine while there is one order; it stops being fine the
 * moment a teacher can choose, because the count query and the row query have
 * to agree. A page that counts in one order and reads in another repeats some
 * questions and skips others. So every ordered question query goes through
 * `applyQuestionSort` and nothing else names an order column.
 */

/**
 * Ways the bank can be ordered.
 *
 * `creator` and `team` only mean anything on the แชร์ในทีม list — a teacher's
 * own bank has one author and one home team — so they are offered there and
 * rejected from the own-bank params.
 */
export type QuestionSortKey =
  | 'created' | 'updated' | 'title' | 'difficulty' | 'type'
  | 'subject' | 'category' | 'tags'
  | 'creator' | 'team'
  | 'usage' | 'pvalue' | 'discrimination' | 'lastUsed'

export type QuestionSortDir = 'asc' | 'desc'

export interface QuestionSort {
  key: QuestionSortKey
  dir: QuestionSortDir
}

export interface QuestionSortSpec {
  /** What the teacher picks from the ordering menu. */
  label: string
  /**
   * What PostgREST orders by. A `relation(column)` form orders the questions
   * by a to-one embedded row, which only the team query selects — so a key
   * using one must be team-only.
   *
   * `null` means the database cannot express this order at all: the value is
   * computed from graded answers, not stored on the row. Those are ranked with
   * `rankQuestionIds` instead — see there for why that is not simply a missing
   * column waiting for a migration.
   */
  column: string | null
  /**
   * Where this key starts when it is first chosen.
   *
   * Not always ascending: someone who asks for "วันที่แก้ไขล่าสุด" wants what
   * they touched this morning, not the oldest thing they ever wrote.
   */
  defaultDir: QuestionSortDir
  /**
   * What each direction is called, in the terms of this key. "มาก→น้อย" means
   * nothing on a column of names, and "ก→ฮ" means nothing on a column of dates.
   */
  dirLabel: Record<QuestionSortDir, string>
  /**
   * The same ordering, read off a row already in memory.
   *
   * The team list has one path that cannot order in the database: when a share
   * list is too large to page, it merges two queries through a Map, which
   * throws away whatever order they arrived in. That path sorts here instead,
   * and this is what keeps the two from becoming two different ideas of
   * "ordered by ชื่อโจทย์". `null` means the row has nothing to offer and
   * belongs at the bottom.
   */
  value: (question: SortableQuestion) => string | number | null
  /** True when `value` returns text, which is compared with Thai collation. */
  text?: boolean
  /** The value this key ranks on, for the keys read from item analysis. */
  statValue?: (stats: QuestionStats) => number | null
}

/** What ranking by item analysis needs. Structural, so this module does not
 *  depend on how the stats are fetched. */
export interface QuestionStatsForSort {
  attempts: number
  pValue: number
  discrimination: number | null
  usedIn: number
  lastUsedAt: string | null
}
type QuestionStats = QuestionStatsForSort

/** What sorting in memory needs off a row. */
export interface SortableQuestion {
  id: string
  title: string
  created_at: string
  updated_at: string
  difficulty: string
  question_type: string
  subject?: string | null
  tags?: string[] | null
  question_categories?: { name: string } | null
  users?: { full_name: string } | null
  organizations?: { name: string } | null
}

/**
 * Enum order, restated for the in-memory sort.
 *
 * Postgres sorts an enum by the order its values were declared, which is the
 * order these lists are in — `difficulty` from the original schema, and
 * `question_type` from the schema plus each `ALTER TYPE ... ADD VALUE` since,
 * which appends. Nothing in JavaScript can read that order back, so it is
 * written out here; a new question type must be appended to this list too, or
 * the two paths will disagree about where it sits.
 */
const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'analytical']
const QUESTION_TYPE_ORDER = [
  'mcq', 'written', 'matching', 'essay', 'true_false', 'fill_blank', 'ordering',
  'file_upload', 'composite',
]

/** Position in an enum, with anything unrecognised sorted to the end. */
const enumRank = (order: string[], value: string) => {
  const index = order.indexOf(value)
  return index === -1 ? order.length : index
}

/** A timestamp as a number, or null when it is missing or unreadable. */
const timeValue = (iso: string | null | undefined) => {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

export const QUESTION_SORTS: Record<QuestionSortKey, QuestionSortSpec> = {
  created: {
    label: 'วันที่สร้าง',
    column: 'created_at',
    defaultDir: 'desc',
    dirLabel: { desc: 'ใหม่ → เก่า', asc: 'เก่า → ใหม่' },
    value: q => timeValue(q.created_at),
  },
  updated: {
    label: 'วันที่แก้ไขล่าสุด',
    column: 'updated_at',
    defaultDir: 'desc',
    dirLabel: { desc: 'ใหม่ → เก่า', asc: 'เก่า → ใหม่' },
    value: q => timeValue(q.updated_at),
  },
  title: {
    label: 'ชื่อโจทย์',
    column: 'title',
    defaultDir: 'asc',
    dirLabel: { asc: 'ก → ฮ', desc: 'ฮ → ก' },
    value: q => q.title,
    text: true,
  },
  difficulty: {
    // `difficulty` is a Postgres enum declared easy, medium, hard, analytical,
    // and an enum sorts in declaration order — so the database already knows
    // that ง่าย comes before ยาก without being told.
    label: 'ระดับความยาก',
    column: 'difficulty',
    defaultDir: 'asc',
    dirLabel: { asc: 'ง่าย → วิเคราะห์', desc: 'วิเคราะห์ → ง่าย' },
    value: q => enumRank(DIFFICULTY_ORDER, q.difficulty),
  },
  type: {
    // Also an enum, but its declaration order is the order the types were added
    // to the product, not anything a teacher would predict. This groups the
    // bank by type — which is what the request actually is — rather than
    // claiming an order the labels don't support.
    label: 'ประเภทโจทย์',
    column: 'question_type',
    defaultDir: 'asc',
    dirLabel: { asc: 'ปรนัย → โจทย์ผสม', desc: 'โจทย์ผสม → ปรนัย' },
    value: q => enumRank(QUESTION_TYPE_ORDER, q.question_type),
  },
  subject: {
    // The วิชา a question belongs to -- ฟิสิกส์, โลก ดาราศาสตร์ และอวกาศ. A
    // plain column on the row, written by the import path and the question
    // forms, and not the same thing as the หมวดหมู่ below: subject is the
    // school subject, a category is a topic inside one.
    label: 'วิชา',
    column: 'subject',
    defaultDir: 'asc',
    dirLabel: { asc: 'ก → ฮ', desc: 'ฮ → ก' },
    value: q => q.subject ?? null,
    text: true,
  },
  category: {
    // The badge on the card. Ordering the questions by a to-one embedded row,
    // the same as `creator` -- both lists select `question_categories`, so
    // unlike the team keys this one is offered on both.
    label: 'หมวดหมู่',
    column: 'question_categories(name)',
    defaultDir: 'asc',
    dirLabel: { asc: 'ก → ฮ', desc: 'ฮ → ก' },
    value: q => q.question_categories?.name ?? null,
    text: true,
  },
  tags: {
    // Ordered by the generated `tag_count` column rather than by `tags`
    // itself: PostgREST orders by columns, and ordering by the array would
    // compare its contents rather than count them.
    //
    // Never null -- an untagged question is zero tags, not an unknown number
    // of them, and the ascending direction exists precisely to bring those to
    // the top for tagging.
    label: 'จำนวนแท็ก',
    column: 'tag_count',
    defaultDir: 'desc',
    dirLabel: { desc: 'มีแท็กมากสุดก่อน', asc: 'ยังไม่มีแท็กก่อน' },
    value: q => q.tags?.length ?? 0,
  },
  usage: {
    label: 'ใช้ในข้อสอบบ่อย',
    column: null,
    defaultDir: 'desc',
    dirLabel: { desc: 'ใช้บ่อยสุดก่อน', asc: 'ใช้น้อยสุดก่อน' },
    value: () => null,
    statValue: stats => stats.usedIn,
  },
  pvalue: {
    // p is the fraction of the points students actually earned, so a *low* p
    // is a hard question. Ascending therefore means "hardest first", which is
    // what a teacher opening this is looking for.
    label: 'ความยากจริง (จากคะแนน)',
    column: null,
    defaultDir: 'asc',
    dirLabel: { asc: 'ยากจริงสุดก่อน', desc: 'ง่ายจริงสุดก่อน' },
    value: () => null,
    statValue: stats => stats.pValue,
  },
  discrimination: {
    // Null for a question with too few attempts or no variance to correlate.
    // Those rank with the questions that have no stats at all — "not measured"
    // rather than "measured as zero".
    label: 'อำนาจจำแนก',
    column: null,
    defaultDir: 'desc',
    dirLabel: { desc: 'จำแนกดีสุดก่อน', asc: 'จำแนกแย่สุดก่อน' },
    value: () => null,
    statValue: stats => stats.discrimination,
  },
  lastUsed: {
    label: 'ใช้ครั้งล่าสุด',
    column: null,
    defaultDir: 'desc',
    dirLabel: { desc: 'เพิ่งใช้ล่าสุดก่อน', asc: 'ไม่ได้ใช้นานสุดก่อน' },
    value: () => null,
    statValue: stats => (stats.lastUsedAt ? Date.parse(stats.lastUsedAt) || null : null),
  },
  creator: {
    // Ordering the parent rows by a to-one embedded row. Only the team query
    // selects `users`, which is why this key never reaches the own bank.
    label: 'ชื่อผู้สร้าง',
    column: 'users(full_name)',
    defaultDir: 'asc',
    dirLabel: { asc: 'ก → ฮ', desc: 'ฮ → ก' },
    value: q => q.users?.full_name ?? null,
    text: true,
  },
  team: {
    label: 'ทีมเจ้าของโจทย์',
    column: 'organizations(name)',
    defaultDir: 'asc',
    dirLabel: { asc: 'ก → ฮ', desc: 'ฮ → ก' },
    value: q => q.organizations?.name ?? null,
    text: true,
  },
}

/** The keys both lists offer — everything stored on the question itself. */
const SHARED_SORT_KEYS: QuestionSortKey[] =
  ['created', 'updated', 'title', 'subject', 'category', 'difficulty', 'type', 'tags']

/**
 * What the own-bank menu offers.
 *
 * The item-analysis keys are here and not on the team list because the stats a
 * teacher can see are their own students' results. Ranking a teammate's bank by
 * "ความยากจริง" would rank it by how *my* classes did on questions I have
 * mostly never assigned, which is a number about me, not about their question.
 */
export const QUESTION_SORT_KEYS: QuestionSortKey[] =
  [...SHARED_SORT_KEYS, 'usage', 'pvalue', 'discrimination', 'lastUsed']

/** The same shared keys, plus the two only a list of other people's work can answer. */
export const TEAM_QUESTION_SORT_KEYS: QuestionSortKey[] =
  [...SHARED_SORT_KEYS, 'creator', 'team']

/** Which list a set of params belongs to. `'t'` is the แชร์ในทีม list. */
export type QuestionSortScope = '' | 't'

const keysFor = (scope: QuestionSortScope) =>
  scope === 't' ? TEAM_QUESTION_SORT_KEYS : QUESTION_SORT_KEYS

/** What the bank shows when nobody has chosen: the order it has always had. */
export const DEFAULT_QUESTION_SORT: QuestionSort = { key: 'created', dir: 'desc' }

/**
 * Reads an ordering out of the URL.
 *
 * Absent or unrecognised params fall back to newest-first, so every link
 * written before the bank could be ordered still opens the list it described.
 * `scope` separates the two lists on the "ทั้งหมด" tab, which page — and now
 * order — independently, and decides which keys are even allowed: `?sort=
 * creator` on the own bank would order it by a table that query never joins.
 */
export function readQuestionSort(
  sp: Record<string, string | string[] | undefined>,
  scope: QuestionSortScope = '',
): QuestionSort {
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  const rawKey = one(`${scope}sort`)
  const key = (keysFor(scope) as string[]).includes(rawKey)
    ? (rawKey as QuestionSortKey)
    : DEFAULT_QUESTION_SORT.key
  const rawDir = one(`${scope}dir`)
  const dir: QuestionSortDir =
    rawDir === 'asc' || rawDir === 'desc' ? rawDir : QUESTION_SORTS[key].defaultDir
  return { key, dir }
}

/**
 * The query-string form of an ordering, for writing back to the URL.
 *
 * A key or direction that matches the default is dropped rather than spelled
 * out, so the plain bank keeps a plain URL.
 */
export function questionSortParams(
  sort: QuestionSort,
  scope: QuestionSortScope = '',
): Record<string, string | null> {
  return {
    [`${scope}sort`]: sort.key === DEFAULT_QUESTION_SORT.key ? null : sort.key,
    [`${scope}dir`]: sort.dir === QUESTION_SORTS[sort.key].defaultDir ? null : sort.dir,
  }
}

/** The shape of a PostgREST query builder, narrowed to what ordering needs. */
interface OrderableQuery<Q> {
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): Q
}

/**
 * Applies an ordering to a question query.
 *
 * Two things every caller needs and none should have to remember:
 *
 * `id` breaks ties, because no sort column here is unique. A bulk import
 * stamps a whole batch with the same `created_at`, a bank of 883 questions has
 * only four difficulties, and rows tied on the sort column have no defined
 * order between them — so successive pages would repeat some questions and
 * drop others. The tiebreaker runs in the *same* direction as the key, which
 * also lets one btree index serve both directions of a sort.
 *
 * Nulls sort last in both directions. A row with nothing in the sort column is
 * a gap in the data rather than the smallest value in it, and floating those to
 * the top every time someone picks that key would bury the questions they came
 * to look at.
 */
export function applyQuestionSort<Q extends OrderableQuery<Q>>(query: Q, sort: QuestionSort): Q {
  const ascending = sort.dir === 'asc'
  const { column } = QUESTION_SORTS[sort.key]
  // A stats key has no column to order by; the caller was supposed to take the
  // ranked path. Falling back to the default order is wrong but visible — an
  // unordered list, not a 400 that empties the คลัง.
  const orderBy = column ?? QUESTION_SORTS[DEFAULT_QUESTION_SORT.key].column!
  return query
    .order(orderBy, { ascending, nullsFirst: false })
    .order('id', { ascending })
}

/** Whether the database can express this ordering, or it has to be ranked here. */
export const isDatabaseSortable = (key: QuestionSortKey) => QUESTION_SORTS[key].column !== null

/**
 * Orders question ids by item analysis.
 *
 * These four keys are the ones the database cannot sort: p, discrimination and
 * "used in" are not columns, they are read out of every graded answer a
 * teacher's students have left, and the rule that turns those answers into the
 * numbers lives in `computeQuestionStats`. Restating that rule in SQL just to
 * be able to write `order=p_value` would put two implementations of the same
 * item analysis in the codebase, and the day they disagreed the list would be
 * ordered by one and labelled with the other.
 *
 * So the ids are ranked here instead, from the same stats the cards display,
 * and the page fetches only the ids the ranking put on the current page.
 *
 * A question with no stats has not been measured — it is not a zero. Those
 * stay in `ids` order at the bottom in both directions, which keeps the rest of
 * the bank in its usual newest-first sequence behind the measured ones.
 */
export function rankQuestionIds(
  ids: string[],
  stats: Record<string, QuestionStats | undefined>,
  sort: QuestionSort,
): string[] {
  const read = QUESTION_SORTS[sort.key].statValue
  if (!read) return ids

  const flip = sort.dir === 'asc' ? 1 : -1
  const position = new Map(ids.map((id, index) => [id, index]))
  const valueOf = (id: string) => {
    const forQuestion = stats[id]
    return forQuestion ? read(forQuestion) : null
  }

  return [...ids].sort((a, b) => {
    const av = valueOf(a)
    const bv = valueOf(b)
    // Unmeasured last in both directions, and among themselves left alone.
    if (av === null || bv === null) {
      if (av === bv) return position.get(a)! - position.get(b)!
      return av === null ? 1 : -1
    }
    if (av !== bv) return av < bv ? -flip : flip
    return position.get(a)! - position.get(b)!
  })
}

/**
 * The same ordering as `applyQuestionSort`, for rows already in memory.
 *
 * Used by the one team path that cannot order in the database — see `value` on
 * `QuestionSortSpec`. It matches the database on everything that decides the
 * list: the key, nulls at the bottom, `id` breaking ties in the direction of
 * the sort. Thai text is compared with `localeCompare(…, 'th')`, which agrees
 * with the database's collation on Thai words; the two can still disagree on
 * how a title made of punctuation sorts, which moves such a row within its own
 * neighbourhood and nowhere else.
 */
export function compareQuestions(
  sort: QuestionSort,
): (a: SortableQuestion, b: SortableQuestion) => number {
  const spec = QUESTION_SORTS[sort.key]
  const flip = sort.dir === 'asc' ? 1 : -1

  return (a, b) => {
    const av = spec.value(a)
    const bv = spec.value(b)

    // Nulls last in both directions, so this is decided before the flip.
    if (av === null || bv === null) {
      if (av === bv) return tieOnId(a, b, flip)
      return av === null ? 1 : -1
    }

    const cmp = spec.text
      ? String(av).localeCompare(String(bv), 'th')
      : Number(av) - Number(bv)
    if (cmp !== 0) return cmp < 0 ? -flip : flip
    return tieOnId(a, b, flip)
  }
}

const tieOnId = (a: SortableQuestion, b: SortableQuestion, flip: number) =>
  a.id === b.id ? 0 : (a.id < b.id ? -1 : 1) * flip
