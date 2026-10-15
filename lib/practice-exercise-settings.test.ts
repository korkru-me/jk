import { describe, expect, it } from 'vitest'
import { defaultPracticeExerciseSettings, practiceExercisePage, practiceExerciseSettingsKey, practiceExerciseSettingsSchema, randomPracticeExerciseTheme, readPracticeExerciseSettings, writePracticeExerciseSettings } from './practice-exercise-settings'

const owner = '00000000-0000-4000-8300-000000000001'
const library = '00000000-0000-4000-8300-000000000002'
const group = '00000000-0000-4000-8400-000000000001'
describe('personal practice presentation', () => {
  it('keeps account/library preferences separate and preserves other exercises', () => {
    const data = new Map<string, string>()
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
    writePracticeExerciseSettings(storage, owner, library, group, { questionsPerPage: 3, theme: 'mint' })
    writePracticeExerciseSettings(storage, owner, library, owner, { questionsPerPage: 5, theme: 'purple' })
    expect(readPracticeExerciseSettings(storage, owner, library)[group]).toEqual({ questionsPerPage: 3, theme: 'mint' })
    expect(readPracticeExerciseSettings(storage, library, library)).toEqual({})
    expect(readPracticeExerciseSettings(storage, owner, owner)).toEqual({})
    expect(practiceExerciseSettingsKey(owner, library)).not.toBe(practiceExerciseSettingsKey(library, owner))
  })
  it('rejects invalid pagination and settings that contain answers or permission flags', () => {
    for (const value of [0, -1, 2, 500, NaN]) expect(practiceExerciseSettingsSchema.safeParse({ questionsPerPage: value, theme: 'mint' }).success).toBe(false)
    for (const key of ['answers', 'revealAnswerKey', 'calculatorEnabled', 'score']) expect(practiceExerciseSettingsSchema.safeParse({ questionsPerPage: 1, theme: 'blue', [key]: true }).success).toBe(false)
    expect(practiceExerciseSettingsSchema.safeParse({ questionsPerPage: 1, theme: 'javascript:alert(1)' }).success).toBe(false)
  })
  it('keeps legacy defaults stable and picks valid colors at random boundaries', () => {
    expect(defaultPracticeExerciseSettings(group)).toEqual(defaultPracticeExerciseSettings(group))
    expect(randomPracticeExerciseTheme(() => 0)).toBe('blue')
    expect(randomPracticeExerciseTheme(() => 0.999)).toBe('slate')
  })
  it('navigates to the page containing a question without dropping the partial final page', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    expect(practiceExercisePage(ids, 4, 3)).toEqual({ start: 3, ids: ['d', 'e', 'f'], page: 2, totalPages: 3 })
    expect(practiceExercisePage(ids, 100, 3)).toEqual({ start: 6, ids: ['g'], page: 3, totalPages: 3 })
    expect(practiceExercisePage(ids, -2, 0).ids).toEqual(['a'])
    expect(practiceExercisePage([], 0, 3)).toEqual({ start: 0, ids: [], page: 1, totalPages: 1 })
  })
})
