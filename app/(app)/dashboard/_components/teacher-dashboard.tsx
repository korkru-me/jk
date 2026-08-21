import Link from 'next/link'
import {
  BookOpen, Layers, GraduationCap, Plus, ChevronRight, Users, FileText,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TYPE_LABEL } from '@/lib/question-display'
import type { User } from '@/lib/types'

export interface DashboardClassroom {
  id: string
  name: string
  classroom_type: string
  studentCount: number
  assignmentCount: number
}

export interface DashboardQuestionSet {
  id: string
  title: string
  questionCount: number
}

export interface DashboardQuestion {
  id: string
  title: string
  question_type: string
}

interface Props {
  user: Pick<User, 'id' | 'full_name' | 'role'>
  classroomsCount: number
  questionsCount: number
  setsCount: number
  studentsCount: number
  classrooms: DashboardClassroom[]
  questionSets: DashboardQuestionSet[]
  questions: DashboardQuestion[]
}

export function TeacherDashboard({
  user, classroomsCount, questionsCount, setsCount, studentsCount,
  classrooms, questionSets, questions,
}: Props) {
  const isEmpty = classroomsCount === 0 && questionsCount === 0 && setsCount === 0

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">สวัสดี, {user.full_name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isEmpty ? 'เริ่มต้นใช้งานได้จากด้านล่าง' : 'ภาพรวมงานสอนของคุณ'}
        </p>
      </div>

      {isEmpty ? (
        <GettingStarted />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              href="/classrooms"
              icon={GraduationCap}
              value={classroomsCount}
              label="ห้องเรียน"
              sub={studentsCount > 0 ? `นักเรียนรวม ${studentsCount} คน` : 'ยังไม่มีนักเรียน'}
            />
            <StatCard
              href="/questions"
              icon={BookOpen}
              value={questionsCount}
              label="โจทย์ในคลัง"
              sub="โจทย์ที่คุณสร้างเอง"
            />
            <StatCard
              href="/questions/sets"
              icon={Layers}
              value={setsCount}
              label="ชุดโจทย์"
              sub="ชุดที่คุณสร้างเอง"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/questions/new" className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}>
              <Plus className="w-3.5 h-3.5" /> สร้างโจทย์
            </Link>
            <Link href="/questions/sets/new" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}>
              <Plus className="w-3.5 h-3.5" /> สร้างชุดโจทย์
            </Link>
            <Link href="/classrooms/new" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}>
              <Plus className="w-3.5 h-3.5" /> สร้างห้องเรียน
            </Link>
          </div>

          <Section
            title="ห้องเรียนของฉัน"
            href="/classrooms"
            seeAll={classroomsCount > classrooms.length ? `ดูทั้งหมด ${classroomsCount} ห้อง` : 'ดูทั้งหมด'}
            isEmpty={classrooms.length === 0}
            emptyText="ยังไม่มีห้องเรียน"
            emptyAction={{ href: '/classrooms/new', label: 'สร้างห้องเรียนแรก' }}
          >
            {classrooms.map(classroom => (
              <Row key={classroom.id} href={`/classrooms/${classroom.id}`} title={classroom.name}>
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {classroom.studentCount} คน
                </span>
                {classroom.classroom_type === 'homeroom' ? (
                  <span>ที่ปรึกษา</span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {classroom.assignmentCount} ชุดข้อสอบ
                  </span>
                )}
              </Row>
            ))}
          </Section>

          <Section
            title="ชุดโจทย์ล่าสุด"
            href="/questions/sets"
            seeAll={setsCount > questionSets.length ? `ดูทั้งหมด ${setsCount} ชุด` : 'ดูทั้งหมด'}
            isEmpty={questionSets.length === 0}
            emptyText="ยังไม่มีชุดโจทย์"
            emptyAction={{ href: '/questions/sets/new', label: 'สร้างชุดโจทย์แรก' }}
          >
            {questionSets.map(set => (
              <Row key={set.id} href={`/questions/sets/${set.id}/edit`} title={set.title}>
                <span>{set.questionCount} ข้อ</span>
              </Row>
            ))}
          </Section>

          <Section
            title="โจทย์ล่าสุด"
            href="/questions"
            seeAll={questionsCount > questions.length ? `ดูทั้งหมด ${questionsCount} ข้อ` : 'ดูทั้งหมด'}
            isEmpty={questions.length === 0}
            emptyText="ยังไม่มีโจทย์ในคลัง"
            emptyAction={{ href: '/questions/new', label: 'สร้างโจทย์แรก' }}
          >
            {questions.map(question => (
              <Row key={question.id} href={`/questions/${question.id}/edit`} title={question.title}>
                <span>{TYPE_LABEL[question.question_type] ?? question.question_type}</span>
              </Row>
            ))}
          </Section>
        </>
      )}
    </div>
  )
}

function StatCard({
  href, icon: Icon, value, label, sub,
}: {
  href: string
  icon: React.ElementType
  value: number
  label: string
  sub: string
}) {
  return (
    <Link href={href}>
      <Card radius="md" padding="md" interactive className="h-full">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <p className="text-2xl font-bold leading-none">{value.toLocaleString()}</p>
        <p className="text-sm mt-1.5">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </Card>
    </Link>
  )
}

function Section({
  title, href, seeAll, isEmpty, emptyText, emptyAction, children,
}: {
  title: string
  href: string
  seeAll: string
  isEmpty: boolean
  emptyText: string
  emptyAction: { href: string; label: string }
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {!isEmpty && (
          <Link href={href} className="text-xs text-primary inline-flex items-center gap-0.5">
            {seeAll} <ChevronRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      {isEmpty ? (
        <Card radius="md" edge="dashed" padding="lg" className="text-center">
          <p className="text-sm text-muted-foreground">{emptyText}</p>
          <Link
            href={emptyAction.href}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5 mt-3')}
          >
            <Plus className="w-3.5 h-3.5" /> {emptyAction.label}
          </Link>
        </Card>
      ) : (
        <Card radius="md" padding="none" className="divide-y divide-border overflow-hidden">
          {children}
        </Card>
      )}
    </div>
  )
}

function Row({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
      <span className="flex-1 min-w-0 text-sm font-medium truncate">{title}</span>
      <span className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">{children}</span>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </Link>
  )
}

function GettingStarted() {
  const steps = [
    { href: '/questions/new', icon: BookOpen, title: 'สร้างโจทย์', desc: 'เริ่มจากโจทย์ข้อแรกในคลังของคุณ' },
    { href: '/questions/sets/new', icon: Layers, title: 'จัดชุดโจทย์', desc: 'รวมโจทย์หลายข้อไว้เป็นชุดเดียว' },
    { href: '/classrooms/new', icon: GraduationCap, title: 'สร้างห้องเรียน', desc: 'เชิญนักเรียนเข้าร่วมด้วยรหัสห้องเรียน' },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {steps.map(step => {
        const Icon = step.icon
        return (
          <Link key={step.href} href={step.href}>
            <Card radius="md" padding="lg" interactive className="h-full">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm font-semibold">{step.title}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{step.desc}</p>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
