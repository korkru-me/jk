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
import type { AnswerPart, FillBlankConfig, FillBlankItem, ImageLabelConfig, MatchingConfig, MatchingDistractor, MatchingPair, MCQOption, OrderingConfig, OrderingItem, Question, QuestionType, TrueFalseConfig, TrueFalseStatement } from '@/lib/types'
import { acceptedAnswers, countBlanks } from '@/lib/fill-blank'
import { applyOrder } from './draft'
import type { DraftAnswer, DraftBlank, DraftImageLabel, DraftMatching, DraftOrderChoice, DraftQuestion, DraftPart, DraftStatement, DraftWarning } from './draft'

/** The types a Word worksheet can produce. The rest are authored in the app. */
export type ImportableType = Extract<QuestionType, 'mcq' | 'written' | 'essay' | 'fill_blank' | 'true_false' | 'ordering' | 'matching' | 'image_label'>

/**
 * What an exam paper says about a เรียงลำดับ ข้อ that the โจทย์ itself must not
 * carry: the fragments in the scrambled order the page printed them, and the
 * "2-1-4-3" options it offered.
 *
 * Kept on the import screen rather than on the `Question`, because none of it
 * is part of the โจทย์ — the โจทย์ is the list in the right order, and the
 * student is shown a shuffle of it. It is here so that ticking the right
 * option on the card can rebuild that list from the same starting point every
 * time, however many times the teacher changes their mind.
 */
export interface DraftOrdering {
  /** Document order, with the ids `extra_data` will carry. */
  items: OrderingItem[]
  choices: DraftOrderChoice[]
}

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
  /** The paper's own scaffolding for a เรียงลำดับ ข้อ, or null when the file
   *  said nothing about one. Cleared once the teacher has edited the โจทย์ in
   *  the form: from then on the list is theirs, not the page's. */
  ordering: DraftOrdering | null
  /** Which of a จับคู่ ข้อ's pairs the file actually stated, one flag per pair
   *  in the same order. The rest were lined up in printed order to fill the
   *  shape, and have to be settled by the teacher before the โจทย์ may be
   *  saved. Per pair rather than a count, because a worksheet's answered ข้อ
   *  are scattered through the list, not the first few. */
  matching: { keyed: boolean[] } | null
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

/**
 * Sub-questions as answer boxes, one per เฉลย the file gave.
 *
 * A sub-question whose bracket held two values — "จงหาความเร็ว และความเร่ง
 * (200 m/s, 10 m/s²)" — becomes two boxes, because that is what the โจทย์ asks
 * for and what it is marked out of. They repeat the sub-question's own text,
 * which the teacher can shorten on the form; a box with no label at all would
 * leave a student guessing which value goes where.
 *
 * A sub-question the reader found no answer for still becomes a box with an
 * empty formula. `validateForImport` then holds the โจทย์ back until the
 * teacher fills it in, rather than letting it reach the คลัง unmarkable.
 */
function partsToAnswerParts(parts: DraftPart[]): AnswerPart[] {
  return parts.flatMap(part => {
    if (part.answers.length === 0) {
      return [{ id: part.id, sub_text: part.html, formula: '', unit: '', tolerance: DEFAULT_TOLERANCE }]
    }
    return part.answers.map((answer, index) => ({
      id: index === 0 ? part.id : `${part.id}-${index}`,
      sub_text: part.html,
      formula: answer.formula,
      unit: answer.unit,
      tolerance: DEFAULT_TOLERANCE,
    }))
  })
}

/**
 * The same, for a โจทย์ that asks for two values without splitting into ก) ข).
 *
 * The โจทย์'s own words already say which is which and in what order, so the
 * boxes are left unlabelled rather than given text nobody wrote. The โจทย์
 * carries a warning saying they were split.
 */
function answersToAnswerParts(id: string, answers: DraftAnswer[]): AnswerPart[] {
  return answers.map((answer, index) => ({
    id: `${id}-answer-${index}`,
    sub_text: '',
    formula: answer.formula,
    unit: answer.unit,
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

/**
 * The ช่องว่าง the file gave, in the shape the เติมคำ form saves.
 *
 * Every one comes in as `fixed` — the system marks it against the word the
 * teacher wrote — because a file that says what the answer is has already
 * decided that. Case is ignored, which is what the form's own default does,
 * and a teacher who wants a blank marked by hand switches it on the form.
 */
function blanksToConfig(blanks: DraftBlank[]): FillBlankItem[] {
  return blanks.map((blank, index) => {
    // A gap the file left empty — a row of dots or underscores — gives no
    // answer to mark against, so it comes in as one the teacher marks. Typing
    // an answer on the form turns it into one the system marks.
    const known = blank.answer.trim().length > 0
    return {
      id: index + 1,
      type: known ? ('fixed' as const) : ('text' as const),
      answer: blank.answer,
      answers: known ? [blank.answer] : [],
      case_sensitive: false,
    }
  })
}

/**
 * A ถูก-ผิด โจทย์ in the shape its own form saves.
 *
 * The app keeps the first statement in `question_text` and the rest in
 * `statements`, so that is how they are handed over. The lead-in goes to
 * `prompt`, which exists for exactly this: a line every statement is judged
 * against and none of them is.
 *
 * `score_answer` is what the file says a statement is worth — a Thai paper
 * writes "(0.25 คะแนน)" beside each — and falls back to the form's own default
 * of 1 when it says nothing.
 */
function trueFalseFields(draft: DraftQuestion): { question_text: string; extra_data: TrueFalseConfig } {
  const [first, ...rest] = draft.statements
  const scores = draft.statements.map(statement => statement.score).filter((score): score is number => score !== null)

  const statements: TrueFalseStatement[] = rest.map((statement, index) => ({
    id: `${draft.id}-s${index + 1}`,
    text: statement.html,
    correct_answer: statement.isTrue === true,
  }))

  return {
    question_text: first?.html ?? '',
    extra_data: {
      // An empty lead-in is left out: most ถูก-ผิด โจทย์ do not have one, and
      // an empty paragraph would print as a blank line above the statements.
      ...(draft.html.replace(/<[^>]*>/g, '').trim() ? { prompt: draft.html } : {}),
      correct_answer: first?.isTrue === true,
      explanation_mode: 'none' as const,
      score_answer: scores.length > 0 ? scores[0] : 1,
      score_explanation: 0,
      ...(statements.length > 0 ? { statements } : {}),
    },
  }
}

/**
 * The list to put in order, in the order the file says is right.
 *
 * A worksheet writes the steps in that order already and the answer is the
 * list itself. An exam paper prints them scrambled and marks one of its
 * "2-1-4-3" options instead, so the marked one is applied here — the โจทย์
 * stored is the sorted list either way, and the options never leave this
 * screen.
 *
 * Nothing is marked in an exam paper handed out to students, which is most of
 * the files teachers already have. Those arrive in the page's own order with
 * the options offered on the card; `validateForImport` holds the ข้อ back
 * until one is ticked, rather than letting a scrambled list reach the คลัง as
 * though it were the answer.
 */
function orderedItems(ordering: DraftOrdering): OrderingItem[] {
  const correct = ordering.choices.find(choice => choice.isCorrect)
  // An order that does not arrange the list leaves it alone rather than
  // dropping the items it failed to place.
  return correct ? applyOrder(ordering.items, correct.order) : ordering.items
}

function orderingOf(draft: DraftQuestion): DraftOrdering {
  return {
    items: draft.orderItems.map((text, index) => ({ id: `${draft.id}-i${index}`, text })),
    choices: draft.orderChoices,
  }
}

/** Ticks one of the orders the paper offered, and rebuilds the list from it. */
export function pickOrder(entry: DraftEntry, index: number): DraftEntry {
  if (!entry.ordering) return entry
  const ordering: DraftOrdering = {
    ...entry.ordering,
    // One order is right, so ticking a second one unticks the first — unlike
    // an mcq, where a teacher marking two keys is answering a different
    // question about the โจทย์ and is only warned.
    choices: entry.ordering.choices.map((choice, at) => ({ ...choice, isCorrect: at === index })),
  }
  return {
    ...entry,
    ordering,
    question: { ...entry.question, extra_data: { items: orderedItems(ordering) } },
  }
}

/**
 * A จับคู่ โจทย์ in the shape its own form saves.
 *
 * The pairs go to `mcq_options` — where this type has always kept them — and
 * the choices that belong to no pair go to `extra_data.distractors`, which is
 * where a teacher's own spare ก. ข. ค. would go if they added them by hand.
 * Pictures in the table's cells become the pair's own images, so a worksheet
 * that matches a drawing to a word arrives with its drawings attached.
 */
function matchingFields(
  matching: DraftMatching,
  imageUrls: Map<string, string>,
): { mcq_options: MatchingPair[]; extra_data: MatchingConfig } {
  const url = (relId?: string) => (relId ? imageUrls.get(relId) : undefined)

  const pairs: MatchingPair[] = matching.pairs.map(pair => ({
    left_text: pair.leftText,
    right_text: pair.rightText,
    ...(url(pair.leftRelId) ? { left_image: url(pair.leftRelId) } : {}),
    ...(url(pair.rightRelId) ? { right_image: url(pair.rightRelId) } : {}),
  }))

  const distractors: MatchingDistractor[] = matching.distractors.map(distractor => ({
    text: distractor.text,
    ...(url(distractor.relId) ? { image: url(distractor.relId) } : {}),
  }))

  return {
    mcq_options: pairs,
    extra_data: {
      answer_mode: matching.answerMode,
      ...(distractors.length > 0 ? { distractors } : {}),
    },
  }
}

/**
 * A เติมคำในรูป โจทย์ in the shape its own form saves.
 *
 * Every blank the file stated becomes a point with its เฉลย already filled in,
 * which is the part of this โจทย์ that is worth not retyping: a cell diagram is
 * a dozen long Thai words.
 *
 * Where each point *goes* is the part no file can state — see `readImageLabel`
 * — so the points are laid out rather than placed: across at the box's own
 * position, which the file does give, and evenly down the picture in reading
 * order, which is a layout and not a reading. Two things keep that from being
 * mistaken for the teacher's own placement: the ข้อ carries a warning saying
 * so, and `validateForImport` will not let it be imported until the teacher
 * has opened it and pressed ตกลง.
 *
 * `typed` rather than the form's own default of ลากคำ, because a word bank has
 * to hold every answer to be answerable and a worksheet handed out blank
 * states none of them. The form switches it in one click.
 */
function imageLabelFields(
  draft: DraftQuestion,
  imageLabel: DraftImageLabel,
  imageUrls: Map<string, string>,
): { extra_data: ImageLabelConfig } {
  const { blanks } = imageLabel
  const spread = (index: number) => (blanks.length < 2 ? 50 : 10 + (80 * index) / (blanks.length - 1))

  return {
    extra_data: {
      image_url: imageUrls.get(imageLabel.relId) ?? '',
      answer_mode: 'typed',
      markers: blanks.map((blank, index) => ({
        id: `${draft.id}-point-${index}`,
        // Named after its own เฉลย, which is what the teacher needs while
        // dragging point 7 onto the right organ. Marker labels are never sent
        // to a student's browser — see `ImageLabelMarker.label`.
        ...(blank.answer ? { label: blank.answer } : {}),
        point: { x: blank.x ?? 50, y: spread(index) },
        answers: blank.answer ? [blank.answer] : [],
        case_sensitive: false,
      })),
    },
  }
}

/**
 * Where a เฉลย read from the file lands on the โจทย์.
 *
 * `answer_formula` for the ordinary case of one value, and `answer_parts` as
 * soon as there is more than one answer to keep apart — which is the same
 * field the อัตนัย form fills in when a teacher builds a โจทย์ with ก) ข) by
 * hand, so an imported โจทย์ is indistinguishable from a typed one afterwards.
 */
function answerFields(draft: DraftQuestion): Pick<Question, 'answer_formula' | 'answer_unit' | 'answer_parts'> {
  if (draft.type !== 'written') {
    return { answer_formula: '', answer_unit: null, answer_parts: null }
  }

  if (draft.parts.length > 0) {
    return { answer_formula: '', answer_unit: null, answer_parts: partsToAnswerParts(draft.parts) }
  }

  if (draft.answers.length > 1) {
    return { answer_formula: '', answer_unit: null, answer_parts: answersToAnswerParts(draft.id, draft.answers) }
  }

  const only = draft.answers[0]
  return {
    answer_formula: only?.formula ?? '',
    answer_unit: only?.unit || null,
    answer_parts: null,
  }
}

export function draftToEntry(draft: DraftQuestion, imageUrls: Map<string, string>): DraftEntry {
  // A จับคู่'s pictures live inside the table cells and become the pairs' own
  // images; repeating them under the คำชี้แจง would print the answer key's
  // left-hand column above the exercise.
  // A เติมคำในรูป keeps its diagram in `extra_data.image_url`, for the same
  // reason: every renderer prints `image_urls` above the answer area without
  // looking at the type, so the picture being answered *on* would appear a
  // second time as an illustration.
  const image_urls = draft.type === 'matching' || draft.type === 'image_label'
    ? []
    : draft.imageRelIds
      .map(relId => imageUrls.get(relId))
      .filter((url): url is string => !!url)

  const mcq_options: MCQOption[] = draft.choices.map(choice => ({
    text: choice.text,
    is_correct: choice.isCorrect,
  }))

  const trueFalse = draft.type === 'true_false' ? trueFalseFields(draft) : null
  const ordering = draft.type === 'ordering' ? orderingOf(draft) : null
  const matching = draft.type === 'matching' && draft.matching
    ? matchingFields(draft.matching, imageUrls)
    : null
  const imageLabel = draft.type === 'image_label' && draft.imageLabel
    ? imageLabelFields(draft, draft.imageLabel, imageUrls)
    : null

  const question: Question = {
    ...blankQuestion(),
    id: draft.id,
    title: draft.title,
    question_type: draft.type,
    question_text: trueFalse
      ? trueFalse.question_text
      : draft.type === 'written'
        ? draft.html
        : withPartsInBody(draft.html, draft.parts),
    // A จับคู่ keeps its pairs here, which is where this type has always kept
    // them — `resolveMcqOptions` in lib/actions/questions.ts writes them to the
    // same column when the form saves one.
    mcq_options: draft.type === 'mcq' ? mcq_options
      : matching ? (matching.mcq_options as unknown as MCQOption[])
        : null,
    ...answerFields(draft),
    extra_data: trueFalse
      ? trueFalse.extra_data
      : matching ? matching.extra_data
        : imageLabel ? imageLabel.extra_data
          : ordering ? { items: orderedItems(ordering) }
            : draft.type === 'fill_blank' ? { blanks: blanksToConfig(draft.blanks) } : {},
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
    ordering,
    matching: draft.matching ? { keyed: draft.matching.pairs.map(pair => pair.keyed) } : null,
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
      extra_data: type === 'fill_blank' || type === 'true_false' || type === 'ordering' || type === 'matching' || type === 'image_label'
        ? entry.question.extra_data
        : {},
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
    // The list is now whatever the teacher arranged in the form. Leaving the
    // paper's options on the card would offer to undo that edit in one click,
    // and they are only a way of finding the order in the first place.
    ordering: null,
    // Same for a จับคู่: the pairs on screen are the ones the teacher just
    // confirmed, so what the file did or did not state about them is spent.
    matching: null,
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
      extra_data: payload.extra_data ?? entry.question.extra_data,
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
export function validateForImport(entry: DraftEntry): string | null {
  const { question, ordering, matching } = entry
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

  if (question.question_type === 'true_false') {
    const bodyText = question.question_text.replace(/<[^>]*>/g, '').trim()
    if (!bodyText) return 'ถูก-ผิดต้องมีข้อความอย่างน้อย 1 ข้อ'
    return null
  }

  if (question.question_type === 'matching') {
    const pairs = (question.mcq_options ?? []) as unknown as MatchingPair[]
    if (pairs.length < 2) return 'จับคู่ต้องมีอย่างน้อย 2 คู่'
    if (pairs.some(pair => (!pair.left_text.trim() && !pair.left_image) || (!pair.right_text.trim() && !pair.right_image))) {
      return 'มีคู่ที่ยังว่างอยู่ด้านใดด้านหนึ่ง'
    }
    // The rows of a worksheet's table are not its answer key — the two columns
    // are deliberately out of step — so pairs the file never stated are
    // placeholders. Importing them would record an answer nobody wrote and
    // mark the class wrong on it.
    if (matching?.keyed.some(keyed => !keyed)) {
      return 'ยังจับคู่ไม่ครบ — กด "แก้ไข" เพื่อจับคู่ให้ถูกก่อนนำเข้า'
    }
    return null
  }

  if (question.question_type === 'ordering') {
    const items = (question.extra_data as OrderingConfig | undefined)?.items ?? []
    if (items.length < 2) return 'เรียงลำดับต้องมีรายการอย่างน้อย 2 รายการ'
    if (items.some(item => !item.text.trim() && !item.image_url)) return 'มีรายการที่ยังว่างอยู่'
    // The page printed the fragments scrambled on purpose. Importing that
    // order because nobody ticked one would freeze the wrong answer into
    // every attempt and mark the whole class wrong on it, silently.
    if (ordering && ordering.choices.length > 0 && !ordering.choices.some(choice => choice.isCorrect)) {
      return 'ยังไม่ได้เลือกลำดับที่ถูก — เลือกบนการ์ดได้เลย'
    }
    return null
  }

  if (question.question_type === 'image_label') {
    const config = question.extra_data as ImageLabelConfig | undefined
    if (!config?.image_url) return 'ไม่พบรูปของข้อนี้ในไฟล์ — กด "แก้ไข" เพื่ออัปโหลดรูปเอง'
    const markers = config.markers ?? []
    if (markers.length === 0) return 'ไม่พบช่องเติมคำบนรูป — กด "แก้ไข" เพื่อวางจุดเอง'
    if (markers.every(marker => marker.answers.every(answer => !answer.trim()))) {
      return 'ยังไม่มีเฉลยสักจุด — กด "แก้ไข" เพื่อพิมพ์เฉลยของแต่ละจุด'
    }
    // The one type whose โจทย์ the file cannot finish. A Word file says where
    // each answer *box* sits on the page and never what it points at, so the
    // points arrive spread out rather than placed, and importing without
    // looking would store a picture whose จุด are all in the wrong places —
    // graded, and wrong, without anything having said so. Opening the ข้อ and
    // pressing ตกลง is the whole of what is being asked.
    if (!entry.reviewed) {
      return 'ยังไม่ได้วางจุดบนรูป — กด "แก้ไข" ลากจุดให้ตรงตำแหน่ง แล้วกดตกลง'
    }
    return null
  }

  if (question.question_type === 'fill_blank') {
    const blanks = (question.extra_data as FillBlankConfig | undefined)?.blanks ?? []
    if (blanks.length === 0) return 'เติมคำต้องมีช่องกรอกอย่างน้อย 1 ช่อง'
    // The markers in the โจทย์ and the cards under it are the same list: a
    // โจทย์ with three [___n] and two answers marks the third blank wrong for
    // every student.
    if (countBlanks(question.question_text) !== blanks.length) {
      return 'จำนวนช่องกรอกในโจทย์ไม่ตรงกับจำนวนคำตอบ — กด "แก้ไข" เพื่อดู'
    }
    if (blanks.some(blank => blank.type !== 'text' && !acceptedAnswers(blank).some(answer => answer.trim()))) {
      return 'มีช่องกรอกที่ยังไม่มีคำตอบ'
    }
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
  const { matching, mentionsPicture, ordering, question } = entry
  const warnings: DraftWarning[] = []

  if (question.question_type === 'matching' && matching?.keyed.some(keyed => !keyed)) {
    // Said out loud because the โจทย์ *looks* finished: every ข้อ has something
    // beside it. What it has is the next unclaimed choice.
    const keyedCount = matching.keyed.filter(Boolean).length
    const missing = matching.keyed.length - keyedCount
    warnings.push({
      code: 'unpaired-matching',
      message: keyedCount === 0
        ? `ไฟล์ไม่ได้บอกว่าข้อไหนคู่กับอะไร — ${missing} คู่ที่เห็นคือการจับเรียงตามลำดับในไฟล์ ยังไม่ใช่เฉลย`
        : `อ่านเฉลยได้ ${keyedCount} จาก ${matching.keyed.length} คู่ — อีก ${missing} คู่จับไว้ตามลำดับที่เหลือ ยังไม่ใช่เฉลย`,
    })
  }

  if (question.question_type === 'ordering' && ordering && ordering.choices.length > 0) {
    const marked = ordering.choices.filter(choice => choice.isCorrect).length
    if (marked === 0) {
      warnings.push({
        code: 'no-correct-order',
        message: 'ไม่พบเครื่องหมายเฉลยในไฟล์ — เลือกลำดับที่ถูกก่อนนำเข้า (รายการตอนนี้เรียงตามที่พิมพ์ไว้ในข้อสอบ ซึ่งเป็นลำดับที่สลับไว้)',
      })
    } else if (marked > 1) {
      warnings.push({
        code: 'multiple-correct-choices',
        message: `ไฟล์ทำเครื่องหมายไว้ ${marked} ลำดับ — ระบบใช้ลำดับแรก เลือกใหม่บนการ์ดได้`,
      })
    }
  }

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
