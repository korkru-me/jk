import { BookOpenCheck, ClipboardPenLine, NotebookPen, type LucideIcon } from 'lucide-react'

export type WorkType = 'exercise' | 'exam' | 'practice'
export type WorkTypeVariant = 'workExercise' | 'workExam' | 'workPractice'

/** Stable work identity; status and classroom colours have separate meanings. */
export interface AssignmentTypeMeta {
  label: string
  bg: string
  text: string
  icon: LucideIcon
  variant: WorkTypeVariant
  toggle: string
}

export const WORK_TYPE_CFG: Record<WorkType, AssignmentTypeMeta> = {
  exercise: {
    label: 'แบบฝึกหัด',
    bg: 'bg-work-exercise/10',
    text: 'text-work-exercise',
    icon: NotebookPen,
    variant: 'workExercise',
    toggle: 'text-work-exercise hover:bg-work-exercise/10 hover:text-work-exercise aria-pressed:bg-work-exercise aria-pressed:text-work-foreground aria-pressed:hover:bg-work-exercise aria-pressed:hover:text-work-foreground data-[state=on]:bg-work-exercise data-[state=on]:text-work-foreground',
  },
  exam: {
    label: 'ข้อสอบ',
    bg: 'bg-work-exam/10',
    text: 'text-work-exam',
    icon: ClipboardPenLine,
    variant: 'workExam',
    toggle: 'text-work-exam hover:bg-work-exam/10 hover:text-work-exam aria-pressed:bg-work-exam aria-pressed:text-work-foreground aria-pressed:hover:bg-work-exam aria-pressed:hover:text-work-foreground data-[state=on]:bg-work-exam data-[state=on]:text-work-foreground',
  },
  practice: {
    label: 'คลังฝึก',
    bg: 'bg-work-practice/10',
    text: 'text-work-practice',
    icon: BookOpenCheck,
    variant: 'workPractice',
    toggle: 'text-work-practice hover:bg-work-practice/10 hover:text-work-practice aria-pressed:bg-work-practice aria-pressed:text-work-foreground aria-pressed:hover:bg-work-practice aria-pressed:hover:text-work-foreground data-[state=on]:bg-work-practice data-[state=on]:text-work-foreground',
  },
}

/** Retained for existing assignment list consumers. */
export const TYPE_CFG: Record<string, AssignmentTypeMeta> = WORK_TYPE_CFG

export function workTypeConfig(type: string): AssignmentTypeMeta {
  return TYPE_CFG[type] ?? WORK_TYPE_CFG.exam
}

export const ExerciseIcon = WORK_TYPE_CFG.exercise.icon
export const ExamIcon = WORK_TYPE_CFG.exam.icon
export const PracticeIcon = WORK_TYPE_CFG.practice.icon
