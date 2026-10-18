/** A private draft is owned by the authenticated grader, never by a browser
 * supplied actor. Omitted score components remain untouched on publication. */
export interface GradingDraftItem {
  answerId: string
  expectedScoreEditedAt: string | null
  expectedDraftUpdatedAt: string | null
  answerScore?: number
  workScore?: number
  /** Save-only: remove this exact version of the grader's private draft. */
  remove?: true
}

export interface GradingSavedDraft {
  answerId: string
  expectedScoreEditedAt: string | null
  updatedAt: string
  answerScore?: number
  workScore?: number
}

export interface SaveGradingDraftsInput {
  assignmentId: string
  /** Reuse this UUID with the identical payload after an ambiguous failure. */
  requestId: string
  items: GradingDraftItem[]
}
export interface PublishGradingDraftsInput extends SaveGradingDraftsInput {
  confirmed: true
}
export interface PublishedGradingAnswer {
  answerId: string
  submissionId: string
  scoreEditedAt: string
}
export interface GradingDraftError {
  error: string
  code?: 'permission' | 'validation' | 'conflict' | 'unavailable' | 'connection'
}
export type SaveGradingDraftsResult = GradingDraftError | {
  success: true
  requestId: string
  drafts: GradingSavedDraft[]
  deletedDraftIds: string[]
}
export type PublishGradingDraftsResult = GradingDraftError | {
  success: true
  requestId: string
  published: PublishedGradingAnswer[]
  deletedDraftIds: string[]
  notificationCount: number
}
