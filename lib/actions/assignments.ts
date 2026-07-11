'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyOrgId } from '@/lib/actions/org'
import type { AssignmentStatus } from '@/lib/types'

interface CreateAssignmentData {
  classroom_id: string
  title: string
  description: string
  question_ids: string[]
  start_at: string | null
  end_at: string | null
  duration_minutes: number | null
  mode: 'online' | 'print'
}

export async function createAssignment(data: CreateAssignmentData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  if (data.question_ids.length === 0) return { error: 'กรุณาเลือกโจทย์อย่างน้อย 1 ข้อ' }

  const orgId = await getMyOrgId()
  if (!orgId) return { error: 'ไม่พบข้อมูลสถาบัน กรุณาติดต่อผู้ดูแล' }

  const { data: assignment, error } = await supabase
    .from('assignments')
    .insert({
      org_id: orgId,
      classroom_id: data.classroom_id,
      created_by: user.id,
      title: data.title.trim(),
      description: data.description.trim() || null,
      question_ids: data.question_ids,
      start_at: data.start_at || null,
      end_at: data.end_at || null,
      duration_minutes: data.duration_minutes || null,
      mode: data.mode,
      status: 'draft',
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/assignments')
  redirect(`/assignments/${assignment.id}`)
}

export async function updateAssignmentStatus(id: string, status: AssignmentStatus) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('assignments')
    .update({ status })
    .eq('id', id)
    .eq('created_by', user.id)

  if (error) return { error: error.message }
  revalidatePath(`/assignments/${id}`)
  return { success: true }
}

export async function deleteAssignment(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('assignments')
    .delete()
    .eq('id', id)
    .eq('created_by', user.id)

  if (error) return { error: error.message }
  revalidatePath('/assignments')
  redirect('/assignments')
}

export async function getMyAssignments() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('assignments')
    .select('*, classrooms(name)')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })

  return data ?? []
}

export async function getStudentAssignments() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: memberships } = await supabase
    .from('classroom_students')
    .select('classroom_id')
    .eq('student_id', user.id)

  if (!memberships || memberships.length === 0) return []

  const classroomIds = memberships.map((m: { classroom_id: string }) => m.classroom_id)

  const { data } = await supabase
    .from('assignments')
    .select('*, classrooms(name), submissions(id, status, total_score, max_score)')
    .in('classroom_id', classroomIds)
    .eq('status', 'published')
    .order('created_at', { ascending: false })

  return data ?? []
}
