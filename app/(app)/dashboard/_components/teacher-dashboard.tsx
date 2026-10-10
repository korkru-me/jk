import Link from 'next/link'
import {
  ArrowLeftRight,
  BookOpen,
  Boxes,
  ChevronRight,
  FileText,
  Layers,
  ListChecks,
  ListOrdered,
  NotebookPen,
  Paperclip,
  PenLine,
  Plus,
  School,
  Table2,
  TextCursorInput,
  ToggleLeft,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TYPE_LABEL } from '@/lib/question-display'
import type { ClassroomIconKey } from '@/lib/classroom-icons'
import type { ClassroomCoverPatternKey } from '@/lib/classroom-cover-patterns'
import { ClassroomIcon } from '@/components/classrooms/classroom-icon'
import { ClassroomCoverPattern } from '@/components/classrooms/classroom-cover-pattern'
import { COVER_PRESETS, type CoverPreset } from '@/app/(app)/classrooms/_components/classroom-meta'

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
  chip: 'bg-tint-2/10 text-tint-2',
  border: 'border-tint-2/25',
  hover: 'hover:bg-tint-2/5',
}

const QUESTION_ACCENT: Accent = {
  chip: 'bg-tint-3/10 text-tint-3',
  border: 'border-tint-3/25',
  hover: 'hover:bg-tint-3/5',
}

const TYPE_ICON: Record<string, React.ElementType> = {
  mcq: ListChecks,
  written: PenLine,
  essay: NotebookPen,
  true_false: ToggleLeft,
  fill_blank: TextCursorInput,
  matching: ArrowLeftRight,
  ordering: ListOrdered,
  file_upload: Paperclip,
  composite: Boxes,
  classify: Table2,
}

export interface DashboardClassroom {
  id: string
  name: string
  classroom_type: string
  cover?: string
  coverPattern?: ClassroomCoverPatternKey
  iconKey?: ClassroomIconKey
  gradeLevel?: string
  academicTerm?: string
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
  classroomsCount: number
  questionsCount: number
  setsCount: number
  studentsCount: number
  classrooms: DashboardClassroom[]
  questionSets: DashboardQuestionSet[]
  questions: DashboardQuestion[]
}

export function TeacherDashboard({
  classroomsCount,
  questionsCount,
  setsCount,
  studentsCount,
  classrooms,
  questionSets,
  questions,
}: Props) {
  const isEmpty = classroomsCount === 0 && questionsCount === 0 && setsCount === 0

  if (isEmpty) return <GettingStarted />

  return (
    <div className="flex max-w-[1200px] flex-col gap-7">
      {/* A compact strip keeps useful totals without pushing the actual work
          below the fold. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <CompactStatCard
          href="/classrooms"
          icon={School}
          accent={CLASSROOM_ACCENT}
          value={classroomsCount}
          label="ห้องเรียน"
          sub={studentsCount > 0 ? `นักเรียนรวม ${studentsCount} คน` : 'ยังไม่มีนักเรียน'}
        />
        <CompactStatCard
          href="/questions"
          icon={BookOpen}
          accent={QUESTION_ACCENT}
          value={questionsCount}
          label="โจทย์ในคลัง"
          sub="โจทย์ที่คุณสร้างเอง"
        />
        <CompactStatCard
          href="/questions/sets"
          icon={Layers}
          accent={SET_ACCENT}
          value={setsCount}
          label="แฟ้มโจทย์"
          sub="แฟ้มที่คุณสร้างเอง"
        />
      </div>

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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classrooms.map(classroom => (
            <ClassroomDashboardCard key={classroom.id} classroom={classroom} />
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {questionSets.map(set => (
            <CompactResourceCard
              key={set.id}
              href={`/questions/sets/${set.id}/edit`}
              title={set.title}
              meta={`${set.questionCount} ข้อ`}
              icon={Layers}
              accent={SET_ACCENT}
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {questions.map(question => (
            <CompactResourceCard
              key={question.id}
              href={`/questions/${question.id}/edit`}
              title={question.title}
              meta={TYPE_LABEL[question.question_type] ?? question.question_type}
              icon={TYPE_ICON[question.question_type] ?? FileText}
              accent={QUESTION_ACCENT}
            />
          ))}
        </div>
      </DashboardSection>
    </div>
  )
}

function CompactStatCard({
  href,
  icon: Icon,
  accent,
  value,
  label,
  sub,
}: {
  href: string
  icon: React.ElementType
  accent: Accent
  value: number
  label: string
  sub: string
}) {
  return (
    <Link href={href} className="group" data-dashboard-stat-card>
      <Card
        radius="md"
        padding="sm"
        interactive
        className={cn(
          'flex min-h-20 flex-col items-center justify-center gap-1.5 p-2 text-center sm:min-h-18 sm:flex-row sm:justify-start sm:gap-3 sm:p-3 sm:text-left',
          accent.border
        )}
      >
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg sm:size-9', accent.chip)}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 sm:flex-1">
          <span className="flex flex-col items-center gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
            <strong className="text-lg leading-none sm:text-xl">{value.toLocaleString()}</strong>
            <span className="text-xs leading-tight font-medium sm:truncate sm:text-sm">{label}</span>
          </span>
          <span className="mt-1 hidden truncate text-xs text-muted-foreground sm:block">{sub}</span>
        </span>
        <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" aria-hidden="true" />
      </Card>
    </Link>
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

function ClassroomDashboardCard({ classroom }: { classroom: DashboardClassroom }) {
  const cover = dashboardCover(classroom)
  const isHomeroom = classroom.classroom_type === 'homeroom'

  return (
    <Card radius="md" className="group overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`/classrooms/${classroom.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className={cn('relative block h-20 overflow-hidden border-b', cover.surface, cover.text)}>
          <ClassroomCoverPattern
            patternKey={classroom.coverPattern}
            placement="end"
            className="absolute inset-0 size-full opacity-65 transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </span>
        <span className="relative flex min-h-36 flex-col gap-3 px-4 pb-4 pt-8">
          <span className={cn(
            'absolute -top-6 left-4 flex size-12 items-center justify-center rounded-2xl border-4 border-card bg-card shadow-sm',
            cover.text,
          )}>
            <ClassroomIcon iconKey={classroom.iconKey} className="size-6" />
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <strong className="min-w-0 flex-1 truncate text-base">{classroom.name}</strong>
            {isHomeroom && <Badge variant="warning">ที่ปรึกษา</Badge>}
          </span>
          {(classroom.gradeLevel || classroom.academicTerm) && (
            <span className="-mt-2 block truncate text-xs text-muted-foreground">
              {[classroom.gradeLevel, classroom.academicTerm].filter(Boolean).join(' • ')}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              <Users aria-hidden="true" />
              {classroom.studentCount} คน
            </Badge>
            {!isHomeroom && (
              <Badge variant="secondary">
                <FileText aria-hidden="true" />
                {classroom.assignmentCount} ชุดข้อสอบ
              </Badge>
            )}
          </span>
          <span className={cn(buttonVariants({ size: 'sm' }), 'mt-auto w-full')}>
            เข้าห้องเรียน
            <ChevronRight data-icon="inline-end" />
          </span>
        </span>
      </Link>
    </Card>
  )
}

function CompactResourceCard({
  href,
  title,
  meta,
  icon: Icon,
  accent,
}: {
  href: string
  title: string
  meta: string
  icon: React.ElementType
  accent: Accent
}) {
  return (
    <Card radius="md" className={cn('overflow-hidden', accent.border)}>
      <Link href={href} className={cn('flex min-h-20 items-center gap-3 p-3 transition-colors', accent.hover)}>
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', accent.chip)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-sm">{title}</strong>
          <span className="mt-0.5 block text-xs text-muted-foreground">{meta}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </Card>
  )
}

function dashboardCover(classroom: DashboardClassroom): CoverPreset {
  const saved = COVER_PRESETS.find(preset => preset.id === classroom.cover)
  if (saved) return saved

  // Legacy rooms with no chosen colour still get a stable automatic colour.
  // Persisted metadata is untouched; the same room simply hashes to the same
  // visual every time until the teacher explicitly chooses a theme.
  let hash = 0
  for (const character of classroom.id) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0
  return COVER_PRESETS[Math.abs(hash) % Math.min(8, COVER_PRESETS.length)]
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
        <h1 className="text-xl font-bold">เริ่มต้นใช้งาน</h1>
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
