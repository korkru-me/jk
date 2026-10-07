import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/server'
import { CreateCourseWizard } from './_components/create-course-wizard'
import { parseDescription } from '@/app/(app)/classrooms/_components/classroom-meta'

export const metadata = { title: 'สร้างห้องเรียนใหม่ — KorKru' }

export default async function NewClassroomPage({
  searchParams,
}: {
  searchParams: Promise<{ copyFrom?: string | string[] }>
}) {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()

  if (profile?.role === 'student') redirect('/classrooms')

  const query = await searchParams
  const copyFrom = typeof query.copyFrom === 'string' ? query.copyFrom : undefined
  let duplicateSourceId: string | undefined
  let initialValues: Parameters<typeof CreateCourseWizard>[0]['initialValues']

  if (copyFrom) {
    const { data: source } = await supabase
      .from('classrooms')
      .select('id, name, description, classroom_type')
      .eq('id', copyFrom)
      .eq('teacher_id', user.id)
      .eq('status', 'active')
      .maybeSingle()

    if (!source) redirect('/classrooms')
    const meta = parseDescription(source.description)
    duplicateSourceId = source.id
    initialValues = {
      classroomType: source.classroom_type,
      name: `${source.name} (สำเนา)`,
      description: meta.description,
      cover: meta.cover,
      iconKey: meta.iconKey,
      gradeLevel: meta.gradeLevel,
      academicTerm: meta.academicTerm,
      tags: meta.tags,
      accessType: meta.accessType,
      capacityEnabled: meta.capacityEnabled,
      maxCapacity: meta.maxCapacity,
      startDate: meta.startDate,
      endDate: meta.endDate,
    }
  }

  return (
    <div className="classroom-create-stage max-w-4xl">
      <CreateCourseWizard duplicateSourceId={duplicateSourceId} initialValues={initialValues} />
    </div>
  )
}
