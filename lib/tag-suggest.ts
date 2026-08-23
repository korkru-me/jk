/**
 * Matching for the tag input.
 *
 * Tags are free text, so one topic drifts into several spellings: an extra
 * space, a different case, a slip of a key. Everything here compares on a
 * normalized key so those collapse into one entry, and the spelling already in
 * the pool wins over the one just typed.
 */

/** Collapses runs of whitespace and trims. The stored spelling of a tag. */
export function normalizeTag(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

/** Identity of a tag: two tags with the same key are the same tag. */
export function tagKey(tag: string): string {
  return normalizeTag(tag).toLowerCase()
}

/**
 * One suggestion list out of the tags saved on questions and the ones typed
 * recently in this browser. Recent ones come first — they are what the teacher
 * is working with right now — and duplicates keep the first spelling seen.
 */
export function mergeTagPool(saved: string[], recent: string[] = []): string[] {
  const seen = new Set<string>()
  const pool: string[] = []
  for (const raw of [...recent, ...saved]) {
    const tag = normalizeTag(raw)
    const key = tagKey(tag)
    if (!tag || seen.has(key)) continue
    seen.add(key)
    pool.push(tag)
  }
  return pool
}

/**
 * The spelling to actually store for what was typed: the pool's, when the pool
 * already knows this tag. Keeps "โลก  ดาราศาสตร์" from becoming a second tag.
 */
export function canonicalTag(pool: string[], raw: string): string {
  const key = tagKey(raw)
  return pool.find(t => tagKey(t) === key) ?? normalizeTag(raw)
}

/** Whether the pool (or the already-picked tags) already holds this tag. */
export function hasTag(tags: string[], raw: string): boolean {
  const key = tagKey(raw)
  return tags.some(t => tagKey(t) === key)
}

/** One entry per tag identity, keeping the first spelling seen. */
export function dedupeTags(tags: string[]): string[] {
  const out: string[] = []
  for (const raw of tags) {
    const tag = normalizeTag(raw ?? '')
    if (tag && !hasTag(out, tag)) out.push(tag)
  }
  return out
}

/**
 * The tags across a set of questions, most-used first.
 *
 * What the tag filter lists. Frequency rather than alphabet, so the filter
 * opens with the tags a teacher actually files things under; ties fall back to
 * Thai collation so the order is stable between loads.
 */
export function rankTagsByUse(tagLists: (string[] | null | undefined)[]): string[] {
  const counts = new Map<string, { tag: string; uses: number }>()
  for (const list of tagLists) {
    // Two spellings of one tag on the same question count once, or a question
    // tagged both "ไฟฟ้า" and "ไฟฟ้า " would outrank a tag on two questions.
    for (const tag of dedupeTags(list ?? [])) {
      const seen = counts.get(tagKey(tag))
      if (seen) seen.uses += 1
      else counts.set(tagKey(tag), { tag, uses: 1 })
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.uses - a.uses || a.tag.localeCompare(b.tag, 'th'))
    .map(entry => entry.tag)
}

/** Levenshtein distance, abandoned once it passes `max` — callers only ask "close enough?". */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
      row.push(d)
      if (d < best) best = d
    }
    if (best > max) return max + 1
    prev = row
  }
  return prev[b.length]
}

/** How much of a typo is forgiven. Short queries get none: everything looks close to "ก". */
function fuzzyBudget(query: string): number {
  if (query.length < 4) return 0
  return query.length > 6 ? 2 : 1
}

function words(tag: string): string[] {
  return tag.split(' ').filter(Boolean)
}

/**
 * Lower is a better match:
 *   0  the tag starts with what was typed        โลก → โลก ดาราศาสตร์ และอวกาศ
 *   1  a word inside the tag starts with it      อวกาศ → โลก ดาราศาสตร์ และอวกาศ
 *   2  it appears somewhere in the tag
 *   3  it is a near miss of the tag's opening or of one of its words (typo)
 */
function matchRank(tag: string, query: string): number {
  const t = tagKey(tag)
  const q = tagKey(query)
  if (t.startsWith(q)) return 0
  if (words(t).some(w => w.startsWith(q))) return 1
  if (t.includes(q)) return 2

  const budget = fuzzyBudget(q)
  if (budget > 0) {
    if (editDistance(t.slice(0, q.length), q, budget) <= budget) return 3
    if (words(t).some(w => editDistance(w, q, budget) <= budget)) return 3
  }
  return Number.POSITIVE_INFINITY
}

/**
 * Suggestions for what is currently typed, best match first. An empty query
 * lists the pool as it stands — recent tags first — so the list is useful
 * before a single key is pressed.
 */
export function suggestTags(
  pool: string[],
  query: string,
  selected: string[] = [],
  limit = 8
): string[] {
  const available = pool.filter(t => !hasTag(selected, t))
  const q = normalizeTag(query)
  if (!q) return available.slice(0, limit)

  return available
    .map((tag, order) => ({ tag, order, rank: matchRank(tag, q) }))
    .filter(m => m.rank !== Number.POSITIVE_INFINITY)
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, limit)
    .map(m => m.tag)
}
