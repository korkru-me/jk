/**
 * Original KorKru classroom-cover illustrations.
 *
 * The keys are persisted in classroom description metadata, so keep them
 * stable. The artwork itself is rendered by ClassroomCoverPattern and always
 * inherits the room colour through currentColor.
 */
export const CLASSROOM_COVER_PATTERN_OPTIONS = [
  { key: 'physics' },
  { key: 'chemistry' },
  { key: 'biology' },
  { key: 'astronomy' },
  { key: 'earth' },
  { key: 'classroom' },
  { key: 'thai' },
  { key: 'foreign-language' },
  { key: 'social-studies' },
  { key: 'physical-education' },
  { key: 'korkru-deer' },
] as const

export type ClassroomCoverPatternKey = typeof CLASSROOM_COVER_PATTERN_OPTIONS[number]['key']

export const DEFAULT_CLASSROOM_COVER_PATTERN: ClassroomCoverPatternKey = 'classroom'

export function isClassroomCoverPatternKey(value: unknown): value is ClassroomCoverPatternKey {
  return typeof value === 'string'
    && CLASSROOM_COVER_PATTERN_OPTIONS.some(option => option.key === value)
}

export function classroomCoverPatternKey(value: unknown): ClassroomCoverPatternKey {
  return isClassroomCoverPatternKey(value) ? value : DEFAULT_CLASSROOM_COVER_PATTERN
}

export function randomClassroomCoverPatternKey(random = Math.random): ClassroomCoverPatternKey {
  const index = Math.floor(random() * CLASSROOM_COVER_PATTERN_OPTIONS.length)
  return CLASSROOM_COVER_PATTERN_OPTIONS[index]?.key ?? DEFAULT_CLASSROOM_COVER_PATTERN
}
