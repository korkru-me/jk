import { createAdminClient } from '@/lib/supabase/admin'
import { PendingTable } from './_components'

export default async function AdminPendingPage() {
  const admin = createAdminClient()
  const { data: questions } = await admin
    .from('questions')
    .select('*, question_categories(name), users:created_by(full_name, email)')
    .eq('visibility', 'pending')
    .order('created_at', { ascending: true })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">รออนุมัติ</h1>
        <p className="text-sm text-gray-500 mt-1">
          {questions?.length ?? 0} โจทย์รอการตรวจสอบ
        </p>
      </div>
      <PendingTable questions={(questions ?? []) as any} />
    </div>
  )
}
