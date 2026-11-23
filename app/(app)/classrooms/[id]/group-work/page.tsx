import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, UsersRound } from 'lucide-react'
import { GroupWorkListScreen } from '@/components/group-work/work-list'
import { GroupWorkStudent } from '@/components/group-work/student-work'
import { GroupWorkTeacher } from '@/components/group-work/teacher-review'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { getAuthUser } from '@/lib/auth/server'
import { readGroupWork } from '@/lib/actions/classroom-group-work'
import { formatGroupWorkTime, groupWorkHref } from '@/lib/classroom-group-work'

export const metadata = { title: 'งานกลุ่มในห้องเรียน — KorKru' }

export default async function ClassroomGroupWorkPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ work?: string }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const result = await readGroupWork(id, query.work)
  if ('notFound' in result) notFound()
  if ('error' in result) return <Alert variant="destructive"><AlertDescription>{result.error}</AlertDescription></Alert>
  const data = result.data
  const work = 'work' in data ? data.work : null
  return <section className="@container flex min-w-0 flex-col gap-3">
    <Button variant="ghost" size="sm" className="w-fit pointer-coarse:min-h-11" nativeButton={false}
      render={<Link href={work ? groupWorkHref(id) : `/classrooms/${encodeURIComponent(id)}`} />}>
      <ArrowLeft data-icon="inline-start" />{work ? 'กลับไปรายการงาน' : 'กลับห้องเรียน'}
    </Button>
    <div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h1 className="min-w-0 break-words text-xl font-bold sm:text-2xl">{work ? work.title : 'งานกลุ่มและงานเดี่ยว'}</h1>
        {work && <Badge variant={work.mode === 'group' ? 'workExercise' : 'secondary'}>
          {work.mode === 'group' && <UsersRound data-icon="inline-start" />}{work.mode === 'group' ? 'งานกลุ่ม' : 'งานเดี่ยว'}
        </Badge>}
      </div>
      <p className="text-sm text-muted-foreground">{data.roomName}{work && ` · เต็ม ${work.max_score} คะแนน · ${work.due_at ? `กำหนดส่ง ${formatGroupWorkTime(work.due_at)} น.` : 'ไม่กำหนดวันส่ง'}`}</p>
    </div>
    {'works' in data ? <GroupWorkListScreen roomId={id} data={data} /> :
      data.role === 'teacher' ? <GroupWorkTeacher roomId={id} data={data} /> : <GroupWorkStudent roomId={id} data={data} />}
  </section>
}
