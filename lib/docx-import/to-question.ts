/**
 * A parsed โจทย์, in the shape the app's own authoring forms already speak.
 *
 * The import screen does not have an editor of its own. A draft is carried as
 * a `Question` — the same object `/questions/[id]/edit` hands to a form — so
 * pressing "แก้ไข" opens the real ปรนัย/อัตนัย/บรรยาย form, pre-filled, with its
 * validation, symbol picker, image upload and live preview intact. The form
 * hands its payload back rather than saving (see `lib/question-draft-handoff.ts`),
 * and `applyFormPayload` folds it into the draft.
 *
 * The last step reuses `toPortableQuestion`, so an imported โจทย์ reaches the
 * database through exactly the same path as one from a `.korkru.json` file.
 */
import { toPortableQuestion, type PortableQuestion } from '@/lib/question-portable'
import type { QuestionFormData } from '@/lib/actions/questions'
import type { AnswerPart, MCQOption, Question, QuestionType } from '@/lib/types'
import type { DraftQuestion, DraftPart, DraftWarning } from './draft'

/** The types a Word worksheet can produce. The rest are authored in the app. */
export type ImportableType = Extract<QuestionType, 'mcq' | 'written' | 'essay'>

export interface DraftEntry {
  id: string
  /** Position in the document's own numbering. */
  number: number
  /** Unticked โจทย์ are left in the document. */
  include: boolean
  /** Whether the teacher has opened this one and pressed ตกลง. */
  reviewed: boolean
  /** Whether the โจทย์'s own words refer to a picture. */
  mentionsPicture: boolean
  warnings: DraftWarning[]
  /** Kept while the โจทย์ is not an mcq, so switching back restores them. */
  parkedOptions: MCQOption[]
  question: Question
}

/** Tolerance a numeric answer is accepted within, matching the อัตนัย form. */
const DEFAULT_TOLERANCE = 0.1

/**
 * Sub-questions written into the body.
 *
 * `mcq` and `essay` have no structure for parts of their own, so ก) ข) ค)
 * become lines of the โจทย์ — which is how they read on the worksheet anyway.
 * Only `written` keeps them apart, as `answer_parts`.
 */
function withPartsInBody(html: string, parts: DraftPart[]): string {
  if (parts.length === 0) return html
  const lines = parts.map(part => {
    const body = part.html.replace(/^<p>/, '').replace(/<\/p>$/, '')
    return part.label ? `<p>${part.label}) ${body}</p>` : `<p>${body}</p>`
  })
  return html + lines.join('')
}

function partsToAnswerParts(parts: DraftPart[]): AnswerPart[] {
  return parts.map(part => ({
    id: part.id,
    sub_text: part.html,
    formula: '',
    unit: '',
    tolerance: DEFAULT_TOLERANCE,
  }))
}

/** A `Question` with every field a form reads, and nothing pretending to be saved. */
function blankQuestion(): Question {
  return {
    id: '', created_by: '', org_id: null, shared_org_ids: [], team_edit_allowed: true,
    is_research_snapshot: false, research_snapshot_project_id: null, research_snapshot_source_id: null,
    category_id: '', grade_level: null, subject: null, title: '', question_text: '',
    question_type: 'essay', difficulty: 'medium',
    // Imports are stored private by `importQuestionsFromFile`; the forms hide
    // their sharing controls in draft mode rather than offer a choice that
    // would be dropped.
    visibility: 'private',
    is_random: false, variables: [], logic_rules: [],
    answer_formula: '', answer_unit: null, answer_tolerance: 0, answer_parts: null,
    mcq_options: null, solution_text: null, solution_image_urls: [], tags: null,
    rejected_reason: null, image_urls: [], requires_work_image: false, extra_data: {},
    parent_question_id: null, group_id: null, order_in_group: null,
    content_fingerprint: null, search_text: '', tag_count: 0,
    created_at: '', updated_at: '',
  }
}

export function draftToEntry(draft: DraftQuestion, imageUrls: Map<string, string>): DraftEntry {
  const image_urls = draft.imageRelIds
    .map(relId => imageUrls.get(relId))
    .filter((url): url is string => !!url)

  const mcq_options: MCQOption[] = draft.choices.map(choice => ({
    text: choice.text,
    is_correct: choice.isCorrect,
  }))

  const question: Question = {
    ...blankQuestion(),
    id: draft.id,
    title: draft.title,
    question_type: draft.type,
    question_text: draft.type === 'written'
      ? draft.html
      : withPartsInBody(draft.html, draft.parts),
    mcq_options: draft.type === 'mcq' ? mcq_options : null,
    answer_parts: draft.type === 'written' && draft.parts.length > 0
      ? partsToAnswerParts(draft.parts)
      : null,
    image_urls,
  }

  return {
    id: draft.id,
    number: draft.number,
    include: true,
    reviewed: false,
    mentionsPicture: draft.mentionsPicture,
    warnings: draft.warnings,
    parkedOptions: draft.type === 'mcq' ? [] : mcq_options,
    question,
  }
}

/**
 * Switches a โจทย์ to another type without losing what was read from the file.
 *
 * Options are parked rather than dropped, so a โจทย์ read as ปรนัย and switched
 * to บรรยาย by mistake comes back with its four choices intact.
 */
export function changeType(entry: DraftEntry, type: ImportableType): DraftEntry {
  if (entry.question.question_type === type) return entry

  const leavingMcq = entry.question.question_type === 'mcq'
  const options = leavingMcq ? (entry.question.mcq_options ?? []) : entry.parkedOptions

  return {
    ...entry,
    parkedOptions: type === 'mcq' ? [] : options,
    question: {
      ...entry.question,
      question_type: type,
      mcq_options: type === 'mcq' ? (options.length > 0 ? options : null) : null,
      // Only อัตนัย grades against formulas; carrying them onto a type that
      // ignores them would leave an answer nothing reads.
      answer_parts: type === 'written' ? entry.question.answer_parts : null,
      answer_formula: type === 'written' ? entry.question.answer_formula : '',
      is_random: type === 'written' ? entry.question.is_random : false,
      variables: type === 'written' ? entry.question.variables : [],
      logic_rules: type === 'written' ? entry.question.logic_rules : [],
    },
  }
}

/** Folds an authoring form's payload back into the draft it came from. */
export function applyFormPayload(entry: DraftEntry, payload: QuestionFormData): DraftEntry {
  return {
    ...entry,
    reviewed: true,
    question: {
      ...entry.question,
      title: payload.title,
      subject: payload.subject || null,
      grade_level: payload.grade_level || null,
      question_text: payload.question_text,
      question_type: payload.question_type,
      difficulty: payload.difficulty,
      is_random: payload.is_random,
      variables: payload.variables,
      logic_rules: payload.logic_rules,
      answer_formula: payload.answer_formula,
      answer_unit: payload.answer_unit || null,
      answer_tolerance: payload.answer_tolerance,
      answer_parts: payload.answer_parts.length > 0 ? payload.answer_parts : null,
      mcq_options: payload.mcq_options.length > 0 ? payload.mcq_options : null,
      solution_text: payload.solution_text || null,
      solution_image_urls: payload.solution_image_urls ?? [],
      tags: payload.tags.length > 0 ? payload.tags : null,
      image_urls: payload.image_urls,
    },
  }
}

/**
 * The reasons a โจทย์ cannot be imported, as opposed to the warnings that only
 * ask the teacher to look.
 *
 * Every one of these would store a โจทย์ whose recorded correct answer is
 * unusable: an mcq with nothing marked correct freezes an empty correct answer
 * into each attempt, and an อัตนัย with no formula freezes the evaluator's
 * failure text. Both mark every student wrong, silently.
 */
export function validateForImport({ question }: DraftEntry): string | null {
  const bodyText = question.question_text.replace(/<[^>]*>/g, '').trim()

  if (!question.title.trim()) return 'ยังไม่มีชื่อโจทย์'
  if (!bodyText && question.image_urls.length === 0) return 'เนื้อโจทย์ว่าง'

  if (question.question_type === 'mcq') {
    const options = question.mcq_options ?? []
    if (options.length < 2) return 'ปรนัยต้องมีตัวเลือกอย่างน้อย 2 ข้อ'
    if (options.some(option => !option.text.replace(/<[^>]*>/g, '').trim() && !option.image_url)) {
      return 'มีตัวเลือกที่ยังว่างอยู่'
    }
    if (!options.some(option => option.is_correct)) return 'ยังไม่ได้เลือกข้อที่ถูก'
    return null
  }

  if (question.question_type === 'written') {
    const parts = question.answer_parts ?? []
    const missing = parts.length > 0
      ? parts.some(part => !part.formula.trim())
      : !question.answer_formula.trim()
    if (missing) return 'อัตนัยต้องใส่เฉลย — กด "แก้ไข" เพื่อกรอก หรือเปลี่ยนเป็นบรรยายเพื่อตรวจเอง'
  }

  return null
}

/**
 * The warnings the teacher can act on from the card, worked out from the โจทย์
 * as it stands right now.
 *
 * Everything here is fixable in one click on the import screen — tick the
 * answer, move the picture onto the โจทย์ it belongs to — so it is recomputed
 * rather than frozen at parse time. A notice that still says "ไม่พบเครื่องหมาย
 * เฉลย" after the teacher has ticked one teaches them the warnings are noise.
 * The frozen ones on `DraftEntry.warnings` are the opposite kind: they describe
 * what the *file* said, which no edit here changes.
 */
export function liveWarnings(entry: DraftEntry, floatingImageUrls: ReadonlySet<string>): DraftWarning[] {
  const { mentionsPicture, question } = entry
  const warnings: DraftWarning[] = []

  if (question.question_type === 'mcq') {
    const correctCount = (question.mcq_options ?? []).filter(option => option.is_correct).length
    if (correctCount === 0) {
      warnings.push({
        code: 'no-correct-choice',
        message: 'ไม่พบเครื่องหมายเฉลยในไฟล์ — ติ๊กข้อที่ถูกก่อนนำเข้า',
      })
    } else if (correctCount > 1) {
      // Only the first marked option is what an attempt records as correct.
      warnings.push({
        code: 'multiple-correct-choices',
        message: `ติ๊กข้อที่ถูกไว้ ${correctCount} ข้อ — ระบบจะตรวจโดยถือข้อแรกเป็นคำตอบ`,
      })
    }
  }

  if (mentionsPicture && question.image_urls.length === 0) {
    warnings.push({
      code: 'image-expected',
      message: 'ข้อนี้พูดถึงรูป แต่ไม่พบรูปในข้อ — รูปอาจไปอยู่ข้ออื่น',
    })
  } else if (!mentionsPicture && question.image_urls.some(url => floatingImageUrls.has(url))) {
    warnings.push({
      code: 'image-unreferenced',
      message: 'พบรูปลอยในข้อนี้ แต่ข้อความไม่ได้พูดถึงรูป — อาจเป็นรูปของข้ออื่น',
    })
  }

  return warnings
}

/**
 * Hands a confirmed draft to the คลัง's own import format.
 *
 * `subject` is asked once for the whole file rather than per โจทย์ — a Word
 * worksheet is one subject — so it is stamped here instead of being carried on
 * each draft. That also makes the file-level field the only source of truth:
 * changing it after a โจทย์ was already checked still reaches the import.
 */
export function entryToPortable(entry: DraftEntry, subject: string): PortableQuestion {
  return { ...toPortableQuestion(entry.question), subject: subject.trim() || null }
}
