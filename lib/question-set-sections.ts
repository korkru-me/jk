/**
 * แฟ้มย่อย (sections) inside a question set — the one optional grouping level
 * between a set and its questions.
 *
 * The flat `question_ids` array is the source of truth for membership *and*
 * order: everything downstream (assignments, grading, export, print) already
 * reads it and must keep working for sets that have no sections at all.
 *
 * `sections` label that array. A section may only reference ids the set
 * already contains, and **the same question may be labelled by several
 * sections** — a งาน–พลังงาน question belongs in both แฟ้มย่อย, and teachers
 * assign either one. Two consequences follow, and callers must respect them:
 *
 * - question order is the teacher's own order in `question_ids`; it is not
 *   derived from section order, because a question in two sections has no
 *   single place to sit
 * - anything that needs one section per question (printed headings, the exam
 *   navigator) takes the first one — see `sectionByQuestionId`
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
 * - a question may appear in several sections, but only once within one
 * - `question_ids` keeps the order it was given: it is the แฟ้ม's own order,
 *   which the teacher sets in the question list
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
  const sections: QuestionSetSection[] = []

  for (const raw of rawSections) {
    if (!raw || typeof raw !== 'object') continue
    const candidate = raw as Partial<QuestionSetSection>

    let id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : newSectionId()
    while (usedIds.has(id)) id = newSectionId()
    usedIds.add(id)

    const title = typeof candidate.title === 'string' ? candidate.title.trim().slice(0, MAX_TITLE_LENGTH) : ''

    const seen = new Set<string>()
    const ids: string[] = []
    for (const qid of Array.isArray(candidate.question_ids) ? candidate.question_ids : []) {
      if (typeof qid !== 'string' || !available.has(qid) || seen.has(qid)) continue
      seen.add(qid)
      ids.push(qid)
    }

    sections.push({ id, title, question_ids: ids })
  }

  return { sections, question_ids: questionIds }
}

/** Questions in the set that no section has claimed, in set order. */
export function ungroupedQuestionIds(
  sections: readonly QuestionSetSection[],
  questionIds: readonly string[]
): string[] {
  const claimed = new Set(sections.flatMap(s => s.question_ids))
  return questionIds.filter(id => !claimed.has(id))
}

/**
 * question_id → the *first* section holding it.
 *
 * For the surfaces that can only show one label per question: printed
 * headings, the exam navigator, the teacher's answer view. The editor uses
 * `sectionsByQuestionId` instead, which keeps all of them.
 */
export function sectionByQuestionId(
  sections: readonly QuestionSetSection[]
): Map<string, QuestionSetSection> {
  const map = new Map<string, QuestionSetSection>()
  for (const section of sections) {
    for (const qid of section.question_ids) {
      if (!map.has(qid)) map.set(qid, section)
    }
  }
  return map
}

/** question_id → every section holding it, in section order. */
export function sectionsByQuestionId(
  sections: readonly QuestionSetSection[]
): Map<string, QuestionSetSection[]> {
  const map = new Map<string, QuestionSetSection[]>()
  for (const section of sections) {
    for (const qid of section.question_ids) {
      const list = map.get(qid)
      if (list) list.push(section)
      else map.set(qid, [section])
    }
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

/**
 * Question ids belonging to the given sections.
 *
 * Deduped, and in the แฟ้ม's own order when `order` is given: a question that
 * two of the chosen แฟ้มย่อย both hold must be assigned once, not twice.
 */
export function questionIdsForSections(
  sections: readonly QuestionSetSection[],
  sectionIds: readonly string[],
  order?: readonly string[]
): string[] {
  const wanted = new Set(sectionIds)
  const ids = new Set(sections.filter(s => wanted.has(s.id)).flatMap(s => s.question_ids))
  return order ? order.filter(id => ids.has(id)) : [...ids]
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

/** Reorders the แฟ้มย่อย cards. Question order is independent of this — it
 *  lives in `question_ids` — so only the sections move. */
export function moveSection(
  sections: readonly QuestionSetSection[],
  sectionId: string,
  delta: number,
  questionIds: readonly string[]
): { sections: QuestionSetSection[]; question_ids: string[] } {
  const index = sections.findIndex(s => s.id === sectionId)
  return normalizeSetSections(moveWithin(sections, index, delta), questionIds)
}

/**
 * Adds or removes one section's label on one question. Other sections keep
 * whatever they had — a question can carry several.
 */
export function setQuestionInSection(
  sections: readonly QuestionSetSection[],
  questionIds: readonly string[],
  questionId: string,
  sectionId: string,
  member: boolean
): { sections: QuestionSetSection[]; question_ids: string[] } {
  const next = sections.map(s => {
    if (s.id !== sectionId) return s
    const without = s.question_ids.filter(id => id !== questionId)
    return { ...s, question_ids: member ? [...without, questionId] : without }
  })
  return normalizeSetSections(next, questionIds)
}

/** Takes one question out of every section, leaving it in the แฟ้ม. */
export function clearQuestionSections(
  sections: readonly QuestionSetSection[],
  questionIds: readonly string[],
  questionId: string
): { sections: QuestionSetSection[]; question_ids: string[] } {
  const next = sections.map(s => ({ ...s, question_ids: s.question_ids.filter(id => id !== questionId) }))
  return normalizeSetSections(next, questionIds)
}

/**
 * Question order on its own — no sections involved.
 *
 * For a list that is still being picked, where `sections` may legitimately
 * name questions the teacher has not selected (yet): the งาน wizard carries
 * the แฟ้มย่อย of every แฟ้ม imported and only trims them at submit, so
 * normalizing against the half-picked selection here would throw away the
 * labels of anything currently unticked. Order never depends on sections
 * anyway — it lives in `question_ids`.
 */
export function moveQuestionOrder(
  questionIds: readonly string[],
  questionId: string,
  delta: number
): string[] {
  return moveWithin(questionIds, questionIds.indexOf(questionId), delta)
}

/** `moveQuestionOrder` to an absolute 0-based position, clamped to the list. */
export function moveQuestionOrderToIndex(
  questionIds: readonly string[],
  questionId: string,
  targetIndex: number
): string[] {
  const index = questionIds.indexOf(questionId)
  if (index < 0) return [...questionIds]
  const clamped = Math.max(0, Math.min(questionIds.length - 1, Math.trunc(targetIndex)))
  return moveWithin(questionIds, index, clamped - index)
}

/** Reorders one question within the แฟ้ม — the order students see. */
export function moveQuestionInSet(
  sections: readonly QuestionSetSection[],
  questionIds: readonly string[],
  questionId: string,
  delta: number
): { sections: QuestionSetSection[]; question_ids: string[] } {
  return normalizeSetSections(sections, moveQuestionOrder(questionIds, questionId, delta))
}

/**
 * Moves one question to an absolute position — 0-based, clamped to the list.
 *
 * `moveQuestionInSet` nudges by one, which is nineteen clicks to get ข้อ 20 up
 * to ข้อ 1, so the order number is editable as well as the arrows.
 */
export function moveQuestionToIndex(
  sections: readonly QuestionSetSection[],
  questionIds: readonly string[],
  questionId: string,
  targetIndex: number
): { sections: QuestionSetSection[]; question_ids: string[] } {
  return normalizeSetSections(sections, moveQuestionOrderToIndex(questionIds, questionId, targetIndex))
}

/** Removes several questions from the set entirely. */
export function removeQuestionsFromSet(
  sections: readonly QuestionSetSection[],
  questionIds: readonly string[],
  removingIds: readonly string[]
): { sections: QuestionSetSection[]; question_ids: string[] } {
  const removing = new Set(removingIds)
  return normalizeSetSections(sections, questionIds.filter(id => !removing.has(id)))
}
