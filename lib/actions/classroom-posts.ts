'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getMyOrgId } from '@/lib/actions/org'
import type { ClassroomPost, PostComment } from '@/lib/types'
import {
  attachmentPaths, sanitizeAttachments, POST_FILE_PREFIX,
  type PostAttachment,
} from '@/lib/attachment-display'

/** The Storage host attachments must come from, checked on every write. */
const STORAGE_BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getClassroomPosts(classroomId: string): Promise<ClassroomPost[]> {
  const supabase = await createClient()
  // The author embed names its foreign key. Once `post_reads` existed —
  // pointing at both classroom_posts and users — PostgREST could reach `users`
  // two ways from here and refused to guess, which silently emptied every
  // classroom's announcement board ("more than one relationship was found").
  const { data } = await supabase
    .from('classroom_posts')
    .select('id, classroom_id, author_id, body, attachments, pinned, created_at, updated_at, edited_at, users!classroom_posts_author_id_fkey(full_name)')
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

  const withComments = posts.map(p => ({ ...p, comments: commentsByPost.get(p.id) ?? [] }))
  return fillMissingAuthorNames(withComments)
}

/**
 * Puts a name on posts and comments whose author the reader cannot look up.
 *
 * `users_select_org_members` lets someone read the profile of people in their
 * own organization. A student who joined by class code can be enrolled in a
 * classroom without sharing an org with the teacher, and then the embedded
 * `users(full_name)` comes back null and every announcement is signed
 * "ครูผู้สอน" — on a page whose own header already names that teacher.
 *
 * The names are filled in server-side instead. Nothing is disclosed that the
 * classroom does not already show: these are the people posting in a room the
 * reader is a member of, and only `full_name` is read.
 */
async function fillMissingAuthorNames(posts: ClassroomPost[]): Promise<ClassroomPost[]> {
  const missing = new Set<string>()
  for (const post of posts) {
    if (!post.users?.full_name) missing.add(post.author_id)
    for (const comment of post.comments) {
      if (!comment.users?.full_name) missing.add(comment.author_id)
    }
  }
  if (missing.size === 0) return posts

  const admin = createAdminClient()
  const { data } = await admin.from('users').select('id, full_name').in('id', Array.from(missing))
  const nameById = new Map((data ?? []).map((u: { id: string; full_name: string }) => [u.id, u.full_name]))
  if (nameById.size === 0) return posts

  const named = (id: string, current: { full_name: string } | null) =>
    current?.full_name ? current : (nameById.has(id) ? { full_name: nameById.get(id)! } : current)

  return posts.map(post => ({
    ...post,
    users: named(post.author_id, post.users),
    comments: post.comments.map(comment => ({
      ...comment,
      users: named(comment.author_id, comment.users),
    })),
  }))
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

export async function createClassroomPost(
  classroomId: string,
  body: string,
  attachments?: PostAttachment[],
  /** Extra classrooms to post the same announcement to, e.g. the other sections. */
  alsoClassroomIds?: string[],
) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const files = sanitizeAttachments(attachments, STORAGE_BASE_URL)
  // A file on its own is a real announcement — a timetable photo needs no
  // caption — so the body is only required when nothing is attached.
  if (!body.trim() && files.length === 0) return { error: 'กรุณากรอกข้อความประกาศ หรือแนบไฟล์' }

  // Cross-posting writes one row per classroom rather than one row shown in
  // several places: each room keeps its own comments, its own pin, and its own
  // "who has seen it", and a teacher can edit or delete the copy in one room
  // without touching the others.
  const targets = Array.from(new Set([classroomId, ...(alsoClassroomIds ?? [])])).filter(Boolean)

  // RLS (classroom_posts_owner_all) is the permission check: each insert only
  // succeeds for a classroom the caller owns/co-teaches, so a forged id in
  // `alsoClassroomIds` is rejected by the database rather than trusted here.
  const { data: inserted, error } = await supabase
    .from('classroom_posts')
    .insert(targets.map(target => ({
      classroom_id: target,
      author_id: user.id,
      body: body.trim(),
      attachments: files,
    })))
    .select('id, classroom_id')
  if (error) return { error: error.message }

  const created = inserted ?? []
  // Every target got a row, or the caller is told which ones did not — silently
  // posting to fewer rooms than were ticked is the one outcome worth naming.
  const missed = targets.length - created.length

  // Fan out a lightweight notification to every enrolled student, same
  // shape as notifyNonSubmitters() in lib/actions/notifications.ts.
  const orgId = await getMyOrgId()
  if (orgId && created.length > 0) {
    const admin = createAdminClient()
    const { data: roster } = await admin
      .from('classroom_students')
      .select('student_id, classroom_id')
      .in('classroom_id', created.map(row => row.classroom_id))
    const rows = (roster ?? []).map((r: any) => ({
      org_id: orgId,
      recipient_id: r.student_id as string,
      actor_id: user.id,
      type: 'classroom_post' as const,
      title: 'มีประกาศใหม่ในห้องเรียน',
      body: body.trim().slice(0, 120) || 'ครูแนบไฟล์ไว้ในประกาศ',
      link: `/classrooms/${r.classroom_id}`,
      related_classroom_id: r.classroom_id as string,
    }))
    if (rows.length > 0) await admin.from('notifications').insert(rows)
  }

  for (const target of targets) revalidatePath(`/classrooms/${target}`)
  return {
    success: true,
    id: created.find(row => row.classroom_id === classroomId)?.id,
    postedTo: created.length,
    missed,
  }
}

export async function updateClassroomPost(
  postId: string,
  classroomId: string,
  body: string,
  attachments?: PostAttachment[],
) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }
  const files = sanitizeAttachments(attachments, STORAGE_BASE_URL)
  if (!body.trim() && files.length === 0) return { error: 'กรุณากรอกข้อความประกาศ หรือแนบไฟล์' }

  const { error } = await supabase
    .from('classroom_posts')
    .update({ body: body.trim(), attachments: files, edited_at: new Date().toISOString() })
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

  // Read the attachments before the row goes: nothing else in the database
  // points at these files, and the storage sweep in ตั้งค่า does not cover
  // this bucket, so they would be unreachable bytes forever.
  const { data: existing } = await supabase
    .from('classroom_posts')
    .select('attachments')
    .eq('id', postId)
    .maybeSingle()

  const { error } = await supabase
    .from('classroom_posts')
    .delete()
    .eq('id', postId)
  if (error) return { error: error.message }

  // Best-effort, and deliberately after the delete: an announcement that is
  // gone from the class must not come back because a file would not budge.
  //
  // Cross-posting means one uploaded file can be the attachment of several
  // announcements — the copy in ม.4/1 and the copy in ฟิสิกส์ 2 point at the
  // same object. Deleting one copy must not pull the file out from under the
  // other, so each URL is checked for remaining references first. The check
  // runs as admin because the other copy may live in a classroom this caller
  // cannot read; it only ever counts rows and returns nothing about them.
  const remaining = (existing?.attachments as PostAttachment[] | null) ?? []
  if (remaining.length > 0) {
    const admin = createAdminClient()
    const orphaned: PostAttachment[] = []
    for (const attachment of remaining) {
      const { count } = await admin
        .from('classroom_posts')
        .select('id', { count: 'exact', head: true })
        .filter('attachments', 'cs', JSON.stringify([{ url: attachment.url }]))
      if (!count) orphaned.push(attachment)
    }
    const paths = attachmentPaths(orphaned)
    if (paths.length > 0) await admin.storage.from('classroom-post-files').remove(paths)
  }

  revalidatePath(`/classrooms/${classroomId}`)
  return { success: true }
}

/**
 * Records that these announcements were on the caller's screen.
 *
 * "Seen", not "read" — the app knows the post was rendered in front of
 * someone and nothing more, which is why the UI says เห็นแล้ว. First sighting
 * wins: `ignoreDuplicates` keeps the original timestamp instead of moving it
 * every time the page is opened again.
 *
 * Runs under the caller's own client, so RLS (`post_reads_own_insert`) is the
 * check — a student can only ever write their own row, and only for a post
 * they are allowed to see. No revalidatePath: this is a side channel, and
 * refreshing the page a student is reading would be a strange thing to do to
 * them.
 */
export async function markPostsSeen(postIds: string[]) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const ids = Array.from(new Set(postIds.filter(id => typeof id === 'string'))).slice(0, 100)
  if (ids.length === 0) return { success: true }

  const { error } = await supabase
    .from('post_reads')
    .upsert(ids.map(post_id => ({ post_id, user_id: user.id })), { ignoreDuplicates: true })
  if (error) return { error: error.message }
  return { success: true }
}

/**
 * Who has seen each announcement in a classroom, for the teaching side.
 *
 * Returns student ids per post rather than a count, so the panel can answer the
 * question a teacher actually has — *who* has not seen it — without a second
 * round-trip. Read with the caller's client: `post_reads_select` already limits
 * this to classrooms they teach.
 */
export async function getPostSeenByPost(postIds: string[]): Promise<Record<string, string[]>> {
  if (postIds.length === 0) return {}
  const supabase = await createClient()
  const { data } = await supabase
    .from('post_reads')
    .select('post_id, user_id')
    .in('post_id', postIds)

  const byPost: Record<string, string[]> = {}
  for (const row of (data ?? []) as { post_id: string; user_id: string }[]) {
    (byPost[row.post_id] ??= []).push(row.user_id)
  }
  return byPost
}
