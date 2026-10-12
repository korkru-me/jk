export interface StudentPracticeLibraryListItem {
  id: string
  title: string
  classroomId: string
  classroomName: string
  questionCount: number
}

export function isEligibleStudentPracticeClassroom(input: {
  status: string
  classroomType: string
}): boolean {
  return input.status === 'active' && input.classroomType === 'subject'
}

/**
 * Explicit construction keeps answer, correctness, score, ranking, and other
 * accidental relation fields outside the student landing RSC payload.
 */
export function studentPracticeLibraryListItem(input: {
  id: string
  title: string
  classroomId: string
  classroomName: string
  questionCount: number
}): StudentPracticeLibraryListItem {
  return Object.freeze({
    id: input.id,
    title: input.title,
    classroomId: input.classroomId,
    classroomName: input.classroomName,
    questionCount: Math.max(0, Math.trunc(input.questionCount)),
  })
}
