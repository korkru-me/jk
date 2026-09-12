import Link from 'next/link'
import {
  BookOpen, Layers, GraduationCap, Plus, ChevronRight, Users, FileText,
  House, ListChecks, PenLine, NotebookPen, ToggleLeft, TextCursorInput,
  ArrowLeftRight, ListOrdered, Paperclip, Boxes, Table2,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TYPE_LABEL } from '@/lib/question-display'
import type { User } from '@/lib/types'

/**
 * One decorative accent per section, so ห้องเรียน / แฟ้มโจทย์ / โจทย์ read as
 * three different things at a glance instead of three identical grey lists.
 *
 * These ride on --tint-*, which the design system defines as decoration with
 * no meaning: a preset may recolour them freely, and nothing a teacher reads
 * changes. Semantic tokens (success, warning, flag) are deliberately absent —
 * green here would claim a state that does not exist. Every class is spelled
 * out in full because Tailwind scans source text, not runtime values.
 */
interface Accent {
  /** Icon chip: tinted fill behind a tinted glyph. */
  chip: string
  /** Card edge, tinted just enough to tie it to the chip. */
  border: string
  /** Stripe across the top of the section card. */
  bar: string
  /** Row hover wash. */
  row: string
  /** Blurred corner glow on a stat card. */
  glow: string
}

const CLASSROOM_ACCENT: Accent = {
  chip: 'bg-tint-1/10 text-tint-1',
  border: 'border-tint-1/25',
  bar: 'bg-gradient-to-r from-tint-1 to-tint-1/15',
  row: 'hover:bg-tint-1/5',
  glow: 'bg-tint-1/25',
}

const SET_ACCENT: Accent = {
  chip: 'bg-tint-2/10 text-tint-2',
  border: 'border-tint-2/25',
  bar: 'bg-gradient-to-r from-tint-2 to-tint-2/15',
  row: 'hover:bg-tint-2/5',
  glow: 'bg-tint-2/25',
}

const QUESTION_ACCENT: Accent = {
  chip: 'bg-tint-3/10 text-tint-3',
  border: 'border-tint-3/25',
  bar: 'bg-gradient-to-r from-tint-3 to-tint-3/15',
  row: 'hover:bg-tint-3/5',
  glow: 'bg-tint-3/25',
}

/**
 * A glyph per question type, so a list of titles is scannable by kind. Labels
 * still come from TYPE_LABEL — the icon is redundant with the text on purpose,
 * never the only carrier of the type.
 */
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
              accent={CLASSROOM_ACCENT}
              value={classroomsCount}
              label="ห้องเรียน"
              sub={studentsCount > 0 ? `นักเรียนรวม ${studentsCount} คน` : 'ยังไม่มีนักเรียน'}
            />
            <StatCard
              href="/questions"
              icon={BookOpen}
              accent={QUESTION_ACCENT}
              value={questionsCount}
              label="โจทย์ในคลัง"
              sub="โจทย์ที่คุณสร้างเอง"
            />
            <StatCard
              href="/questions/sets"
              icon={Layers}
              accent={SET_ACCENT}
              value={setsCount}
              label="แฟ้มโจทย์"
              sub="แฟ้มที่คุณสร้างเอง"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/questions/new" className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}>
              <Plus className="w-3.5 h-3.5" /> สร้างโจทย์
            </Link>
            <Link href="/questions/sets/new" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}>
              <Plus className="w-3.5 h-3.5" /> สร้างแฟ้มโจทย์
            </Link>
            <Link href="/classrooms/new" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}>
              <Plus className="w-3.5 h-3.5" /> สร้างห้องเรียน
            </Link>
          </div>

          <Section
            title="ห้องเรียนของฉัน"
            icon={GraduationCap}
            accent={CLASSROOM_ACCENT}
            href="/classrooms"
            seeAll={classroomsCount > classrooms.length ? `ดูทั้งหมด ${classroomsCount} ห้อง` : 'ดูทั้งหมด'}
            isEmpty={classrooms.length === 0}
            emptyText="ยังไม่มีห้องเรียน"
            emptyAction={{ href: '/classrooms/new', label: 'สร้างห้องเรียนแรก' }}
          >
            {classrooms.map(classroom => (
              <Row
                key={classroom.id}
                href={`/classrooms/${classroom.id}`}
                title={classroom.name}
                icon={classroom.classroom_type === 'homeroom' ? House : GraduationCap}
                accent={CLASSROOM_ACCENT}
              >
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
            title="แฟ้มโจทย์ล่าสุด"
            icon={Layers}
            accent={SET_ACCENT}
            href="/questions/sets"
            seeAll={setsCount > questionSets.length ? `ดูทั้งหมด ${setsCount} แฟ้ม` : 'ดูทั้งหมด'}
            isEmpty={questionSets.length === 0}
            emptyText="ยังไม่มีแฟ้มโจทย์"
            emptyAction={{ href: '/questions/sets/new', label: 'สร้างแฟ้มโจทย์แรก' }}
          >
            {questionSets.map(set => (
              <Row
                key={set.id}
                href={`/questions/sets/${set.id}/edit`}
                title={set.title}
                icon={Layers}
                accent={SET_ACCENT}
              >
                <span>{set.questionCount} ข้อ</span>
              </Row>
            ))}
          </Section>

          <Section
            title="โจทย์ล่าสุด"
            icon={BookOpen}
            accent={QUESTION_ACCENT}
            href="/questions"
            seeAll={questionsCount > questions.length ? `ดูทั้งหมด ${questionsCount} ข้อ` : 'ดูทั้งหมด'}
            isEmpty={questions.length === 0}
            emptyText="ยังไม่มีโจทย์ในคลัง"
            emptyAction={{ href: '/questions/new', label: 'สร้างโจทย์แรก' }}
          >
            {questions.map(question => (
              <Row
                key={question.id}
                href={`/questions/${question.id}/edit`}
                title={question.title}
                icon={TYPE_ICON[question.question_type] ?? FileText}
                accent={QUESTION_ACCENT}
              >
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
  href, icon: Icon, accent, value, label, sub,
}: {
  href: string
  icon: React.ElementType
  accent: Accent
  value: number
  label: string
  sub: string
}) {
  return (
    <Link href={href}>
      <Card
        radius="md"
        padding="md"
        interactive
        className={cn('h-full relative overflow-hidden', accent.border)}
      >
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute -right-6 -top-6 w-20 h-20 rounded-full blur-2xl',
            accent.glow
          )}
        />
        <div className="relative">
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-3', accent.chip)}>
            <Icon className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold leading-none">{value.toLocaleString()}</p>
          <p className="text-sm mt-1.5">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
        </div>
      </Card>
    </Link>
  )
}

function Section({
  title, icon: Icon, accent, href, seeAll, isEmpty, emptyText, emptyAction, children,
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
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span
            aria-hidden
            className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', accent.chip)}
          >
            <Icon className="w-4 h-4" />
          </span>
          {title}
        </h2>
        {!isEmpty && (
          <Link href={href} className="text-xs text-primary inline-flex items-center gap-0.5 shrink-0">
            {seeAll} <ChevronRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      {isEmpty ? (
        <Card radius="md" edge="dashed" padding="lg" className={cn('text-center', accent.border)}>
          <p className="text-sm text-muted-foreground">{emptyText}</p>
          <Link
            href={emptyAction.href}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5 mt-3')}
          >
            <Plus className="w-3.5 h-3.5" /> {emptyAction.label}
          </Link>
        </Card>
      ) : (
        <Card radius="md" padding="none" className={cn('overflow-hidden', accent.border)}>
          <div aria-hidden className={cn('h-1', accent.bar)} />
          <div className="divide-y divide-border">{children}</div>
        </Card>
      )}
    </div>
  )
}

function Row({
  href, title, icon: Icon, accent, children,
}: {
  href: string
  title: string
  icon: React.ElementType
  accent: Accent
  children: React.ReactNode
}) {
  return (
    <Link href={href} className={cn('flex items-center gap-3 px-4 py-3 transition-colors', accent.row)}>
      <span
        aria-hidden
        className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', accent.chip)}
      >
        <Icon className="w-4 h-4" />
      </span>
      {/* The icon chip costs the title about 50px, which on a phone left names
          truncated to "ก...". Wrapping the meta onto its own line below the
          title buys that width back instead of hiding what a teacher came to
          read; from sm up both sit on one line as before. */}
      <span className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span className="basis-full sm:basis-auto sm:flex-1 min-w-0 truncate text-sm font-medium">
          {title}
        </span>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">{children}</span>
      </span>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </Link>
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
      icon: GraduationCap,
      accent: CLASSROOM_ACCENT,
      title: 'สร้างห้องเรียน',
      desc: 'เชิญนักเรียนเข้าร่วมด้วยรหัสห้องเรียน',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {steps.map(step => {
        const Icon = step.icon
        return (
          <Link key={step.href} href={step.href}>
            <Card
              radius="md"
              padding="lg"
              interactive
              className={cn('h-full relative overflow-hidden', step.accent.border)}
            >
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute -right-6 -top-6 w-20 h-20 rounded-full blur-2xl',
                  step.accent.glow
                )}
              />
              <div className="relative">
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-3', step.accent.chip)}>
                  <Icon className="w-4 h-4" />
                </div>
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{step.desc}</p>
              </div>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
