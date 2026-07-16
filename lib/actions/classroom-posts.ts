'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getMyOrgId } from '@/lib/actions/org'
import type { ClassroomPost, PostComment } from '@/lib/types'

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getClassroomPosts(classroomId: string): Promise<ClassroomPost[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('classroom_posts')
    .select('id, classroom_id, author_id, body, pinned, created_at, updated_at, users(full_name)')
    .eq('classroom_id', classroomId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })

  const posts = (data ?? []) as unknown as Omit<ClassroomPost, 'comments'>[]
  if (posts.length === 0) return []

  const { data: commentRows } = await supabase
    .from('post_comments')
    .select('id, post_id, author_id, body, created_at, users(full_name)')
    .in('post_id', posts.map(p => p.id))
    .order('created_at', { ascending: true })

  const commentsByPost = new Map<string, PostComment[]>()
  for (const c of (commentRows ?? []) as unknown as PostComment[]) {
    const list = commentsByPost.get(c.post_id) ?? []
    list.push(c)
    commentsByPost.set(c.post_id, list)
  }

  return posts.map(p => ({ ...p, comments: commentsByPost.get(p.id) ?? [] }))
}

export async function getPostComments(postId: string): Promise<PostComment[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('post_comments')
    .select('id, post_id, author_id, body, created_at, users(full_name)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })

  return (data ?? []) as unknown as PostComment[]
}

export async function addComment(postId: string, classroomId: string, body: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!body.trim()) return { error: 'กรุณากรอกข้อความความเห็น' }

  // RLS (post_comments_insert) is the permission check: succeeds only if the
  // caller can see the parent post (teacher, co-teacher, or enrolled student).
  const { error } = await supabase
    .from('post_comments')
    .insert({ post_id: postId, author_id: user.id, body: body.trim() })
  if (error) return { error: error.message }

  revalidatePath(`/classrooms/${classroomId}`)
  return { success: true }
}

export async function createClassroomPost(classroomId: string, body: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!body.trim()) return { error: 'กรุณากรอกข้อความประกาศ' }

  // RLS (classroom_posts_owner_all) is the permission check: this insert
  // only succeeds if the caller owns/co-teaches this classroom.
  const { data: post, error } = await supabase
    .from('classroom_posts')
    .insert({ classroom_id: classroomId, author_id: user.id, body: body.trim() })
    .select('id')
    .single()
  if (error) return { error: error.message }

  // Fan out a lightweight notification to every enrolled student, same
  // shape as notifyNonSubmitters() in lib/actions/notifications.ts.
  const orgId = await getMyOrgId()
  if (orgId) {
    const admin = createAdminClient()
    const { data: roster } = await admin
      .from('classroom_students')
      .select('student_id')
      .eq('classroom_id', classroomId)
    const rosterIds = (roster ?? []).map((r: any) => r.student_id)
    if (rosterIds.length > 0) {
      await admin.from('notifications').insert(
        rosterIds.map((recipient_id: string) => ({
          org_id: orgId,
          recipient_id,
          actor_id: user.id,
          type: 'classroom_post' as const,
          title: 'มีประกาศใหม่ในห้องเรียน',
          body: body.trim().slice(0, 120),
          link: `/classrooms/${classroomId}`,
          related_classroom_id: classroomId,
        }))
      )
    }
  }

  revalidatePath(`/classrooms/${classroomId}`)
  return { success: true, id: post.id }
}

export async function updateClassroomPost(postId: string, classroomId: string, body: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  if (!body.trim()) return { error: 'กรุณากรอกข้อความประกาศ' }

  const { error } = await supabase
    .from('classroom_posts')
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq('id', postId)
  if (error) return { error: error.message }

  revalidatePath(`/classrooms/${classroomId}`)
  return { success: true }
}

export async function togglePinClassroomPost(postId: string, classroomId: string, pinned: boolean) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('classroom_posts')
    .update({ pinned })
    .eq('id', postId)
  if (error) return { error: error.message }

  revalidatePath(`/classrooms/${classroomId}`)
  return { success: true }
}

export async function deleteClassroomPost(postId: string, classroomId: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const { error } = await supabase
    .from('classroom_posts')
    .delete()
    .eq('id', postId)
  if (error) return { error: error.message }

  revalidatePath(`/classrooms/${classroomId}`)
  return { success: true }
}
