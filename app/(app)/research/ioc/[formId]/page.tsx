import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import type { IocForm, IocFormExpert, IocFormItem, IocFormStandard } from '@/lib/types'
import { IocFormEditor, type IocEditorSources } from '../_components/ioc-form-editor'

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
    .select('id, exam_title, subject_name, subject_code, grade_level, status, source_kind, measurement_id, assignment_id, author_signature_mode, threshold, items_frozen_at')
    .eq('id', formId)
    .maybeSingle()

  if (!formRow) notFound()
  const form = formRow as Pick<
    IocForm,
    'id' | 'exam_title' | 'subject_name' | 'subject_code' | 'grade_level' | 'status' | 'source_kind'
    | 'measurement_id' | 'assignment_id' | 'author_signature_mode' | 'threshold' | 'items_frozen_at'
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
      .select('id, expert_order, display_name, position_title, affiliation')
      .eq('form_id', formId)
      .order('expert_order'),
  ])

  const [measurementsResult, assignmentsResult, setsResult] = await Promise.all([
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
  ])

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
        items={(itemsResult.data ?? []) as Pick<
          IocFormItem,
          'id' | 'order_index' | 'item_label' | 'section_label' | 'group_intro' | 'prompt' | 'choices' | 'standard_id'
        >[]}
        standards={(standardsResult.data ?? []) as Pick<IocFormStandard, 'id' | 'order_index' | 'code' | 'description'>[]}
        experts={(expertsResult.data ?? []) as Pick<
          IocFormExpert,
          'id' | 'expert_order' | 'display_name' | 'position_title' | 'affiliation'
        >[]}
        sources={sources}
      />
    </div>
  )
}
