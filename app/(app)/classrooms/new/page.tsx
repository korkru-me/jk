import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CreateCourseWizard } from './_components/create-course-wizard'

export const metadata = { title: 'สร้างห้องเรียนใหม่ — KorKru' }

export default async function NewClassroomPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user!.id).single()

  if (profile?.role === 'student') redirect('/classrooms')

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6">
      <CreateCourseWizard />
    </div>
  )
}
