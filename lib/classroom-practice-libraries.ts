import type { PracticeLibraryStatus } from './practice-library-contracts'

/** Metadata only: this list never carries access codes, answers or progress. */
export interface ClassroomPracticeLibraryItem {
  id: string
  title: string
  status: PracticeLibraryStatus
  questionCount: number
  categoryId?: string | null
  displayOrder?: number | null
}

export interface ClassroomPracticeLibrariesResult {
  items: ClassroomPracticeLibraryItem[]
  error: string | null
  layoutAvailable?: boolean
}

export function classroomPracticeLibraryItem(input: ClassroomPracticeLibraryItem): ClassroomPracticeLibraryItem {
  return {
    id: input.id,
    title: input.title,
    status: input.status,
    questionCount: Number.isFinite(input.questionCount)
      ? Math.max(0, Math.trunc(input.questionCount))
      : 0,
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
  }
}
