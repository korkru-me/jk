export const GROUP_WORK_BUCKET = 'classroom-group-work'
export const GROUP_WORK_FILE_MAX = 10 * 1024 * 1024
export const GROUP_WORK_FILE_COUNT = 10
const GROUP_WORK_FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  txt: 'text/plain', csv: 'text/csv', zip: 'application/zip',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
export const GROUP_WORK_FILE_ACCEPT = Object.keys(GROUP_WORK_FILE_TYPES).map(ext => `.${ext}`).join(',')
export const groupWorkFileType = (name: string) => GROUP_WORK_FILE_TYPES[name.split('.').at(-1)?.toLowerCase() ?? '']
export const isGroupWorkId = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
export const groupWorkHref = (room: string, work?: string) => `/classrooms/${encodeURIComponent(room)}/group-work${work ? `?work=${encodeURIComponent(work)}` : ''}`

export interface GroupWork {
  id: string
  classroom_id: string
  title: string
  instructions: string
  mode: 'group' | 'solo'
  min_members: number
  max_members: number
  max_score: number
  due_at: string | null
}
export interface GroupWorkMember { id: string; name: string; number: number | null }
export interface GroupWorkPeer extends GroupWorkMember { submitted: boolean }
export interface GroupWorkFile { path: string; name: string; kind: 'image' | 'pdf' | 'download' }
export interface GroupWorkSubmission {
  id: string
  submitted_by: string | null
  response: string
  submitted_at: string
  published_score: number | null
  published_feedback: string | null
  published_at: string | null
  draft_score: number | null
  draft_feedback: string | null
  revision: number | null
  members: GroupWorkMember[]
  files: GroupWorkFile[]
}
export interface GroupWorkContext { role: 'teacher' | 'student'; roomName: string; actorId: string }
export interface GroupWorkList extends GroupWorkContext { works: GroupWork[] }
export interface GroupWorkDetail extends GroupWorkContext { work: GroupWork; roster: GroupWorkPeer[]; submissions: GroupWorkSubmission[] }
export type GroupWorkPageData = GroupWorkList | GroupWorkDetail
export const formatGroupWorkTime = (value: string) => new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value))
export const groupWorkError = (message: string | undefined) => {
  switch (message) {
    case 'GROUP_WORK_ACCESS': case 'GROUP_WORK_UNAVAILABLE': return 'คุณไม่มีสิทธิ์เข้าถึงงานนี้ หรือห้องนี้ไม่เปิดใช้งาน'
    case 'GROUP_WORK_RANGE': return 'จำนวนสมาชิกไม่ตรงกับเงื่อนไข หรือห้องมีนักเรียนไม่พอ'
    case 'GROUP_WORK_ROSTER': return 'รายชื่อซ้ำหรือมีนักเรียนนอกห้อง โปรดตรวจรายชื่ออีกครั้ง'
    case 'GROUP_WORK_ALREADY_SUBMITTED': return 'มีสมาชิกส่งงานนี้แล้ว โปรดอัปเดตรายชื่อและลองอีกครั้ง'
    case 'GROUP_WORK_CONTENT': return 'เขียนคำตอบหรือแนบไฟล์อย่างน้อยหนึ่งไฟล์ แนบได้ไม่เกิน 10 ไฟล์'
    case 'GROUP_WORK_UPLOAD_LIMIT': return 'ใช้โควตาการแนบไฟล์สำหรับงานนี้ครบแล้ว ใช้ไฟล์ที่แนบไว้หรือส่งเป็นคำตอบเขียน'
    case 'GROUP_WORK_FILE': return 'มีไฟล์ที่อัปโหลดไม่สำเร็จหรือไม่อยู่ในงานนี้'
    case 'GROUP_WORK_SCORE': return 'คะแนนหรือข้อเสนอแนะไม่ถูกต้อง'
    case 'GROUP_WORK_STALE_GRADE': return 'มีผู้แก้คะแนนแล้ว กรุณาเปิดผลงานล่าสุดก่อนบันทึกอีกครั้ง'
    case 'GROUP_WORK_INVALID': return 'รายละเอียดไม่ถูกต้อง กรุณาตรวจข้อมูลอีกครั้ง'
    default: return 'ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง'
  }
}
