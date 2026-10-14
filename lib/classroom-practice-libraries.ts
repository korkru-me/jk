import type { PracticeLibraryStatus } from './practice-library-contracts'

/** Metadata only: this list never carries access codes, answers or progress. */
export interface ClassroomPracticeLibraryItem {
  id: string
  title: string
  status: PracticeLibraryStatus
  questionCount: number
}

export interface ClassroomPracticeLibrariesResult {
  items: ClassroomPracticeLibraryItem[]
  error: string | null
}

export function classroomPracticeLibraryItem(input: ClassroomPracticeLibraryItem): ClassroomPracticeLibraryItem {
  return {
    id: input.id,
    title: input.title,
    status: input.status,
    questionCount: Number.isFinite(input.questionCount)
      ? Math.max(0, Math.trunc(input.questionCount))
      : 0,
  }
}
