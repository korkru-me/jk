import { redirect } from 'next/navigation'
import { ExamDefaultsSettings } from '@/components/settings/exam-defaults-settings'
import { SebReadinessCard } from '@/components/settings/seb-readiness-card'
import { getAuthUser } from '@/lib/auth/server'
import { inspectSebReadiness } from '@/lib/seb'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'ตั้งค่าข้อสอบเริ่มต้น — KorKru' }

export default async function ExamDefaultsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const [profileResult, schemaResult] = await Promise.all([
    supabase.from('users').select('role').eq('id', user.id).maybeSingle(),
    // The newest SEB preflight table can exist only after the earlier SEB,
    // Android admission, and proctor-review migrations have been applied in
    // order. Probing it avoids reporting a partially deployed rollout ready.
    supabase.from('exam_seb_checkins').select('assignment_id').limit(1),
  ])
  if (profileResult.data?.role === 'student') redirect('/settings/profile')

  return (
    <div className="space-y-5">
      <SebReadinessCard
        readiness={inspectSebReadiness()}
        schemaReady={!schemaResult.error}
      />
      <ExamDefaultsSettings />
    </div>
  )
}
