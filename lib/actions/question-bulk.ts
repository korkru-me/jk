'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { releaseQuestionFiles } from '@/lib/storage-release'
import type { Question } from '@/lib/types'

const selection = z.array(z.uuid()).min(1).max(100)

/** One bounded batch. The client retains selections whose deletion failed. */
export async function deleteSelectedQuestions(ids: string[]) {
  const parsed = selection.safeParse(ids)
  if (!parsed.success) return { error: 'กรุณาเลือกโจทย์ที่ถูกต้อง ครั้งละไม่เกิน 100 ข้อ' }
  const uniqueIds = [...new Set(parsed.data)]
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { data, error } = await supabase.from('questions').select('*')
    .in('id', uniqueIds).eq('created_by', user.id).eq('is_research_snapshot', false)
  if (error) return { error: 'อ่านโจทย์ที่เลือกไม่สำเร็จ กรุณาลองใหม่' }
  const selected = (data ?? []) as Question[]
  if (selected.length !== uniqueIds.length) return { error: 'มีโจทย์ที่ถูกลบแล้วหรือคุณไม่มีสิทธิ์ลบ กรุณาโหลดหน้าใหม่' }
  if (selected.some(q => q.group_id && q.order_in_group !== 0)) {
    return { error: 'กรุณาเลือกโจทย์หลักเพื่อลบโจทย์หลายขั้นตอนทั้งกลุ่ม' }
  }

  // A selected group parent represents the entire question, including children.
  const groupIds = [...new Set(selected.flatMap(q => q.group_id ? [q.group_id] : []))]
  let doomed = selected
  if (groupIds.length > 0) {
    const grouped = await fetchAllRows<Question>((from, to) => supabase.from('questions').select('*')
      .in('group_id', groupIds).eq('created_by', user.id).eq('is_research_snapshot', false)
      .order('id').range(from, to))
    if (grouped.error) return { error: 'อ่านข้อย่อยไม่สำเร็จ ยังไม่ได้ลบโจทย์' }
    doomed = [...new Map([...selected, ...grouped.rows].map(q => [q.id, q])).values()]
  }

  // Match groups directly, avoiding an oversized URL for all their child IDs.
  const standaloneIds = selected.filter(q => !q.group_id).map(q => q.id)
  const clauses = [
    ...(standaloneIds.length ? [`id.in.(${standaloneIds.join(',')})`] : []),
    ...(groupIds.length ? [`group_id.in.(${groupIds.join(',')})`] : []),
  ]
  const removed = await supabase.from('questions').delete()
    .or(clauses.join(',')).eq('created_by', user.id).eq('is_research_snapshot', false).select('id')
  if (removed.error) return { error: 'ลบโจทย์ไม่สำเร็จ โจทย์อาจยังถูกใช้งานอยู่ กรุณาลองใหม่' }
  const deletedIds = new Set((removed.data ?? []).map(q => q.id as string))
  await releaseQuestionFiles(supabase, user.id, doomed.filter(q => deletedIds.has(q.id)))
  revalidatePath('/questions')
  revalidatePath('/questions/sets')
  revalidatePath('/dashboard')
  return { deletedIds: uniqueIds.filter(id => deletedIds.has(id)) }
}
