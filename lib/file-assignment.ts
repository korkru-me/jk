import { normalizeAssignmentLateSchedule } from './late-submission'
import { parseSubmittedFiles } from '@/lib/exam-attachment'
import type { SubmittedFile } from '@/lib/types'
import type { ExerciseGroupContext } from '@/lib/exercise-group'
import { exerciseGroupRangeError } from '@/lib/exercise-group'

export interface FileAssignmentGroupInput {
  submission_mode?: 'solo' | 'group'
  group_min_members?: number | null
  group_max_members?: number | null
}

export function fileAssignmentGroupSettings(input: FileAssignmentGroupInput) {
  if (input.submission_mode != null && !['solo', 'group'].includes(input.submission_mode)) return { error: 'รูปแบบการส่งงานไม่ถูกต้อง' } as const
  if (input.submission_mode !== 'group') return { submission_mode: 'solo' as const, group_min_members: null, group_max_members: null }
  const error = exerciseGroupRangeError(input.group_min_members ?? NaN, input.group_max_members ?? NaN)
  return error ? { error } : { submission_mode: 'group' as const, group_min_members: input.group_min_members!, group_max_members: input.group_max_members! }
}

export const FILE_ASSIGNMENT_LABEL = 'งานอัปโหลดไฟล์'
export const MAX_SUBMISSION_FILES = 10
export const MAX_FILE_ASSIGNMENT_TEXT_LENGTH = 20_000
export const MAX_FILE_ASSIGNMENT_LINK_LENGTH = 2_000

export interface FileAssignmentResponse {
  text: string
  link: string
  files: SubmittedFile[]
}

export const EMPTY_FILE_ASSIGNMENT_RESPONSE: FileAssignmentResponse = { text: '', link: '', files: [] }

export function normalizeFileAssignmentLink(value: string): string | null {
  const link = value.trim()
  if (link.length > MAX_FILE_ASSIGNMENT_LINK_LENGTH || !/^https?:\/\//i.test(link) || /[\s\\\u0000-\u001f\u007f]/u.test(link)) return null
  try {
    const url = new URL(link)
    return url.hostname && !url.username && !url.password && url.href.length <= MAX_FILE_ASSIGNMENT_LINK_LENGTH ? url.href : null
  } catch {
    return null
  }
}

/** The previous array-only format remains valid for drafts and graded work. */
export function parseFileAssignmentResponse(value: string | null | undefined): FileAssignmentResponse | null {
  let parsed: unknown
  try { parsed = value ? JSON.parse(value) : [] } catch { return null }
  if (Array.isArray(parsed)) {
    const files = parseSubmittedFiles(parsed)
    return files ? { ...EMPTY_FILE_ASSIGNMENT_RESPONSE, files } : null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const { version, text, link, files: rawFiles } = parsed as Record<string, unknown>
  if (version !== 1 || typeof text !== 'string' || text.length > MAX_FILE_ASSIGNMENT_TEXT_LENGTH || typeof link !== 'string') return null
  const normalizedLink = link.trim() ? normalizeFileAssignmentLink(link) : ''
  const files = Array.isArray(rawFiles) ? parseSubmittedFiles(rawFiles) : null
  if (normalizedLink === null || !files) return null
  return { text: text.trim(), link: normalizedLink, files }
}

export function serializeFileAssignmentResponse({ text, link, files }: FileAssignmentResponse): string {
  return JSON.stringify(text || link ? { version: 1, text, link, files } : files)
}

export function hasFileAssignmentResponse(response: FileAssignmentResponse): boolean {
  return Boolean(response.text.trim() || response.link.trim() || response.files.length)
}

export function fileAssignmentSubmitError(response: FileAssignmentResponse | null): string | null {
  if (!response) return 'อ่านคำตอบไม่สำเร็จ กรุณาลองบันทึกใหม่'
  if (response.files.length > MAX_SUBMISSION_FILES) return `แนบไฟล์ PDF และรูปได้รวมกันไม่เกิน ${MAX_SUBMISSION_FILES} ไฟล์`
  if (!hasFileAssignmentResponse(response)) return 'กรุณาพิมพ์คำตอบ ใส่ลิงก์ หรือแนบไฟล์อย่างน้อยหนึ่งอย่าง'
  return null
}

export interface FileAssignmentView {
  groupWork?: ExerciseGroupContext
  groupMembers?: string[]
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
  submission: { id: string; answerId: string; status: string; response: FileAssignmentResponse; score: number | null; submittedAt: string | null } | null
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
  submissionMode?: 'solo' | 'group'
  assignmentStatus: string
  submissionStatus: string
  dueAt: string | null
  endAt: string | null
  reviewed: boolean
}, now = Date.now()): string | null {
  if (input.reviewed || input.submissionStatus === 'graded') return 'ครูตรวจงานแล้ว จึงไม่สามารถถอนส่งได้'
  if (input.submissionMode === 'group') return 'งานกลุ่มส่งร่วมกันแล้ว หากต้องแก้ไขให้ติดต่อครูผู้สอน'
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
