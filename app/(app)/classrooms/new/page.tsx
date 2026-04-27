import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CreateClassroomForm } from '@/components/classrooms/create-classroom-form'

export default async function NewClassroomPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user!.id).single()

  if (profile?.role === 'student') redirect('/classrooms')

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">สร้างห้องเรียนใหม่</h1>
        <p className="text-sm text-gray-500 mt-1">นักเรียนจะเข้าร่วมด้วยรหัสที่ระบบสร้างให้อัตโนมัติ</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <CreateClassroomForm />
      </div>
    </div>
  )
}
