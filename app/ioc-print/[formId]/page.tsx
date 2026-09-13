import { Sarabun } from 'next/font/google'
import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatIocIndex, formatIocPercent, summarizeIocForm, type IocScore } from '@/lib/ioc'
import { buildIocDocumentTitle, formatStandardLabel } from '@/lib/ioc-form'
import { buildIocSummaryParagraph } from '@/lib/ioc-summary'
import { buildIocPrintRows, parseIocPrintOptions, type IocSignatureBlock } from '@/lib/ioc-print'
import type { IocForm, IocFormExpert, IocFormItem, IocFormStandard } from '@/lib/types'
import {
  IocPrintDocument,
  type PrintSection,
  type SummaryPrintRow,
} from './_components/ioc-print-document'

// The document font. Loaded on this route only: every other page of the app
// reads better in IBM Plex Sans Thai, and Sarabun is what Thai official
// paperwork is set in.
const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['400', '700'],
  variable: '--font-sarabun',
  display: 'swap',
})

export const dynamic = 'force-dynamic'
export const metadata = { title: 'เอกสาร IOC — KorKru' }

interface Props {
  params: Promise<{ formId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** Long enough to render and print, short enough not to become a shareable link. */
const SIGNATURE_URL_TTL_SECONDS = 900

export default async function IocPrintPage({ params, searchParams }: Props) {
  const authUser = await getAuthUser()
  if (!authUser) redirect('/login')

  const { formId } = await params
  const options = parseIocPrintOptions(await searchParams)
  const supabase = await createClient()

  const { data: formRow } = await supabase
    .from('ioc_forms')
    .select('id, org_id, exam_title, subject_name, subject_code, grade_level, term_label, academic_year, school_name, author_name, author_position, instruction_text, threshold, percent_rule, summary_text, author_signature_mode, author_signature_path')
    .eq('id', formId)
    .maybeSingle()

  if (!formRow) notFound()
  const form = formRow as Pick<
    IocForm,
    'id' | 'org_id' | 'exam_title' | 'subject_name' | 'subject_code' | 'grade_level' | 'term_label'
    | 'academic_year' | 'school_name' | 'author_name' | 'author_position' | 'instruction_text'
    | 'threshold' | 'percent_rule' | 'summary_text' | 'author_signature_mode' | 'author_signature_path'
  >

  const [{ data: itemRows }, { data: standardRows }, { data: expertRows }, { data: ratingRows }] = await Promise.all([
    supabase
      .from('ioc_form_items')
      .select('id, order_index, item_label, section_label, group_intro, prompt, choices, standard_id')
      .eq('form_id', formId)
      .order('order_index'),
    supabase.from('ioc_form_standards').select('id, code, description').eq('form_id', formId).order('order_index'),
    supabase
      .from('ioc_form_experts')
      .select('id, expert_order, display_name, position_title, status, submitted_at, overall_comment, signature_mode, signature_path')
      .eq('form_id', formId)
      .order('expert_order'),
    supabase.from('ioc_ratings').select('expert_id, item_id, score, comment').eq('form_id', formId),
  ])

  const items = (itemRows ?? []) as Pick<
    IocFormItem,
    'id' | 'order_index' | 'item_label' | 'section_label' | 'group_intro' | 'prompt' | 'choices' | 'standard_id'
  >[]
  const standards = (standardRows ?? []) as Pick<IocFormStandard, 'id' | 'code' | 'description'>[]
  const experts = (expertRows ?? []) as (Pick<
    IocFormExpert,
    'id' | 'expert_order' | 'display_name' | 'position_title' | 'status' | 'submitted_at' | 'overall_comment' | 'signature_mode' | 'signature_path'
  >)[]
  const ratings = (ratingRows ?? []) as { expert_id: string; item_id: string; score: IocScore; comment: string }[]

  if (items.length === 0) notFound()

  const standardLabels: Record<string, string> = {}
  for (const standard of standards) {
    standardLabels[standard.id] = formatStandardLabel(standard, { withDescription: true })
  }

  const submitted = experts.filter(expert => expert.status === 'submitted')
  const titleLines = buildIocDocumentTitle(form)

  // Signed URLs are minted only for the signatures this document will show, so
  // a printout with signatures turned off never reaches for the files at all.
  const signatureUrls = new Map<string, string>()
  const wantedPaths = [
    options.authorSignature ? form.author_signature_path : null,
    ...(options.expertSignature ? submitted.map(expert => expert.signature_path) : []),
  ].filter((path): path is string => Boolean(path))

  if (wantedPaths.length > 0) {
    const admin = createAdminClient()
    for (const path of wantedPaths) {
      const { data } = await admin.storage
        .from('ioc-signatures')
        .createSignedUrl(path, SIGNATURE_URL_TTL_SECONDS)
      if (data?.signedUrl) signatureUrls.set(path, data.signedUrl)
    }
  }

  function authorBlock(): IocSignatureBlock {
    const path = options.authorSignature ? form.author_signature_path : null
    return {
      name: form.author_name,
      role: form.author_position ? `ผู้ออกข้อสอบ · ${form.author_position}` : 'ผู้ออกข้อสอบ',
      imageUrl: path ? signatureUrls.get(path) ?? null : null,
      typedName:
        options.authorSignature && form.author_signature_mode === 'typed' ? form.author_name : null,
      signedAt: null,
    }
  }

  function expertBlock(expert: typeof experts[number], withSignature: boolean): IocSignatureBlock {
    const path = withSignature ? expert.signature_path : null
    return {
      name: expert.display_name,
      role: `ผู้ประเมินคนที่ ${expert.expert_order}`,
      imageUrl: path ? signatureUrls.get(path) ?? null : null,
      typedName: withSignature && expert.signature_mode === 'typed' ? expert.display_name : null,
      signedAt:
        withSignature && expert.signature_mode !== 'none' && expert.submitted_at
          ? new Date(expert.submitted_at).toLocaleDateString('th-TH', { dateStyle: 'long' })
          : null,
    }
  }

  const header = { titleLines, subtitle: null as string | null }

  function evaluationSection(expert: typeof experts[number] | null): PrintSection {
    const expertRatings = expert
      ? ratings.filter(rating => rating.expert_id === expert.id)
      : []
    return {
      kind: 'evaluation',
      key: expert ? `expert-${expert.id}` : 'blank',
      header: {
        titleLines,
        subtitle: expert ? `ผู้ประเมินคนที่ ${expert.expert_order} ${expert.display_name}` : null,
      },
      instruction: form.instruction_text,
      rows: buildIocPrintRows(items, expertRatings),
      standardLabels,
      showComments: options.showComments,
      signatures: expert
        ? [authorBlock(), expertBlock(expert, options.expertSignature)]
        : [authorBlock(), ...experts.map(candidate => expertBlock(candidate, false))],
    }
  }

  const summary = summarizeIocForm({
    itemIds: items.map(item => item.id),
    submittedExpertIds: submitted.map(expert => expert.id),
    ratings: ratings.map(rating => ({
      expertId: rating.expert_id,
      itemId: rating.item_id,
      score: rating.score,
    })),
    threshold: Number(form.threshold),
    percentRule: form.percent_rule,
  })

  const summaryByItem = new Map(summary.items.map(entry => [entry.itemId, entry]))
  const summaryRows: SummaryPrintRow[] = items.map(item => {
    const computed = summaryByItem.get(item.id)
    return {
      itemLabel: item.item_label,
      standardLabel: item.standard_id ? standardLabels[item.standard_id] ?? '' : '',
      agree: computed?.agree ?? 0,
      unsure: computed?.unsure ?? 0,
      disagree: computed?.disagree ?? 0,
      index: formatIocIndex(computed?.index ?? null),
      belowThreshold: computed?.passed === false,
    }
  })

  const failedLabels = summaryRows.filter(row => row.belowThreshold).map(row => row.itemLabel)

  function summarySection(): PrintSection {
    const facts = [
      [
        form.subject_name ? `รายวิชา ${form.subject_name}` : '',
        form.subject_code ? `รหัสวิชา ${form.subject_code}` : '',
        form.grade_level ? `ชั้น${form.grade_level}` : '',
      ].filter(Boolean).join(' '),
      `ผู้ออกข้อสอบ ${form.author_name}`,
      submitted.length > 0
        ? `ผู้ประเมิน ${submitted.length} ท่าน: ${submitted.map(expert => expert.display_name).join(' · ')}`
        : '',
    ].filter(Boolean)

    const footnotes = [
      failedLabels.length > 0
        ? `* ข้อที่มีค่าดัชนีความสอดคล้องต่ำกว่าเกณฑ์ ${formatIocIndex(Number(form.threshold))} ควรปรับปรุงตามข้อเสนอแนะหรือตัดออกก่อนนำไปใช้`
        : '',
      `N = ${summary.expertCount} · คิดร้อยละจาก${form.percent_rule === 'items_passing' ? 'จำนวนข้อที่ผ่านเกณฑ์' : 'ค่าเฉลี่ยดัชนีทุกข้อ'}`,
    ].filter(Boolean)

    return {
      kind: 'summary',
      key: 'summary',
      header: {
        titleLines: [
          'ตารางแสดงผลการประเมินความสอดคล้องของมาตรฐานตัวชี้วัด / ผลการเรียนรู้',
          `กับ${form.exam_title}${form.academic_year ? ` ปีการศึกษา ${form.academic_year}` : ''}`,
          form.school_name,
        ].filter(Boolean),
        subtitle: null,
      },
      facts,
      percentLine: `ร้อยละความสอดคล้อง ${formatIocPercent(summary.percent)}`,
      paragraph:
        form.summary_text
        ?? buildIocSummaryParagraph({
          header: { exam_title: form.exam_title, subject_name: form.subject_name, grade_level: form.grade_level },
          summary,
          failedLabels,
        }),
      rows: summaryRows,
      footnotes,
      signatures: [],
    }
  }

  const sections: PrintSection[] = []
  if (options.doc === 'blank') {
    sections.push(evaluationSection(null))
  } else if (options.doc === 'expert') {
    const expert = submitted.find(candidate => candidate.id === options.expertId) ?? submitted[0]
    if (!expert) notFound()
    sections.push(evaluationSection(expert))
  } else if (options.doc === 'summary') {
    sections.push(summarySection())
  } else {
    sections.push(evaluationSection(null))
    for (const expert of submitted) sections.push(evaluationSection(expert))
    sections.push(summarySection())
  }

  const criteriaNote = options.showCriteria
    ? `เกณฑ์: ค่า IOC ตั้งแต่ ${formatIocIndex(Number(form.threshold))} ขึ้นไป ถือว่าสอดคล้อง`
    : null

  // Deliberately outside the app shell: the shell clamps its height and hides
  // overflow so the app can scroll its own pane, and printing inside it would
  // clip the document to one screen and carry the sidebar onto the paper.
  return (
    <main className={sarabun.variable}>
      <IocPrintDocument
        sections={sections}
        criteriaNote={criteriaNote}
        watermarkText={options.watermark ? 'สำเนาเพื่อประเมินความสอดคล้อง' : null}
        backHref={`/research/ioc/${formId}`}
      />
    </main>
  )
}
