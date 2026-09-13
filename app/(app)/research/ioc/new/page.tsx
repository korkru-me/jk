import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import { emptyIocHeader, IOC_FORM_DEFAULTS, type IocHeaderInput } from '@/lib/ioc-form'
import type { IocForm } from '@/lib/types'
import { IocFormWizard, type IocFormWizardDraft } from '../_components/ioc-form-wizard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'สร้างฟอร์ม IOC — KorKru' }

interface Props {
  searchParams: Promise<{ form?: string }>
}

type ExistingFormRow = Pick<
  IocForm,
  | 'id'
  | 'exam_title'
  | 'subject_name'
  | 'subject_code'
  | 'grade_level'
  | 'term_label'
  | 'academic_year'
  | 'school_name'
  | 'author_name'
  | 'author_position'
  | 'instruction_text'
  | 'threshold'
  | 'percent_rule'
  | 'show_solutions'
  | 'status'
>

export default async function NewIocFormPage({ searchParams }: Props) {
  const authUser = await getAuthUser()
  if (!authUser) redirect('/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('users')
    .select('role, full_name')
    .eq('id', authUser.id)
    .maybeSingle()

  if (!profile) redirect('/dashboard')
  if (profile.role !== 'teacher' && profile.role !== 'admin') redirect('/dashboard')

  const { form: formId } = await searchParams

  // Editing an existing draft reads it back; a new form is prefilled from the
  // account so the teacher is not retyping their own name and school.
  let existing: ExistingFormRow | null = null
  if (formId) {
    const { data } = await supabase
      .from('ioc_forms')
      .select('id, exam_title, subject_name, subject_code, grade_level, term_label, academic_year, school_name, author_name, author_position, instruction_text, threshold, percent_rule, show_solutions, status')
      .eq('id', formId)
      .maybeSingle()
    existing = (data as ExistingFormRow | null) ?? null
  }

  const { data: orgId } = await supabase.rpc('get_user_org_id')
  const { data: org } = orgId
    ? await supabase.from('organizations').select('name').eq('id', orgId as string).maybeSingle()
    : { data: null }

  const header: IocHeaderInput = existing
    ? {
        exam_title: existing.exam_title,
        subject_name: existing.subject_name,
        subject_code: existing.subject_code,
        grade_level: existing.grade_level,
        term_label: existing.term_label,
        academic_year: existing.academic_year,
        school_name: existing.school_name,
        author_name: existing.author_name,
        author_position: existing.author_position,
      }
    : {
        ...emptyIocHeader(),
        school_name: (org?.name as string | undefined) ?? '',
        author_name: (profile.full_name as string | undefined) ?? '',
      }

  const draft: IocFormWizardDraft = {
    form_id: existing?.id ?? null,
    header,
    instruction_text: existing?.instruction_text ?? '',
    threshold: existing ? Number(existing.threshold) : IOC_FORM_DEFAULTS.threshold,
    percent_rule: existing?.percent_rule ?? IOC_FORM_DEFAULTS.percent_rule,
    show_solutions: existing?.show_solutions ?? IOC_FORM_DEFAULTS.show_solutions,
  }

  return <IocFormWizard draft={draft} />
}
