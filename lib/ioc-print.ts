/**
 * The shape of the printed IOC document, worked out away from the page that
 * renders it.
 *
 * Four documents come out of one form — the blank form, one expert's filled-in
 * copy, the summary table, and all of it bound together — and they share a
 * header, a table and a signature page. What differs is which column carries a
 * tick and whose name sits under the dotted line, so those differences live
 * here as data rather than as branches inside JSX.
 *
 * Layout follows the approved mockups (`phase-ioc-5`, `-10`, `-11`) and the
 * source document described in docs/EDUCATION_RESEARCH_IOC.md.
 */

import type { IocScore } from '@/lib/ioc'

export type IocPrintDoc = 'blank' | 'expert' | 'summary' | 'book'

export interface IocPrintOptions {
  doc: IocPrintDoc
  /** Which expert's copy to print; ignored by the other documents. */
  expertId: string | null
  authorSignature: boolean
  expertSignature: boolean
  showComments: boolean
  showCriteria: boolean
  watermark: boolean
}

const DOCS: IocPrintDoc[] = ['blank', 'expert', 'summary', 'book']

/** A missing flag keeps the default, so a bare `?doc=summary` still prints. */
export function parseIocPrintOptions(
  params: Record<string, string | string[] | undefined>,
): IocPrintOptions {
  const read = (key: string): string | undefined => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }
  const flag = (key: string, fallback: boolean): boolean => {
    const value = read(key)
    if (value === undefined) return fallback
    return value === '1' || value === 'true'
  }

  const doc = DOCS.find(candidate => candidate === read('doc')) ?? 'blank'
  return {
    doc,
    expertId: read('expert') ?? null,
    authorSignature: flag('author_sig', true),
    expertSignature: flag('expert_sig', doc !== 'blank'),
    showComments: flag('comments', true),
    showCriteria: flag('criteria', true),
    // The summary is an appendix to a report rather than a copy sent out for
    // marking, so it does not carry the "copy for review" stamp by default.
    watermark: flag('watermark', doc !== 'summary'),
  }
}

export function serializeIocPrintOptions(options: IocPrintOptions): string {
  const params = new URLSearchParams()
  params.set('doc', options.doc)
  if (options.expertId) params.set('expert', options.expertId)
  params.set('author_sig', options.authorSignature ? '1' : '0')
  params.set('expert_sig', options.expertSignature ? '1' : '0')
  params.set('comments', options.showComments ? '1' : '0')
  params.set('criteria', options.showCriteria ? '1' : '0')
  params.set('watermark', options.watermark ? '1' : '0')
  return params.toString()
}

export interface IocPrintItemInput {
  id: string
  item_label: string
  section_label: string
  group_intro: string
  prompt: string
  choices: string[]
  standard_id: string | null
  solution?: string | null
}

export interface IocPrintRow {
  itemId: string
  itemLabel: string
  sectionLabel: string
  groupIntro: string
  prompt: string
  choices: string[]
  standardId: string | null
  /** Which box carries the ✓ on this copy. null leaves all three empty. */
  tick: IocScore | null
  comment: string
}

export function buildIocPrintRows(
  items: readonly IocPrintItemInput[],
  ratings: readonly { item_id: string; score: IocScore; comment: string }[],
): IocPrintRow[] {
  const byItem = new Map(ratings.map(rating => [rating.item_id, rating]))
  return items.map(item => {
    const rating = byItem.get(item.id)
    return {
      itemId: item.id,
      itemLabel: item.item_label,
      sectionLabel: item.section_label,
      groupIntro: item.group_intro,
      prompt: item.prompt,
      choices: item.choices,
      standardId: item.standard_id,
      tick: rating?.score ?? null,
      comment: rating?.comment ?? '',
    }
  })
}

export interface IocStandardRun<Row> {
  standardId: string | null
  rows: Row[]
}

/**
 * Consecutive rows that share an indicator, so the printed table can merge
 * that cell the way the source document does. Runs are computed per page: a
 * merged cell cannot span a page break, and re-printing the indicator at the
 * top of the next page is what a reader needs anyway.
 */
export function groupRowsByStandard<Row extends { standardId: string | null }>(
  rows: readonly Row[],
): IocStandardRun<Row>[] {
  const runs: IocStandardRun<Row>[] = []
  for (const row of rows) {
    const last = runs[runs.length - 1]
    if (last && last.standardId === row.standardId) last.rows.push(row)
    else runs.push({ standardId: row.standardId, rows: [row] })
  }
  return runs
}

export interface IocSignatureBlock {
  /** Printed in parentheses under the line, as the source document does. */
  name: string
  role: string
  /** A signed URL for the image, or null to leave the dotted line empty. */
  imageUrl: string | null
  /**
   * Where the image lives in the private bucket, for renderers that need the
   * bytes rather than a URL: a .docx file carries its own images, so a signed
   * URL would be a link to something the reader cannot open.
   */
  signaturePath: string | null
  /** Typed signatures print the name above the line in a script face. */
  typedName: string | null
  signedAt: string | null
}

export interface DocHeader {
  titleLines: string[]
  subtitle: string | null
}

export interface SummaryPrintRow {
  itemLabel: string
  standardLabel: string
  agree: number
  unsure: number
  disagree: number
  index: string
  belowThreshold: boolean
}

/**
 * One document's worth of content, before anything decides how to draw it.
 *
 * Both renderers read this: the A4 page that the browser prints, and the .docx
 * file that Word opens. Keeping the shape here is what stops the two from
 * drifting — a number that appears in one and not the other would be a number
 * somebody has to reconcile by hand, which is the whole problem this feature
 * exists to remove.
 */
export type PrintSection =
  | {
      kind: 'evaluation'
      key: string
      header: DocHeader
      instruction: string
      rows: IocPrintRow[]
      standardLabels: Record<string, string>
      showComments: boolean
      signatures: IocSignatureBlock[]
    }
  | {
      kind: 'summary'
      key: string
      header: DocHeader
      facts: string[]
      percentLine: string
      paragraph: string
      rows: SummaryPrintRow[]
      footnotes: string[]
      signatures: IocSignatureBlock[]
    }

export interface IocPrintHeaderLines {
  title: string[]
  subtitle: string | null
}

/** Which documents a form can produce right now, and why not otherwise. */
export function iocPrintDocAvailability(input: {
  hasItems: boolean
  submittedExpertCount: number
}): Record<IocPrintDoc, { available: boolean; reason?: string }> {
  const blank = input.hasItems
    ? { available: true }
    : { available: false, reason: 'ยังไม่ได้เลือกข้อสอบเข้าฟอร์ม' }

  return {
    blank,
    expert: input.submittedExpertCount > 0
      ? { available: true }
      : { available: false, reason: 'ยังไม่มีผู้ทรงคุณวุฒิส่งผลประเมิน' },
    summary: input.submittedExpertCount > 0
      ? { available: true }
      : { available: false, reason: 'ยังไม่มีผลประเมินให้สรุป' },
    book: input.submittedExpertCount > 0 && input.hasItems
      ? { available: true }
      : { available: false, reason: 'ต้องมีข้อสอบและผลประเมินอย่างน้อยหนึ่งท่าน' },
  }
}
