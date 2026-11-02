import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { readFileAssignmentEditor, updateFileAssignment } from '@/lib/actions/file-assignments'
import { FileAssignmentForm } from '@/components/assignments/file-assignment-form'
import { ClearPendingSidebar } from '@/components/layout/sidebar-context'

export const metadata = { title: 'แก้ไขงานส่งไฟล์ — KorKru' }

export default async function EditFileAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const editor = await readFileAssignmentEditor(id)
  if ('error' in editor) notFound()
  const supabase = await createClient()
  const rooms = await supabase.from('classrooms').select('id, name').in('id', editor.input.classroom_ids)
  if (rooms.error) throw new Error('โหลดห้องเรียนไม่สำเร็จ กรุณาลองใหม่')
  return <div className="flex min-w-0 flex-col gap-3"><ClearPendingSidebar />
    <Link href={`/assignments/${id}`} className="text-sm text-muted-foreground">← กลับงานที่มอบหมาย</Link>
    <FileAssignmentForm classrooms={rooms.data ?? []} initial={editor.input} editing contentLocked={editor.contentLocked} onCreate={updateFileAssignment.bind(null, id)} />
  </div>
}
