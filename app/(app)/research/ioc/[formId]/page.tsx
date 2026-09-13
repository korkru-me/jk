import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import type { IocForm, IocFormExpert, IocFormItem, IocFormStandard } from '@/lib/types'
import { IocFormEditor, type IocEditorSources } from '../_components/ioc-form-editor'
import { IocFormFollowUp } from '../_components/ioc-form-followup'
import type { DashboardExpert } from '../_components/ioc-form-dashboard'
import type { SummaryRow } from '../_components/ioc-summary-panel'
import { summarizeIocForm, type IocScore } from '@/lib/ioc'
import { buildIocSummaryParagraph, isIocSummaryTextStale } from '@/lib/ioc-summary'
import { formatStandardLabel } from '@/lib/ioc-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ฟอร์ม IOC — KorKru' }

interface Props {
  params: Promise<{ formId: string }>
}

/** Enough of each option to choose between them; the exam itself is read on save. */
const SOURCE_LIMIT = 50

export default async function IocFormPage({ params }: Props) {
  const authUser = await getAuthUser()
  if (!authUser) redirect('/login')

  const { formId } = await params
  const supabase = await createClient()

  const { data: profile } = await supabase.from('users').select('role').eq('id', authUser.id).maybeSingle()
  if (!profile) redirect('/dashboard')
  if (profile.role !== 'teacher' && profile.role !== 'admin') redirect('/dashboard')

  const { data: formRow } = await supabase
    .from('ioc_forms')
    .select('id, exam_title, subject_name, subject_code, grade_level, status, source_kind, measurement_id, assignment_id, author_name, author_signature_mode, threshold, percent_rule, summary_text, summary_text_updated_at, items_frozen_at')
    .eq('id', formId)
    .maybeSingle()

  if (!formRow) notFound()
  const form = formRow as Pick<
    IocForm,
    'id' | 'exam_title' | 'subject_name' | 'subject_code' | 'grade_level' | 'status' | 'source_kind'
    | 'measurement_id' | 'assignment_id' | 'author_name' | 'author_signature_mode' | 'threshold'
    | 'percent_rule' | 'summary_text' | 'summary_text_updated_at' | 'items_frozen_at'
  >

  const [itemsResult, standardsResult, expertsResult] = await Promise.all([
    supabase
      .from('ioc_form_items')
      .select('id, order_index, item_label, section_label, group_intro, prompt, choices, standard_id')
      .eq('form_id', formId)
      .order('order_index'),
    supabase
      .from('ioc_form_standards')
      .select('id, order_index, code, description')
      .eq('form_id', formId)
      .order('order_index'),
    supabase
      .from('ioc_form_experts')
      .select('id, expert_order, display_name, position_title, affiliation, status, first_opened_at, last_opened_at, submitted_at, token_expires_at, revoked_at, signature_mode')
      .eq('form_id', formId)
      .order('expert_order'),
  ])

  const isDraft = form.status === 'draft'
  // Only a form that has gone out needs progress per expert.
  const { data: ratingRows } = isDraft
    ? { data: null }
    : await supabase
        .from('ioc_ratings')
        .select('expert_id, item_id, score, comment, updated_at')
        .eq('form_id', formId)

  const ratedByExpert = new Map<string, number>()
  for (const row of ratingRows ?? []) {
    const expertId = row.expert_id as string
    ratedByExpert.set(expertId, (ratedByExpert.get(expertId) ?? 0) + 1)
  }

  const dashboardExperts: DashboardExpert[] = (expertsResult.data ?? []).map(row => ({
    id: row.id as string,
    expert_order: row.expert_order as number,
    display_name: row.display_name as string,
    position_title: (row.position_title as string) ?? '',
    status: row.status as DashboardExpert['status'],
    first_opened_at: row.first_opened_at as string | null,
    last_opened_at: row.last_opened_at as string | null,
    submitted_at: row.submitted_at as string | null,
    token_expires_at: row.token_expires_at as string | null,
    revoked_at: row.revoked_at as string | null,
    rated_count: ratedByExpert.get(row.id as string) ?? 0,
  }))

  const [measurementsResult, assignmentsResult, setsResult] = isDraft ? await Promise.all([
    supabase
      .from('education_research_measurements')
      .select('id, measurement_type, snapshot_question_ids, education_research_projects(title)')
      .order('created_at', { ascending: false })
      .limit(SOURCE_LIMIT),
    supabase
      .from('assignments')
      .select('id, title, question_ids, created_at')
      .order('created_at', { ascending: false })
      .limit(SOURCE_LIMIT),
    supabase
      .from('question_sets')
      .select('id, title, question_ids, created_at')
      .order('created_at', { ascending: false })
      .limit(SOURCE_LIMIT),
  ]) : [{ data: null }, { data: null }, { data: null }]

  const sources: IocEditorSources = {
    measurements: (measurementsResult.data ?? [])
      .map(row => {
        const project = row.education_research_projects as unknown as
          { title: string } | { title: string }[] | null
        const projectTitle = Array.isArray(project) ? project[0]?.title : project?.title
        return {
          id: row.id as string,
          label: `${projectTitle ?? 'โครงการวิจัย'} · ${row.measurement_type === 'pretest' ? 'ก่อนเรียน' : 'หลังเรียน'}`,
          question_count: ((row.snapshot_question_ids as string[] | null) ?? []).length,
        }
      })
      .filter(option => option.question_count > 0),
    assignments: (assignmentsResult.data ?? [])
      .map(row => ({
        id: row.id as string,
        label: (row.title as string) ?? 'งานที่มอบหมาย',
        question_count: ((row.question_ids as string[] | null) ?? []).length,
      }))
      .filter(option => option.question_count > 0),
    sets: (setsResult.data ?? [])
      .map(row => ({
        id: row.id as string,
        label: (row.title as string) ?? 'แฟ้มโจทย์',
        question_count: ((row.question_ids as string[] | null) ?? []).length,
        question_ids: ((row.question_ids as string[] | null) ?? []),
      }))
      .filter(option => option.question_count > 0),
  }

  const items = (itemsResult.data ?? []) as Pick<
    IocFormItem,
    'id' | 'order_index' | 'item_label' | 'section_label' | 'group_intro' | 'prompt' | 'choices' | 'standard_id'
  >[]
  const standards = (standardsResult.data ?? []) as Pick<IocFormStandard, 'id' | 'order_index' | 'code' | 'description'>[]

  const submittedExpertIds = dashboardExperts
    .filter(expert => expert.status === 'submitted')
    .map(expert => expert.id)

  const summary = summarizeIocForm({
    itemIds: items.map(item => item.id),
    submittedExpertIds,
    ratings: (ratingRows ?? []).map(row => ({
      expertId: row.expert_id as string,
      itemId: row.item_id as string,
      score: row.score as IocScore,
    })),
    threshold: Number(form.threshold),
    percentRule: form.percent_rule,
  })

  const standardById = new Map(standards.map(standard => [standard.id, standard]))
  const expertById = new Map(dashboardExperts.map(expert => [expert.id, expert]))
  const summaryByItem = new Map(summary.items.map(item => [item.itemId, item]))

  const summaryRows: SummaryRow[] = items.map(item => {
    const computed = summaryByItem.get(item.id)
    const standard = item.standard_id ? standardById.get(item.standard_id) : undefined
    return {
      item_id: item.id,
      item_label: item.item_label,
      standard_label: standard ? formatStandardLabel(standard) : '',
      agree: computed?.agree ?? 0,
      unsure: computed?.unsure ?? 0,
      disagree: computed?.disagree ?? 0,
      rated_by: computed?.ratedBy ?? 0,
      index: computed?.index ?? null,
      passed: computed?.passed ?? null,
      // Only what was actually sent carries a suggestion worth printing; a
      // comment still sitting in someone's draft is their private working.
      comments: (ratingRows ?? [])
        .filter(row =>
          row.item_id === item.id
          && submittedExpertIds.includes(row.expert_id as string)
          && ((row.comment as string) ?? '').trim(),
        )
        .map(row => {
          const expert = expertById.get(row.expert_id as string)
          return {
            expert_order: expert?.expert_order ?? 0,
            display_name: expert?.display_name ?? '',
            comment: ((row.comment as string) ?? '').trim(),
          }
        })
        .sort((left, right) => left.expert_order - right.expert_order),
    }
  })

  const failedLabels = summaryRows.filter(row => row.passed === false).map(row => row.item_label)
  const generatedParagraph = buildIocSummaryParagraph({
    header: { exam_title: form.exam_title, subject_name: form.subject_name, grade_level: form.grade_level },
    summary,
    failedLabels,
  })

  const latestRatingAt = (ratingRows ?? []).reduce<string | null>((latest, row) => {
    const value = row.updated_at as string | null
    if (!value) return latest
    return !latest || value > latest ? value : latest
  }, null)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">วิจัยการศึกษา › ฟอร์ม IOC</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">{form.exam_title}</h1>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {form.subject_name ? <span>{form.subject_name}</span> : null}
            {form.subject_code ? <span>รหัสวิชา {form.subject_code}</span> : null}
            {form.grade_level ? <span>ชั้น{form.grade_level}</span> : null}
          </p>
        </div>
        <Button variant="outline" render={<Link href="/research/ioc" />}>กลับรายการฟอร์ม</Button>
      </div>

      {form.items_frozen_at ? (
        <Card padding="md" className="border-warning/30 bg-warning/5">
          <p className="text-sm text-foreground">
            ฟอร์มนี้ตรึงข้อสอบไว้แล้วเมื่อส่งลิงก์ให้ผู้ทรงคุณวุฒิ จึงแก้ข้อสอบและตัวชี้วัดไม่ได้
          </p>
        </Card>
      ) : null}

      {isDraft ? (
        <IocFormEditor
          form={{
            id: form.id,
            status: form.status,
            source_kind: form.source_kind,
            measurement_id: form.measurement_id,
            assignment_id: form.assignment_id,
            author_signature_mode: form.author_signature_mode,
            frozen: Boolean(form.items_frozen_at),
          }}
          items={items}
          standards={standards}
          experts={(expertsResult.data ?? []) as Pick<
            IocFormExpert,
            'id' | 'expert_order' | 'display_name' | 'position_title' | 'affiliation'
          >[]}
          sources={sources}
        />
      ) : (
        <IocFormFollowUp
          formId={form.id}
          examTitle={form.exam_title}
          authorName={form.author_name}
          itemCount={items.length}
          experts={dashboardExperts}
          summary={summary}
          rows={summaryRows}
          percentRuleLabel={
            form.percent_rule === 'items_passing' ? 'จำนวนข้อที่ผ่านเกณฑ์' : 'ค่าเฉลี่ยดัชนีทุกข้อ'
          }
          exportExperts={(expertsResult.data ?? []).map(row => ({
            id: row.id as string,
            expert_order: row.expert_order as number,
            display_name: row.display_name as string,
            submitted: row.status === 'submitted',
            signed: row.signature_mode !== 'none' && row.status === 'submitted',
          }))}
          authorSignatureAvailable={form.author_signature_mode !== 'none'}
          generatedParagraph={generatedParagraph}
          savedParagraph={form.summary_text}
          paragraphStale={isIocSummaryTextStale(form.summary_text_updated_at, latestRatingAt)}
        />
      )}
    </div>
  )
}
