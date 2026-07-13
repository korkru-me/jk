'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { AssignmentExtension } from '@/lib/types'

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function grantExtension(assignmentId: string, studentId: string, extendedEndAt: string, note?: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('assignment_extensions')
    .upsert(
      {
        assignment_id: assignmentId,
        student_id: studentId,
        extended_end_at: extendedEndAt,
        note: note?.trim() || null,
        granted_by: user.id,
      },
      { onConflict: 'assignment_id,student_id' }
    )

  if (error) return { error: error.message }
  revalidatePath(`/assignments/${assignmentId}`)
  return { success: true }
}

export async function revokeExtension(assignmentId: string, studentId: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('assignment_extensions')
    .delete()
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)

  if (error) return { error: error.message }
  revalidatePath(`/assignments/${assignmentId}`)
  return { success: true }
}

export async function getAssignmentExtensions(assignmentId: string): Promise<AssignmentExtension[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('assignment_extensions')
    .select('*')
    .eq('assignment_id', assignmentId)

  return (data ?? []) as AssignmentExtension[]
}
