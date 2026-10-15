import type { PostAttachment } from '@/lib/attachment-display'

export interface PendingClassroomAnnouncement {
  id: string
  classroomId: string
  classroomName: string
  classroomDescription: string | null
  authorName: string
  body: string
  attachments: PostAttachment[]
  createdAt: string
  editedAt: string | null
  round: number
  remindedAt: string | null
  pinned: boolean
}
export interface AnnouncementAcknowledgementStatus {
  round: number
  remindedAt: string | null
  studentIds: string[]
}
export type AcknowledgeAnnouncementAction = (postId: string, round: number) => Promise<{ success?: true; error?: string; stale?: boolean }>
export type RemindAnnouncementAction = (postId: string) => Promise<{ round?: number; remindedAt?: string; error?: string }>
export const announcementReceiptKey = (postId: string, round: number) => `${postId}:${round}`
export function isAnnouncementAcknowledgementEnabled(environment: NodeJS.ProcessEnv): boolean {
  return environment.CLASSROOM_ANNOUNCEMENT_ACKNOWLEDGEMENTS === 'true'
}
