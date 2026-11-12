import { normalizeAssignmentLateSchedule } from './late-submission'
import type { SubmittedFile } from '@/lib/types'

export const FILE_ASSIGNMENT_LABEL = 'งานส่งไฟล์'
export const MAX_SUBMISSION_FILES = 10
export interface FileAssignmentView {
  id: string
  title: string
  classroomId: string
  instructions: string
  attachments: string[]
  maxScore: number
  startAt: string | null
  dueAt: string | null
  endAt: string | null
  status: string
  submission: { id: string; answerId: string; status: string; files: SubmittedFile[]; score: number | null; submittedAt: string | null } | null
  withdrawalError: string | null
}
export function normalizeFileAssignmentLateSchedule(
  dueAt: string | null,
  startAt: string | null = null,
  endAt: string | null = null,
) {
  return normalizeAssignmentLateSchedule({
    dueAt,
    startAt,
    endAt,
    bands: dueAt ? [{ starts_at: dueAt, label: 'ส่งช้า', color: 'orange' }] : [],
  }, { requireClose: false })
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const MARKER = new RegExp(`^<!--korkru:file-assignment:v1:(${UUID})-->`, 'i')

/** Assignment-owned content uses the existing rich-text/JSON metadata channels. */
export function fileAssignmentDescription(id: string, sanitizedInstructions: string): string {
  return `<!--korkru:file-assignment:v1:${id}--><div>${sanitizedInstructions}</div>`
}

export function isFileAssignment(assignment: { id?: string; description?: string | null }): boolean {
  const match = assignment.description?.match(MARKER)
  return Boolean(match && (!assignment.id || match[1] === assignment.id))
}

export function fileAssignmentQuestionOwner(extraData: unknown): string | null {
  if (!extraData || typeof extraData !== 'object' || Array.isArray(extraData)) return null
  const id = (extraData as Record<string, unknown>).file_assignment_id
  return typeof id === 'string' && new RegExp(`^${UUID}$`, 'i').test(id) ? id : null
}

export function fileAssignmentWithdrawalError(input: {
  assignmentStatus: string
  submissionStatus: string
  dueAt: string | null
  endAt: string | null
  reviewed: boolean
}, now = Date.now()): string | null {
  if (input.reviewed || input.submissionStatus === 'graded') return 'ครูตรวจงานแล้ว จึงไม่สามารถถอนส่งได้'
  if (input.submissionStatus !== 'submitted') return 'งานนี้ไม่ได้อยู่ในสถานะส่งแล้ว'
  if (input.assignmentStatus !== 'published') return 'งานนี้ปิดรับแล้ว จึงไม่สามารถถอนส่งได้'
  const deadlines = [input.dueAt, input.endAt].filter((value): value is string => Boolean(value))
  if (deadlines.some(value => !Number.isFinite(Date.parse(value)) || Date.parse(value) <= now)) {
    return 'พ้นกำหนดส่งแล้ว จึงไม่สามารถถอนส่งได้'
  }
  return null
}

/** Old responses remain readable/removable; new references must fit ten slots. */
export function submissionFileLimitError(next: SubmittedFile[], previous: SubmittedFile[] = []): string | null {
  const oldUrls = new Set(previous.map(file => file.url))
  const nextUrls = new Set(next.map(file => file.url))
  return nextUrls.size > MAX_SUBMISSION_FILES && [...nextUrls].some(url => !oldUrls.has(url))
    ? `แนบได้สูงสุด ${MAX_SUBMISSION_FILES} ไฟล์ต่อข้อ กรุณารวมรูปภาพหรือเอกสารเป็น PDF ไฟล์เดียวก่อนแนบ`
    : null
}
