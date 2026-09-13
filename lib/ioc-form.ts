/**
 * Turning a KorKru exam into an IOC form, without a teacher retyping any of it.
 *
 * The wizard's judgement calls live here as plain functions so they can be
 * tested without a database: what the document header says, which fields a
 * form cannot be saved without, and how the selected questions become the rows
 * of the printed table.
 *
 * Layout and wording follow the approved mockups in docs/research/mockups and
 * the source document described in docs/EDUCATION_RESEARCH_IOC.md.
 */

import { IOC_DEFAULT_PERCENT_RULE, IOC_DEFAULT_THRESHOLD } from '@/lib/ioc'
import type { MCQOption } from '@/lib/types'

/** Same letters the ตรวจแล้ว panel uses, so one exam reads the same everywhere. */
const CHOICE_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ']

export interface IocHeaderInput {
  exam_title: string
  subject_name: string
  subject_code: string
  grade_level: string
  term_label: string
  academic_year: string
  school_name: string
  author_name: string
  author_position: string
}

export type IocHeaderField = keyof IocHeaderInput

export interface IocHeaderValidation {
  valid: boolean
  errors: Partial<Record<IocHeaderField, string>>
}

/** The header's fields, in the order the document prints them. */
export const IOC_HEADER_FIELDS = [
  'exam_title',
  'subject_name',
  'subject_code',
  'grade_level',
  'term_label',
  'academic_year',
  'school_name',
  'author_name',
  'author_position',
] as const satisfies readonly IocHeaderField[]

export function emptyIocHeader(): IocHeaderInput {
  const header = {} as IocHeaderInput
  for (const field of IOC_HEADER_FIELDS) header[field] = ''
  return header
}

/**
 * Reads only the header's own fields. Callers hand this whole form payloads —
 * thresholds, booleans, ids — and copying every key it was given would both
 * leak them into the header and crash on the first one that is not a string.
 */
export function normalizeIocHeader(input: Partial<Record<IocHeaderField, unknown>>): IocHeaderInput {
  const trimmed = {} as IocHeaderInput
  for (const field of IOC_HEADER_FIELDS) {
    const value = input[field]
    trimmed[field] = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  }
  return trimmed
}

/**
 * Only two fields are required. Everything else is printed if present and
 * skipped if absent, because a form for a school-written outcome may have no
 * subject code, and a tutor has no school name to give.
 */
export function validateIocHeader(input: Partial<Record<IocHeaderField, unknown>>): IocHeaderValidation {
  const header = normalizeIocHeader(input)
  const errors: Partial<Record<IocHeaderField, string>> = {}

  if (!header.exam_title) errors.exam_title = 'กรอกชื่อแบบทดสอบและช่วงสอบ'
  if (!header.author_name) errors.author_name = 'กรอกชื่อผู้ออกข้อสอบ'
  if (header.academic_year && !/^\d{4}$/.test(header.academic_year)) {
    errors.academic_year = 'ปีการศึกษาเป็นตัวเลข 4 หลัก เช่น 2569'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

/**
 * The three centred lines at the top of every page. Each line drops the parts
 * the teacher left blank instead of printing a dangling label.
 */
export function buildIocDocumentTitle(input: Partial<Record<IocHeaderField, unknown>>): string[] {
  const header = normalizeIocHeader(input)
  const lines: string[] = []
  // Without an exam to name, the line would end on a dangling "กับ". The
  // preview is shown while the field is still empty, so this is the normal
  // state of a form being filled in, not an error.
  if (header.exam_title) {
    lines.push(`การหาค่าความสอดคล้อง (IOC) ของมาตรฐานตัวชี้วัด/ผลการเรียนรู้ กับ${header.exam_title}`)
  }

  const subjectParts = [
    header.subject_name ? `รายวิชา${header.subject_name}` : '',
    header.subject_code ? `รหัสวิชา ${header.subject_code}` : '',
    header.grade_level ? `ชั้น${header.grade_level}` : '',
  ].filter(Boolean)
  if (subjectParts.length > 0) lines.push(subjectParts.join(' '))

  if (header.school_name) lines.push(header.school_name)

  return lines
}

/** The คำชี้แจง paragraph, which the teacher may then edit in their own words. */
export function buildIocInstructionText(input: Partial<Record<IocHeaderField, unknown>>): string {
  const header = normalizeIocHeader(input)
  const subject = header.subject_name ? ` รายวิชา${header.subject_name}` : ''
  const exam = header.exam_title || 'แบบทดสอบฉบับนี้'
  return (
    `ขอให้ท่านได้แสดงความคิดเห็นของท่านที่มีต่อ${exam}${subject} `
    + 'โดยใส่เครื่องหมาย ✓ ลงในช่องความเห็นของท่าน '
    + 'พร้อมเขียนข้อเสนอแนะที่เป็นประโยชน์ในการนำไปพิจารณาปรับปรุงต่อไป'
  )
}

/** One question as the wizard reads it out of the bank. */
export interface IocSourceQuestion {
  id: string
  question_text: string
  mcq_options: MCQOption[] | null
  image_urls: string[]
  solution_text: string | null
  /** Multi-step questions share a group; `order_in_group` 0 is the shared stem. */
  group_id: string | null
  order_in_group: number | null
}

export interface IocItemDraft {
  order_index: number
  item_label: string
  section_label: string
  group_intro: string
  prompt: string
  choices: string[]
  image_urls: string[]
  solution: string | null
  source_question_id: string
}

export interface BuildIocItemDraftsOptions {
  /** First section title per question, from the set the exam was built from. */
  sectionTitleByQuestionId?: Readonly<Record<string, string>>
  /** Where the printed numbering starts. A second form can continue at 12. */
  startNumber?: number
}

/**
 * The order given is the order printed. A group's shared stem is not an item
 * of its own — it becomes the intro above the first question that uses it,
 * exactly as the source document prints a table of data above "จงตอบคำถาม 3
 * ข้อดังต่อไปนี้".
 */
export function buildIocItemDrafts(
  questions: readonly IocSourceQuestion[],
  options: BuildIocItemDraftsOptions = {},
): IocItemDraft[] {
  const sectionTitles = options.sectionTitleByQuestionId ?? {}
  const startNumber = options.startNumber ?? 1

  const stemByGroup = new Map<string, string>()
  for (const question of questions) {
    if (question.group_id && question.order_in_group === 0) {
      stemByGroup.set(question.group_id, question.question_text)
    }
  }

  const drafts: IocItemDraft[] = []
  const usedGroupStems = new Set<string>()
  let printedSection = ''

  for (const question of questions) {
    // The stem row carries no judgement of its own.
    if (question.group_id && question.order_in_group === 0) continue

    const sectionTitle = sectionTitles[question.id] ?? ''
    // A heading is printed once, when the section changes.
    const sectionLabel = sectionTitle && sectionTitle !== printedSection ? sectionTitle : ''
    if (sectionTitle) printedSection = sectionTitle

    let groupIntro = ''
    if (question.group_id && !usedGroupStems.has(question.group_id)) {
      groupIntro = stemByGroup.get(question.group_id) ?? ''
      if (groupIntro) usedGroupStems.add(question.group_id)
    }

    const order = drafts.length + 1
    drafts.push({
      order_index: order,
      item_label: String(startNumber + order - 1),
      section_label: sectionLabel,
      group_intro: groupIntro,
      prompt: question.question_text,
      choices: (question.mcq_options ?? []).map((option, index) => {
        const label = CHOICE_LABELS[index] ?? String(index + 1)
        return `${label}. ${option.text}`
      }),
      image_urls: question.image_urls ?? [],
      solution: question.solution_text,
      source_question_id: question.id,
    })
  }

  return drafts
}

export interface IocItemReadiness {
  ready: boolean
  /** Printed numbers of the items still missing an indicator. */
  missingLabels: string[]
}

/**
 * A form cannot go out to experts while an item has no indicator to be judged
 * against — the middle column of the table would be empty and the question
 * being asked would have no answer.
 */
export function checkIocItemsReady(
  items: readonly { item_label: string; standard_id: string | null }[],
): IocItemReadiness {
  const missingLabels = items.filter(item => !item.standard_id).map(item => item.item_label)
  return { ready: items.length > 0 && missingLabels.length === 0, missingLabels }
}

/** How an indicator reads in a picker and in the printed table's left column. */
export function formatStandardLabel(
  standard: { code: string; description: string },
  options: { withDescription?: boolean } = {},
): string {
  const code = standard.code.trim()
  const description = standard.description.trim()
  if (!options.withDescription) return code || description
  if (code && description) return `${code} — ${description}`
  return code || description
}

/** What a new form starts with before the teacher changes anything. */
export const IOC_FORM_DEFAULTS = {
  threshold: IOC_DEFAULT_THRESHOLD,
  percent_rule: IOC_DEFAULT_PERCENT_RULE,
  show_solutions: false,
} as const
