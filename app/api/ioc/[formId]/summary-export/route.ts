import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encodeRfc5987Filename } from '@/lib/exam-proctor-report'
import { formatIocIndex, summarizeIocForm, type IocScore } from '@/lib/ioc'
import { formatStandardLabel } from '@/lib/ioc-form'
import {
  buildIocSummaryWorkbook,
  IocExcelError,
  iocSummaryWorkbookFileName,
  type IocExcelRow,
} from '@/lib/ioc-excel'
import type { IocForm } from '@/lib/types'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(_request: Request, { params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params
  if (!UUID.test(formId)) return jsonError('ฟอร์มไม่ถูกต้อง', 400)

  const user = await getAuthUser()
  if (!user) return jsonError('กรุณาเข้าสู่ระบบก่อนดาวน์โหลด', 401)

  // RLS decides: a form this teacher may not manage simply does not come back.
  const supabase = await createClient()
  const { data: formRow } = await supabase
    .from('ioc_forms')
    .select('id, exam_title, subject_name, subject_code, grade_level, school_name, author_name, threshold, percent_rule')
    .eq('id', formId)
    .maybeSingle()

  if (!formRow) return jsonError('ไม่พบฟอร์มนี้ หรือคุณไม่มีสิทธิ์เข้าถึง', 404)
  const form = formRow as Pick<
    IocForm,
    'id' | 'exam_title' | 'subject_name' | 'subject_code' | 'grade_level' | 'school_name'
    | 'author_name' | 'threshold' | 'percent_rule'
  >

  const [{ data: itemRows }, { data: standardRows }, { data: expertRows }, { data: ratingRows }] = await Promise.all([
    supabase.from('ioc_form_items').select('id, item_label, standard_id').eq('form_id', formId).order('order_index'),
    supabase.from('ioc_form_standards').select('id, code, description').eq('form_id', formId),
    supabase
      .from('ioc_form_experts')
      .select('id, expert_order, display_name, status')
      .eq('form_id', formId)
      .order('expert_order'),
    supabase.from('ioc_ratings').select('expert_id, item_id, score, comment').eq('form_id', formId),
  ])

  const items = (itemRows ?? []) as { id: string; item_label: string; standard_id: string | null }[]
  const standards = (standardRows ?? []) as { id: string; code: string; description: string }[]
  const experts = (expertRows ?? []) as { id: string; expert_order: number; display_name: string; status: string }[]
  const ratings = (ratingRows ?? []) as { expert_id: string; item_id: string; score: IocScore; comment: string }[]

  const submitted = experts.filter(expert => expert.status === 'submitted')
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

  const standardById = new Map(standards.map(standard => [standard.id, standard]))
  const expertById = new Map(submitted.map(expert => [expert.id, expert]))
  const summaryByItem = new Map(summary.items.map(entry => [entry.itemId, entry]))

  const rows: IocExcelRow[] = items.map(item => {
    const computed = summaryByItem.get(item.id)
    const standard = item.standard_id ? standardById.get(item.standard_id) : undefined
    return {
      itemLabel: item.item_label,
      standardLabel: standard ? formatStandardLabel(standard, { withDescription: true }) : '',
      agree: computed?.agree ?? 0,
      unsure: computed?.unsure ?? 0,
      disagree: computed?.disagree ?? 0,
      index: computed?.index ?? null,
      passed: computed?.passed ?? null,
      comments: ratings
        .filter(rating =>
          rating.item_id === item.id
          && expertById.has(rating.expert_id)
          && (rating.comment ?? '').trim(),
        )
        .sort((left, right) =>
          (expertById.get(left.expert_id)?.expert_order ?? 0) - (expertById.get(right.expert_id)?.expert_order ?? 0))
        .map(rating => {
          const expert = expertById.get(rating.expert_id)
          return `ผู้ประเมินคนที่ ${expert?.expert_order ?? ''} (${expert?.display_name ?? ''}): ${rating.comment.trim()}`
        }),
    }
  })

  let workbook: Buffer
  try {
    workbook = await buildIocSummaryWorkbook({
      examTitle: form.exam_title,
      subjectLine: [
        form.subject_name ? `รายวิชา${form.subject_name}` : '',
        form.subject_code ? `รหัสวิชา ${form.subject_code}` : '',
        form.grade_level ? `ชั้น${form.grade_level}` : '',
      ].filter(Boolean).join(' '),
      schoolName: form.school_name,
      authorName: form.author_name,
      expertNames: submitted.map(expert => expert.display_name),
      threshold: Number(form.threshold),
      percentRuleLabel:
        form.percent_rule === 'items_passing' ? 'จำนวนข้อที่ผ่านเกณฑ์' : 'ค่าเฉลี่ยดัชนีทุกข้อ',
      percent: summary.percent,
      passedCount: summary.passedItemIds.length,
      itemCount: summary.itemCount,
      rows,
    })
  } catch (error) {
    if (error instanceof IocExcelError) return jsonError(error.message, 400)
    console.error('[ioc] summary workbook failed', error)
    return jsonError('สร้างไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 500)
  }

  // Same append-only trail as the printed documents, and with no student data
  // to protect it stays a record of who took a copy and when.
  try {
    const admin = createAdminClient()
    await admin.rpc('record_ioc_form_event', {
      p_form_id: formId,
      p_event_type: 'document_exported',
      p_actor_id: user.id,
      p_expert_id: null,
      p_detail: { format: 'xlsx', item_count: summary.itemCount, expert_count: summary.expertCount },
    })
  } catch (error) {
    console.error('[ioc] could not record export event', error)
  }

  const fileName = iocSummaryWorkbookFileName(form.exam_title)
  return new Response(new Uint8Array(workbook), {
    headers: {
      'Content-Disposition': `attachment; filename="KorKru-ioc-summary.xlsx"; filename*=UTF-8''${encodeRfc5987Filename(fileName)}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
