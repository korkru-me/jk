/**
 * Normalizes assignment-level point overrides before they are trusted by the
 * server. Random-subset assignments are scored by the number of questions
 * answered correctly, so every question in their pool is worth exactly one
 * point regardless of weights submitted by the client.
 */
export function normalizeAssignmentQuestionPoints(
  questionIds: string[],
  requestedPoints: Record<string, number> | null | undefined,
  randomQuestionCount: number | null,
): Record<string, number> | null {
  if (randomQuestionCount !== null) {
    return Object.fromEntries(questionIds.map(questionId => [questionId, 1]))
  }

  const questionIdSet = new Set(questionIds)
  const sanitizedPoints = Object.fromEntries(
    Object.entries(requestedPoints ?? {}).filter(
      ([questionId, points]) => questionIdSet.has(questionId) && Number.isFinite(points) && points > 0,
    ),
  )

  return Object.keys(sanitizedPoints).length > 0 ? sanitizedPoints : null
}
