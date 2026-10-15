import { z } from 'zod'

export const PRACTICE_EXERCISE_PAGE_SIZES = [1, 3, 5, 10] as const
export const PRACTICE_EXERCISE_THEMES = ['blue', 'sky', 'mint', 'green', 'amber', 'orange', 'red', 'purple', 'slate'] as const
export const practiceExerciseSettingsSchema = z.object({
  questionsPerPage: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(10)]),
  theme: z.enum(PRACTICE_EXERCISE_THEMES),
}).strict()
export type PracticeExerciseSettings = z.infer<typeof practiceExerciseSettingsSchema>
export type PracticeExerciseSettingsMap = Record<string, PracticeExerciseSettings>
const storedSettingsSchema = z.record(z.string().uuid(), practiceExerciseSettingsSchema)
  .refine(value => Object.keys(value).length <= 1000)

export function practiceExerciseSettingsKey(ownerId: string, libraryId: string) {
  return `korkru:practice-exercise-settings:${ownerId}:${libraryId}`
}

/** Presentation only: this storage never contains answers, grades or permission flags. */
export function readPracticeExerciseSettings(storage: Pick<Storage, 'getItem'>, ownerId: string, libraryId: string): PracticeExerciseSettingsMap {
  const raw: unknown = JSON.parse(storage.getItem(practiceExerciseSettingsKey(ownerId, libraryId)) || '{}')
  const parsed = storedSettingsSchema.safeParse(raw)
  return parsed.success ? parsed.data : {}
}

export function writePracticeExerciseSettings(storage: Pick<Storage, 'getItem' | 'setItem'>, ownerId: string, libraryId: string, exerciseId: string, settings: PracticeExerciseSettings) {
  const current = readPracticeExerciseSettings(storage, ownerId, libraryId)
  const next = storedSettingsSchema.parse({ ...current, [exerciseId]: practiceExerciseSettingsSchema.parse(settings) })
  storage.setItem(practiceExerciseSettingsKey(ownerId, libraryId), JSON.stringify(next))
  return next
}

export function defaultPracticeExerciseSettings(exerciseId: string): PracticeExerciseSettings {
  const seed = [...exerciseId].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return { questionsPerPage: 1, theme: PRACTICE_EXERCISE_THEMES[seed % PRACTICE_EXERCISE_THEMES.length] }
}

export function randomPracticeExerciseTheme(random = Math.random): PracticeExerciseSettings['theme'] {
  return PRACTICE_EXERCISE_THEMES[Math.min(PRACTICE_EXERCISE_THEMES.length - 1, Math.max(0, Math.floor(random() * PRACTICE_EXERCISE_THEMES.length)))]
}

export function practiceExercisePage(questionIds: readonly string[], currentIndex: number, perPage: number) {
  const size = PRACTICE_EXERCISE_PAGE_SIZES.includes(perPage as typeof PRACTICE_EXERCISE_PAGE_SIZES[number]) ? perPage : 1
  const index = Math.max(0, Math.min(questionIds.length - 1, Math.trunc(currentIndex) || 0))
  const start = Math.floor(index / size) * size
  return { start, ids: questionIds.slice(start, start + size), page: Math.floor(start / size) + 1, totalPages: Math.max(1, Math.ceil(questionIds.length / size)) }
}
