import { z } from 'zod'

export const PRACTICE_EXERCISE_MAX_QUESTIONS = 500
export const practiceExerciseSchema = z.object({
  id: z.string().uuid(),
  libraryId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  questionIds: z.array(z.string().uuid()).min(1).max(PRACTICE_EXERCISE_MAX_QUESTIONS)
    .refine(ids => new Set(ids).size === ids.length),
}).strict()

export const practiceExerciseUpdateSchema = practiceExerciseSchema.extend({
  expectedRevision: z.number().int().positive().max(2147483647),
})
export const practiceExerciseDeleteSchema = practiceExerciseUpdateSchema.pick({
  id: true, libraryId: true, expectedRevision: true,
})
export const practiceReviewPinSchema = z.object({
  libraryId: z.string().uuid(),
  questionId: z.string().uuid(),
  pinned: z.boolean(),
}).strict()

export const practiceExerciseDtoSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(120),
  questionIds: z.array(z.string().uuid()).min(1).max(PRACTICE_EXERCISE_MAX_QUESTIONS),
  attemptedCount: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  questionTitles: z.record(z.string().uuid(), z.string()),
}).strict().refine(group => group.attemptedCount <= group.questionIds.length
  && new Set(group.questionIds).size === group.questionIds.length
  && group.questionIds.every(id => typeof group.questionTitles[id] === 'string'))

export interface PracticeExercise {
  id: string
  title: string
  questionIds: string[]
  attemptedCount: number
  revision: number
  questionTitles: Record<string, string>
}
