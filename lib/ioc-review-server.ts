/**
 * Reading an IOC form on behalf of someone who is not a KorKru user.
 *
 * An expert holds a link and nothing else: no account, no session, no row in
 * `users`. Every read and write on their behalf therefore runs with the service
 * role — after this module has hashed their token and found exactly one live
 * invitation for it. There is no `anon` policy anywhere in the IOC schema, and
 * this is why there does not need to be one.
 *
 * Every failure returns the same answer. A visitor is never told whether a
 * token was wrong, expired, or revoked, because the three together are a
 * guessing oracle and separately they are worth nothing to them.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { hashIocToken, iocLinkUsability, looksLikeIocToken } from '@/lib/ioc-token'
import type { IocSignatureMode } from '@/lib/types'

export interface IocReviewExpert {
  id: string
  org_id: string
  form_id: string
  expert_order: number
  display_name: string
  position_title: string
  status: 'invited' | 'opened' | 'submitted'
  submitted_at: string | null
  overall_comment: string
  signature_mode: IocSignatureMode
  token_expires_at: string | null
}

export interface IocReviewForm {
  id: string
  org_id: string
  exam_title: string
  subject_name: string
  subject_code: string
  grade_level: string
  school_name: string
  instruction_text: string
  author_name: string
  show_solutions: boolean
  status: string
}

export interface IocReviewItem {
  id: string
  order_index: number
  item_label: string
  section_label: string
  group_intro: string
  prompt: string
  choices: string[]
  standard_id: string | null
  /** Present only when the teacher chose to show it. Absent, not hidden. */
  solution?: string | null
}

export interface IocReviewStandard {
  id: string
  code: string
  description: string
}

export interface IocReviewRating {
  item_id: string
  score: -1 | 0 | 1
  comment: string
}

export interface IocReviewContext {
  expert: IocReviewExpert
  form: IocReviewForm
  items: IocReviewItem[]
  standards: IocReviewStandard[]
  ratings: IocReviewRating[]
  alreadySubmitted: boolean
}

export type IocReviewLookup =
  | { ok: true; context: IocReviewContext }
  | { ok: false }

const ITEM_FIELDS = 'id, order_index, item_label, section_label, group_intro, prompt, choices, standard_id'

export async function loadIocReviewByToken(token: string): Promise<IocReviewLookup> {
  if (!looksLikeIocToken(token)) return { ok: false }

  const admin = createAdminClient()
  const { data: expertRow } = await admin
    .from('ioc_form_experts')
    .select('id, org_id, form_id, expert_order, display_name, position_title, status, submitted_at, overall_comment, signature_mode, token_hash, token_expires_at, revoked_at')
    .eq('token_hash', hashIocToken(token))
    .maybeSingle()

  if (!expertRow) return { ok: false }

  const usability = iocLinkUsability({
    token_hash: expertRow.token_hash as string | null,
    token_expires_at: expertRow.token_expires_at as string | null,
    revoked_at: expertRow.revoked_at as string | null,
    status: expertRow.status as IocReviewExpert['status'],
  })
  if (!usability.usable) return { ok: false }

  const { data: formRow } = await admin
    .from('ioc_forms')
    .select('id, org_id, exam_title, subject_name, subject_code, grade_level, school_name, instruction_text, author_name, show_solutions, status')
    .eq('id', expertRow.form_id as string)
    .maybeSingle()

  if (!formRow || formRow.status === 'closed') return { ok: false }

  const form = formRow as unknown as IocReviewForm

  // The answer key is left out of the query entirely when it is withheld, so
  // there is no copy of it in the payload for anyone to dig out of the page.
  const itemFields = form.show_solutions ? `${ITEM_FIELDS}, solution` : ITEM_FIELDS

  const [{ data: itemRows }, { data: standardRows }, { data: ratingRows }] = await Promise.all([
    admin.from('ioc_form_items').select(itemFields).eq('form_id', form.id).order('order_index'),
    admin.from('ioc_form_standards').select('id, code, description').eq('form_id', form.id).order('order_index'),
    admin.from('ioc_ratings').select('item_id, score, comment').eq('expert_id', expertRow.id as string),
  ])

  return {
    ok: true,
    context: {
      expert: {
        id: expertRow.id as string,
        org_id: expertRow.org_id as string,
        form_id: expertRow.form_id as string,
        expert_order: expertRow.expert_order as number,
        display_name: expertRow.display_name as string,
        position_title: (expertRow.position_title as string) ?? '',
        status: expertRow.status as IocReviewExpert['status'],
        submitted_at: expertRow.submitted_at as string | null,
        overall_comment: (expertRow.overall_comment as string) ?? '',
        signature_mode: expertRow.signature_mode as IocSignatureMode,
        token_expires_at: expertRow.token_expires_at as string | null,
      },
      form,
      items: (itemRows ?? []) as unknown as IocReviewItem[],
      standards: (standardRows ?? []) as unknown as IocReviewStandard[],
      ratings: (ratingRows ?? []) as unknown as IocReviewRating[],
      alreadySubmitted: usability.alreadySubmitted,
    },
  }
}

/**
 * Marks that the link was opened. The first open is kept separately from the
 * last, because "opened it once three weeks ago" and "read it this morning"
 * mean different things to a teacher deciding whether to nudge.
 */
export async function recordIocExpertOpen(expert: IocReviewExpert): Promise<void> {
  try {
    const admin = createAdminClient()
    const now = new Date().toISOString()
    const patch: Record<string, unknown> = { last_opened_at: now }
    // Submitting is a later state than opening; reading back a sent form must
    // not walk the status backwards.
    if (expert.status === 'invited') {
      patch.status = 'opened'
      patch.first_opened_at = now
    }

    await admin.from('ioc_form_experts').update(patch).eq('id', expert.id)
    await admin.rpc('record_ioc_form_event', {
      p_form_id: expert.form_id,
      p_event_type: 'expert_opened',
      p_actor_id: null,
      p_expert_id: expert.id,
      p_detail: {},
    })
  } catch (error) {
    console.error('[ioc] could not record expert open', error)
  }
}
