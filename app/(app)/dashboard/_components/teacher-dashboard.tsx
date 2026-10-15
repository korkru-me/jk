import Link from 'next/link'
import {
  BookOpen,
  ChevronRight,
  Layers,
  Plus,
  School,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DashboardQuestionList, type QuestionPreviewLoader } from './dashboard-question-list'
import type { QuestionCardRow } from '@/components/questions/question-card'
import type { QuestionCardData } from '@/lib/question-card-data'
import type { Classroom, QuestionSet } from '@/lib/types'
import { QuestionSetCard } from '@/components/questions/question-set-card'
import { ClassroomCard } from '@/app/(app)/classrooms/_components/classroom-card'
import { DashboardWelcome } from './dashboard-welcome'

/**
 * Decorative accents distinguish the three kinds of work without claiming a
 * semantic status. The tokens are owned by the active visual preset.
 */
interface Accent {
  chip: string
  border: string
  hover: string
}

const CLASSROOM_ACCENT: Accent = {
  chip: 'bg-tint-1/10 text-tint-1',
  border: 'border-tint-1/25',
  hover: 'hover:bg-tint-1/5',
}

const SET_ACCENT: Accent = {
  chip: 'bg-primary/10 text-primary',
  border: 'border-primary/25',
  hover: 'hover:bg-primary/5',
}

const QUESTION_ACCENT: Accent = {
  chip: 'bg-tint-3/10 text-tint-3',
  border: 'border-tint-3/25',
  hover: 'hover:bg-tint-3/5',
}

export type DashboardClassroom = Pick<
  Classroom,
  'id' | 'name' | 'description' | 'classroom_type'
> & {
  studentCount: number
  assignmentCount: number
}

export interface DashboardQuestionSet {
  id: string
  title: string
  questionCount: number
  sections?: QuestionSet['sections']
}

export type DashboardQuestion = QuestionCardRow

interface Props {
  currentUserId: string
  fullName: string
  classroomsCount: number
  questionsCount: number
  setsCount: number
  studentsCount: number
  classrooms: DashboardClassroom[]
  questionSets: DashboardQuestionSet[]
  questions: DashboardQuestion[]
  questionCardData?: QuestionCardData
  myTeams?: { id: string; name: string }[]
  loadQuestionPreview?: QuestionPreviewLoader
}

export function TeacherDashboard({
  currentUserId,
  fullName,
  classroomsCount,
  questionsCount,
  setsCount,
  studentsCount,
  classrooms,
  questionSets,
  questions,
  questionCardData,
  myTeams,
  loadQuestionPreview,
}: Props) {
  const isEmpty = classroomsCount === 0 && questionsCount === 0 && setsCount === 0

  const welcome = (
    <DashboardWelcome
      fullName={fullName}
      classroomsCount={classroomsCount}
      studentsCount={studentsCount}
      questionsCount={questionsCount}
      setsCount={setsCount}
    />
  )

  if (isEmpty) return (
    <div className="flex max-w-[1200px] flex-col gap-4">
      {welcome}
      <GettingStarted />
    </div>
  )

  return (
    <div className="flex max-w-[1200px] flex-col gap-4">
      {welcome}

      <DashboardSection
        title="ห้องเรียนของฉัน"
        icon={School}
        accent={CLASSROOM_ACCENT}
        href="/classrooms"
        seeAll={classroomsCount > classrooms.length ? `ดูทั้งหมด ${classroomsCount} ห้อง` : 'ดูทั้งหมด'}
        isEmpty={classrooms.length === 0}
        emptyText="ยังไม่มีห้องเรียน"
        emptyAction={{ href: '/classrooms/new', label: 'สร้างห้องเรียนแรก' }}
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {classrooms.map(classroom => (
            <div key={classroom.id} data-dashboard-classroom-card>
              <ClassroomCard
                classroom={classroom}
                studentCount={classroom.studentCount}
                assignmentCount={classroom.assignmentCount}
                backHref="/dashboard"
              />
            </div>
          ))}
        </div>
      </DashboardSection>

      <DashboardSection
        title="แฟ้มโจทย์ล่าสุด"
        icon={Layers}
        accent={SET_ACCENT}
        href="/questions/sets"
        seeAll={setsCount > questionSets.length ? `ดูทั้งหมด ${setsCount} แฟ้ม` : 'ดูทั้งหมด'}
        isEmpty={questionSets.length === 0}
        emptyText="ยังไม่มีแฟ้มโจทย์"
        emptyAction={{ href: '/questions/sets/new', label: 'สร้างแฟ้มโจทย์แรก' }}
      >
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-3">
          {questionSets.map(set => (
            <QuestionSetCard
              key={set.id}
              set={{
                id: set.id,
                title: set.title,
                created_by: currentUserId,
                sections: set.sections ?? [],
                valid_question_count: set.questionCount,
              }}
              currentUserId={currentUserId}
              backHref="/dashboard"
              refreshAfterDelete
            />
          ))}
        </div>
      </DashboardSection>

      <DashboardSection
        title="โจทย์ล่าสุด"
        icon={BookOpen}
        accent={QUESTION_ACCENT}
        href="/questions"
        seeAll={questionsCount > questions.length ? `ดูทั้งหมด ${questionsCount} ข้อ` : 'ดูทั้งหมด'}
        isEmpty={questions.length === 0}
        emptyText="ยังไม่มีโจทย์ในคลัง"
        emptyAction={{ href: '/questions/new', label: 'สร้างโจทย์แรก' }}
      >
        <DashboardQuestionList
          questions={questions}
          cardData={questionCardData}
          myTeams={myTeams}
          loadPreview={loadQuestionPreview}
        />
      </DashboardSection>
    </div>
  )
}

function DashboardSection({
  title,
  icon: Icon,
  accent,
  href,
  seeAll,
  isEmpty,
  emptyText,
  emptyAction,
  children,
}: {
  title: string
  icon: React.ElementType
  accent: Accent
  href: string
  seeAll: string
  isEmpty: boolean
  emptyText: string
  emptyAction: { href: string; label: string }
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', accent.chip)}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
          {title}
        </h2>
        {!isEmpty && (
          <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 text-sm text-primary hover:underline">
            {seeAll}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </div>
      {isEmpty ? (
        <Card radius="md" edge="dashed" padding="lg" className={cn('text-center', accent.border)}>
          <p className="text-sm text-muted-foreground">{emptyText}</p>
          <Link
            href={emptyAction.href}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3')}
          >
            <Plus data-icon="inline-start" />
            {emptyAction.label}
          </Link>
        </Card>
      ) : children}
    </section>
  )
}

function GettingStarted() {
  const steps = [
    {
      href: '/questions/new',
      icon: BookOpen,
      accent: QUESTION_ACCENT,
      title: 'สร้างโจทย์',
      desc: 'เริ่มจากโจทย์ข้อแรกในคลังของคุณ',
    },
    {
      href: '/questions/sets/new',
      icon: Layers,
      accent: SET_ACCENT,
      title: 'จัดแฟ้มโจทย์',
      desc: 'รวมโจทย์หลายข้อไว้ในแฟ้มเดียว',
    },
    {
      href: '/classrooms/new',
      icon: School,
      accent: CLASSROOM_ACCENT,
      title: 'สร้างห้องเรียน',
      desc: 'เชิญนักเรียนเข้าร่วมด้วยรหัสห้องเรียน',
    },
  ]

  return (
    <div className="flex max-w-[1200px] flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold">เริ่มต้นใช้งาน</h2>
        <p className="mt-1 text-sm text-muted-foreground">เลือกสิ่งที่คุณอยากสร้างก่อน</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {steps.map(step => {
          const Icon = step.icon
          return (
            <Link key={step.href} href={step.href}>
              <Card radius="md" padding="lg" interactive className={cn('h-full', step.accent.border)}>
                <span className={cn('flex size-9 items-center justify-center rounded-lg', step.accent.chip)}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <p className="mt-3 text-sm font-semibold">{step.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.desc}</p>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
