/**
 * หัวข้อ (sections) inside a question set — the one optional grouping level
 * between a set and its questions.
 *
 * The flat `question_ids` array stays the source of truth for order and
 * membership: everything downstream (assignments, grading, export, print)
 * already reads it and must keep working for sets that have no sections at
 * all. `sections` is a *view* over that array — it may only reference ids the
 * set already contains, and normalising it rewrites `question_ids` so the two
 * can never drift apart.
 */

export interface QuestionSetSection {
  id: string
  title: string
  question_ids: string[]
}

/** A contiguous run of questions that belong to the same section (or to none). */
export interface SectionRun {
  sectionId: string | null
  title: string | null
  question_ids: string[]
}

const MAX_TITLE_LENGTH = 120

export function newSectionId(): string {
  return `sec_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Brings `sections` and `question_ids` back into a consistent state, and is
 * the only thing that should ever write either of them.
 *
 * - ids in a section that the set doesn't contain are dropped
 * - a question claimed by two sections stays in the first one
 * - `question_ids` is rebuilt as [section 1, section 2, …, ungrouped],
 *   so a teacher's section order *is* the question order
 * - empty sections are kept: a teacher naturally creates the heading first
 *   and fills it afterwards
 */
export function normalizeSetSections(
  rawSections: unknown,
  rawQuestionIds: readonly string[]
): { sections: QuestionSetSection[]; question_ids: string[] } {
  const questionIds = [...new Set(rawQuestionIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
  const available = new Set(questionIds)

  if (!Array.isArray(rawSections) || rawSections.length === 0) {
    return { sections: [], question_ids: questionIds }
  }

  const usedIds = new Set<string>()
  const claimed = new Set<string>()
  const sections: QuestionSetSection[] = []

  for (const raw of rawSections) {
    if (!raw || typeof raw !== 'object') continue
    const candidate = raw as Partial<QuestionSetSection>

    let id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : newSectionId()
    while (usedIds.has(id)) id = newSectionId()
    usedIds.add(id)

    const title = typeof candidate.title === 'string' ? candidate.title.trim().slice(0, MAX_TITLE_LENGTH) : ''

    const ids: string[] = []
    for (const qid of Array.isArray(candidate.question_ids) ? candidate.question_ids : []) {
      if (typeof qid !== 'string' || !available.has(qid) || claimed.has(qid)) continue
      claimed.add(qid)
      ids.push(qid)
    }

    sections.push({ id, title, question_ids: ids })
  }

  const ungrouped = questionIds.filter(id => !claimed.has(id))
  return {
    sections,
    question_ids: [...sections.flatMap(s => s.question_ids), ...ungrouped],
  }
}

/** Questions in the set that no section has claimed, in set order. */
export function ungroupedQuestionIds(
  sections: readonly QuestionSetSection[],
  questionIds: readonly string[]
): string[] {
  const claimed = new Set(sections.flatMap(s => s.question_ids))
  return questionIds.filter(id => !claimed.has(id))
}

/** question_id → the section that owns it. */
export function sectionByQuestionId(
  sections: readonly QuestionSetSection[]
): Map<string, QuestionSetSection> {
  const map = new Map<string, QuestionSetSection>()
  for (const section of sections) {
    for (const qid of section.question_ids) map.set(qid, section)
  }
  return map
}

/**
 * Splits an ordered question list into runs by section, for rendering headings.
 * Order comes from the caller (an assignment's question_ids, a submission's
 * answer order), never from `sections` — so a shuffled exam degrades into many
 * short runs instead of showing headings in the wrong place.
 */
export function groupQuestionsBySection(
  orderedQuestionIds: readonly string[],
  sections: readonly QuestionSetSection[]
): SectionRun[] {
  const owner = sectionByQuestionId(sections)
  const runs: SectionRun[] = []

  for (const qid of orderedQuestionIds) {
    const section = owner.get(qid)
    const sectionId = section?.id ?? null
    const last = runs[runs.length - 1]
    if (last && last.sectionId === sectionId) {
      last.question_ids.push(qid)
    } else {
      runs.push({ sectionId, title: section?.title || null, question_ids: [qid] })
    }
  }

  return runs
}

/** True when every section's questions sit together in this order — i.e. the
 *  headings would read as real headings rather than scattered labels. */
export function sectionsAreContiguous(
  orderedQuestionIds: readonly string[],
  sections: readonly QuestionSetSection[]
): boolean {
  const runs = groupQuestionsBySection(orderedQuestionIds, sections)
  const seen = new Set<string | null>()
  for (const run of runs) {
    if (seen.has(run.sectionId)) return false
    seen.add(run.sectionId)
  }
  return true
}

/**
 * Narrows sections to a subset of questions — used when only some sections are
 * assigned, and when snapshotting sections onto an assignment whose questions
 * the teacher trimmed by hand. Sections left empty are dropped, since an
 * assignment has no editor in which to fill them.
 */
export function filterSectionsToQuestions(
  sections: readonly QuestionSetSection[],
  questionIds: readonly string[]
): QuestionSetSection[] {
  const allowed = new Set(questionIds)
  return sections
    .map(s => ({ ...s, question_ids: s.question_ids.filter(id => allowed.has(id)) }))
    .filter(s => s.question_ids.length > 0)
}

/** Question ids belonging to the given sections, in section order. */
export function questionIdsForSections(
  sections: readonly QuestionSetSection[],
  sectionIds: readonly string[]
): string[] {
  const wanted = new Set(sectionIds)
  return sections.filter(s => wanted.has(s.id)).flatMap(s => s.question_ids)
}

/** Parses whatever came back from jsonb into sections, without trusting it. */
export function parseSections(raw: unknown): QuestionSetSection[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s): s is QuestionSetSection =>
      !!s && typeof s === 'object' &&
      typeof (s as QuestionSetSection).id === 'string' &&
      Array.isArray((s as QuestionSetSection).question_ids)
    )
    .map(s => ({
      id: s.id,
      title: typeof s.title === 'string' ? s.title : '',
      question_ids: s.question_ids.filter((id): id is string => typeof id === 'string'),
    }))
}

/** Moves one element of an array by `delta`, clamped to the array bounds. */
function moveWithin<T>(items: readonly T[], index: number, delta: number): T[] {
  const next = [...items]
  const target = index + delta
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

/** Reorders the sections themselves. Question order follows, because
 *  normalizing rebuilds question_ids from the section order. */
export function moveSection(
  sections: readonly QuestionSetSection[],
  sectionId: string,
  delta: number,
  questionIds: readonly string[]
): { sections: QuestionSetSection[]; question_ids: string[] } {
  const index = sections.findIndex(s => s.id === sectionId)
  return normalizeSetSections(moveWithin(sections, index, delta), questionIds)
}

/** Moves a question into a section, or out of every section when
 *  `targetSectionId` is null. Appends at the end of the target. */
export function moveQuestionToSection(
  sections: readonly QuestionSetSection[],
  questionIds: readonly string[],
  questionId: string,
  targetSectionId: string | null
): { sections: QuestionSetSection[]; question_ids: string[] } {
  const stripped = sections.map(s => ({ ...s, question_ids: s.question_ids.filter(id => id !== questionId) }))
  const next = targetSectionId === null
    ? stripped
    : stripped.map(s => (s.id === targetSectionId ? { ...s, question_ids: [...s.question_ids, questionId] } : s))
  return normalizeSetSections(next, questionIds)
}

/** Reorders a question among its own neighbours — inside its section, or
 *  among the ungrouped questions. Never moves it across that boundary; use
 *  moveQuestionToSection for that. */
export function moveQuestionWithinGroup(
  sections: readonly QuestionSetSection[],
  questionIds: readonly string[],
  questionId: string,
  delta: number
): { sections: QuestionSetSection[]; question_ids: string[] } {
  const owner = sections.find(s => s.question_ids.includes(questionId))

  if (owner) {
    const nextSections = sections.map(s =>
      s.id === owner.id
        ? { ...s, question_ids: moveWithin(s.question_ids, s.question_ids.indexOf(questionId), delta) }
        : s
    )
    return normalizeSetSections(nextSections, questionIds)
  }

  const loose = ungroupedQuestionIds(sections, questionIds)
  const reordered = moveWithin(loose, loose.indexOf(questionId), delta)
  const claimed = sections.flatMap(s => s.question_ids)
  return normalizeSetSections(sections, [...claimed, ...reordered])
}
