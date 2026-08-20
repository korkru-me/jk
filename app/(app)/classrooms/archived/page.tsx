import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ArchivedActionsClient } from './_components/archived-actions-client'
import type { Classroom } from '@/lib/types'
import { Archive, ArrowLeft } from 'lucide-react'
import { Card } from '@/components/ui/card'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ห้องเรียนที่เก็บถาวร — KorKru' }

export default async function ArchivedClassroomsPage() {
  const authUser = await getAuthUser()
  if (!authUser) notFound()

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', authUser.id).single()
  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin'
  if (!isTeacher) notFound()

  const admin = createAdminClient()
  const { data } = await admin
    .from('classrooms')
    .select('*')
    .eq('teacher_id', authUser.id)
    .eq('status', 'archived')
    .order('updated_at', { ascending: false })

  const classrooms = (data ?? []) as Classroom[]

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-center gap-3">
        <Link href="/classrooms" className="text-muted-foreground hover:text-muted-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Archive className="w-5 h-5 text-warning" />
            ห้องเรียนที่เก็บถาวร
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{classrooms.length} ห้องเรียน</p>
        </div>
      </div>

      {classrooms.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-border rounded-2xl">
          <Archive className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">ไม่มีห้องเรียนที่เก็บถาวร</p>
          <Link href="/classrooms" className="text-sm text-primary hover:underline mt-1 block">
            กลับหน้าหลัก
          </Link>
        </div>
      ) : (
        <Card edge="ring" className="overflow-hidden">
          <div className="p-4 border-b border-border bg-warning/10">
            <p className="text-sm text-warning">
              ห้องเรียนที่เก็บถาวรยังคงดูข้อมูลย้อนหลังได้ แต่ไม่รับงานใหม่
            </p>
          </div>
          <div className="divide-y divide-border">
            {classrooms.map((c) => (
              <ArchivedActionsClient key={c.id} classroom={c} />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
