import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TrashActionsClient } from './_components/trash-actions-client'
import type { Classroom } from '@/lib/types'
import { Trash2, ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ถังขยะ — KorKru' }

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000

export default async function TrashPage() {
  const authUser = await getAuthUser()
  if (!authUser) notFound()

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', authUser.id).single()
  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin'
  if (!isTeacher) notFound()

  const admin = createAdminClient()

  // Auto-cleanup: permanent-delete classrooms past 3 months
  const cutoff = new Date(Date.now() - THREE_MONTHS_MS).toISOString()
  await admin
    .from('classrooms')
    .delete()
    .eq('teacher_id', authUser.id)
    .eq('status', 'deleted')
    .lt('deleted_at', cutoff)

  const { data } = await admin
    .from('classrooms')
    .select('*')
    .eq('teacher_id', authUser.id)
    .eq('status', 'deleted')
    .order('deleted_at', { ascending: false })

  const classrooms = (data ?? []) as Classroom[]

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-center gap-3">
        <Link href="/classrooms" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-400" />
            ถังขยะ
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{classrooms.length} ห้องเรียน</p>
        </div>
      </div>

      {classrooms.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-gray-200 rounded-2xl">
          <Trash2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">ถังขยะว่างเปล่า</p>
          <Link href="/classrooms" className="text-sm text-blue-600 hover:underline mt-1 block">
            กลับหน้าหลัก
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-red-50/50">
            <p className="text-sm text-red-700">
              ห้องเรียนในถังขยะจะถูกลบถาวรอัตโนมัติหลังจาก 3 เดือน
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {classrooms.map((c) => {
              const deletedAt = c.deleted_at ? new Date(c.deleted_at) : new Date()
              const expiresAt = new Date(deletedAt.getTime() + THREE_MONTHS_MS)
              const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
              return (
                <TrashActionsClient key={c.id} classroom={c} daysLeft={daysLeft} />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
