import { BarChart3, FlaskConical, LockKeyhole, Users } from 'lucide-react'
import { redirect } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getAuthUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import type {
  EducationResearchProject,
  EducationResearchProjectStatus,
} from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'วิจัยการศึกษา — KorKru' }

type ResearchProjectRow = EducationResearchProject & {
  classrooms: { name: string } | null
}

const STATUS_LABEL: Record<EducationResearchProjectStatus, string> = {
  draft: 'ฉบับร่าง',
  collecting_pretest: 'กำลังเก็บคะแนนก่อนเรียน',
  teaching: 'กำลังจัดการเรียนรู้',
  collecting_posttest: 'กำลังเก็บคะแนนหลังเรียน',
  ready_for_analysis: 'พร้อมวิเคราะห์',
  completed: 'เสร็จสิ้น',
  archived: 'เก็บถาวร',
}

const STATUS_STYLE: Record<EducationResearchProjectStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  collecting_pretest: 'bg-primary/10 text-primary',
  teaching: 'bg-warning/10 text-warning',
  collecting_posttest: 'bg-primary/10 text-primary',
  ready_for_analysis: 'bg-success/10 text-success',
  completed: 'bg-success/10 text-success',
  archived: 'bg-muted text-muted-foreground',
}

export default async function ResearchPage() {
  const authUser = await getAuthUser()
  if (!authUser) redirect('/login')

  const supabase = await createClient()
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUser.id)
    .single()

  if (profileError || !profile) {
    return <ResearchLoadError />
  }

  if (profile.role !== 'teacher' && profile.role !== 'admin') {
    redirect('/dashboard')
  }

  const { data, error } = await supabase
    .from('education_research_projects')
    .select('id, org_id, classroom_id, created_by, title, topic, research_design, status, passing_threshold_percent, significance_level, criterion_test_sides, completed_at, created_at, updated_at, classrooms(name)')
    .order('updated_at', { ascending: false })

  if (error) {
    return <ResearchLoadError />
  }

  const projects = (data ?? []) as unknown as ResearchProjectRow[]
  const activeCount = projects.filter(project => !['draft', 'completed', 'archived'].includes(project.status)).length
  const readyCount = projects.filter(project => project.status === 'ready_for_analysis').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConical className="size-6 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-foreground">วิจัยการศึกษา</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            รวบรวมคะแนนก่อน–หลังเรียนและวิเคราะห์พัฒนาการของนักเรียนจากข้อมูลจริง
          </p>
        </div>
        <div className="text-left sm:text-right">
          <Button disabled aria-describedby="research-create-note">
            สร้างโครงการวิจัย
          </Button>
          <p id="research-create-note" className="mt-1.5 text-xs text-muted-foreground">
            เปิดใช้งานในขั้น 2.2
          </p>
        </div>
      </div>

      <Card padding="md" className="border-primary/20 bg-primary/5">
        <div className="flex gap-3">
          <LockKeyhole className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">ฐานข้อมูลและสิทธิ์พร้อมสำหรับระยะ 2.1</p>
            <p className="mt-1 text-sm text-muted-foreground">
              หน้านี้ใช้เฉพาะข้อมูลจริงตามสิทธิ์ของห้องเรียน นักเรียนยังเข้าทำข้อสอบจากห้องเรียนตามปกติ
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard icon={FlaskConical} label="โครงการทั้งหมด" value={projects.length} />
        <SummaryCard icon={Users} label="กำลังดำเนินการ" value={activeCount} />
        <SummaryCard icon={BarChart3} label="พร้อมวิเคราะห์" value={readyCount} />
      </div>

      {projects.length === 0 ? (
        <Card padding="2xl" edge="dashed" className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FlaskConical className="size-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">ยังไม่มีโครงการวิจัย</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            ยังไม่มีข้อมูลโครงการจริงในบัญชีนี้ ขั้น 2.2 จะเพิ่มเส้นทางสร้างโครงการจากห้องเรียนและข้อสอบของคุณ
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {projects.map(project => (
            <Card key={project.id} padding="lg">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-foreground">{project.title}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{project.topic}</p>
                </div>
                <span className={cn('shrink-0 rounded-full px-2 py-1 text-xs font-medium', STATUS_STYLE[project.status])}>
                  {STATUS_LABEL[project.status]}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>ห้องเรียน: {project.classrooms?.name ?? 'ไม่พบห้องเรียน'}</span>
                <span>เกณฑ์ผ่าน: {project.passing_threshold_percent}%</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FlaskConical
  label: string
  value: number
}) {
  return (
    <Card padding="lg">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </Card>
  )
}

function ResearchLoadError() {
  return (
    <Card padding="xl" className="border-destructive/30">
      <h1 className="text-lg font-semibold text-destructive">เปิดวิจัยการศึกษาไม่ได้</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        ระบบยังโหลดข้อมูลหรือสิทธิ์ของคุณไม่สำเร็จ กรุณาลองใหม่อีกครั้ง หากยังพบปัญหาให้ติดต่อผู้ดูแลระบบ
      </p>
    </Card>
  )
}
