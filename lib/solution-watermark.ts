export interface SolutionWatermarkData {
  name: string
  studentCode: string
  classroom: string
  classNumber: string
  /** Server time when the authorized solution view was prepared. */
  issuedAt: string
}

interface IdentityName {
  full_name: string | null
  prefix: string | null
  first_name: string | null
  last_name: string | null
}
interface IdentityClass {
  student_code: string | null
  grade_level: string | null
  section_number: number | null
  class_number: number | null
}

function text(value: string | null | undefined, limit: number): string {
  return Array.from((value ?? '').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim()).slice(0, limit).join('')
}

/** No email, health/contact fields, or answer content belongs in this DTO. */
export function buildSolutionWatermark(name: IdentityName, profile: IdentityClass | null, issuedAt: string): SolutionWatermarkData {
  const prefix = text(name.prefix, 24)
  const parts = [text(name.first_name, 80), text(name.last_name, 80)].filter(Boolean).join(' ')
  const fullName = parts || text(name.full_name, 160) || 'นักเรียน'
  const grade = text(profile?.grade_level, 24)
  const room = profile?.section_number
  return {
    name: prefix && !fullName.startsWith(prefix) ? prefix + fullName : fullName,
    studentCode: text(profile?.student_code, 40) || 'ไม่ระบุ',
    classroom: grade ? `${grade}${room != null ? `/${room}` : ''}` : 'ไม่ระบุ',
    classNumber: profile?.class_number != null ? String(profile.class_number) : 'ไม่ระบุ',
    issuedAt,
  }
}

export function solutionWatermarkLines(data: SolutionWatermarkData, at = data.issuedAt): string[] {
  const date = new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(at))
  return [data.name, `รหัส ${data.studentCode} · ชั้น ${data.classroom} · เลขที่ ${data.classNumber}`, `วันที่ ${date}`]
}
