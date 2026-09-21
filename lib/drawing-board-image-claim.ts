export const QUESTION_IMAGE_CLAIM_VERSION = 1 as const
export const QUESTION_IMAGE_CLAIM_KIND = 'korkru-question-image' as const

export interface QuestionImageClaimPayload {
  version: typeof QUESTION_IMAGE_CLAIM_VERSION
  kind: typeof QUESTION_IMAGE_CLAIM_KIND
  actorId: string
  assignmentId: string
  questionId: string
  sourcePath: string
  sourceSha256: string
  fileId: string
  mimeType: string
  dataSha256: string
  issuedAt: number
  expiresAt: number
}
export interface QuestionImageClaimMetadata {
  version: typeof QUESTION_IMAGE_CLAIM_VERSION
  claim: string
}

export function hasQuestionImageClaimMetadata(value: unknown): value is QuestionImageClaimMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.version === QUESTION_IMAGE_CLAIM_VERSION
    && typeof record.claim === 'string'
    && record.claim.length > 20
}
