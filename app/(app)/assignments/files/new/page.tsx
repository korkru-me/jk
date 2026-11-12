import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { readFileAssignmentEditor } from '@/lib/actions/file-assignments'
import { FileAssignmentForm } from '@/components/assignments/file-assignment-form'
import { AssignmentClassroomSidebar } from '../../new/_components/assignment-classroom-sidebar'
import { ClearPendingSidebar } from '@/components/layout/sidebar-context'
import type { Classroom } from '@/lib/types'

export const metadata = { title: 'มอบหมายงานส่งไฟล์ — KorKru' }

export default async function NewFileAssignmentPage({ searchParams }: { searchParams: Promise<{ classroom?: string; copy?: string }> }) {
  const { classroom, copy } = await searchParams
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const [profile, owned, coTeaching] = await Promise.all([
    supabase.from('users').select('role').eq('id', user.id).single(),
    supabase.from('classrooms').select('*').eq('teacher_id', user.id).eq('status', 'active').neq('classroom_type', 'homeroom'),
    supabase.from('classroom_co_teachers').select('classroom_id').eq('user_id', user.id).in('permission', ['admin', 'manage']),
  ])
  if (!['teacher', 'admin'].includes(profile.data?.role ?? '')) redirect('/dashboard')
  if (owned.error || coTeaching.error) throw new Error('โหลดห้องเรียนไม่สำเร็จ กรุณาลองใหม่')
  const coIds = (coTeaching.data ?? []).map(row => row.classroom_id)
  const coRooms = coIds.length ? await supabase.from('classrooms').select('*').in('id', coIds).eq('status', 'active').neq('classroom_type', 'homeroom') : { data: [], error: null }
  if (coRooms.error) throw new Error('โหลดห้องเรียนไม่สำเร็จ กรุณาลองใหม่')
  const classrooms = [...new Map([...(owned.data ?? []), ...(coRooms.data ?? [])].map(row => [row.id, row as Classroom])).values()]
  const copied = copy ? await readFileAssignmentEditor(copy) : null
  if (copied && 'error' in copied) notFound()
  const initial = copied && 'input' in copied ? { ...copied.input, title: `${copied.input.title} (สำเนา)`, status: 'draft' as const, due_at: null, copy_source_assignment_id: copy } : undefined
  const selected = classrooms.find(row => row.id === classroom)
  return <div className="flex min-w-0 flex-col gap-3">
    {selected ? <AssignmentClassroomSidebar classroom={selected} switchableClassrooms={classrooms} studentCount={0} isOwner={selected.teacher_id === user.id} /> : <ClearPendingSidebar />}
    <Link href={selected ? `/classrooms/${selected.id}?view=assignments` : '/classrooms'} className="text-sm text-muted-foreground">← กลับห้องเรียน</Link>
    <FileAssignmentForm classrooms={classrooms} preselectedClassroomId={selected?.id} initial={initial} />
  </div>
}
