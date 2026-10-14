import { z } from 'zod'

export const PRACTICE_EXERCISE_MAX_QUESTIONS = 500
export const practiceExerciseSchema = z.object({
  id: z.string().uuid(),
  libraryId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  questionIds: z.array(z.string().uuid()).min(1).max(PRACTICE_EXERCISE_MAX_QUESTIONS)
    .refine(ids => new Set(ids).size === ids.length),
}).strict()

export interface PracticeExercise {
  id: string
  title: string
  questionIds: string[]
  attemptedCount: number
}
