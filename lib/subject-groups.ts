/**
 * กลุ่มสาระการเรียนรู้ที่ครูผู้สอนเลือกตอนสมัครสมาชิก
 *
 * เก็บลงฐานข้อมูลเป็น slug (คอลัมน์ users.subject_group) ส่วน 'other'
 * ให้กรอกข้อความเองแล้วเก็บใน users.subject_group_other
 *
 * วิทยาศาสตร์และเทคโนโลยีแยกเป็นรายวิชาย่อย เพราะคลังข้อสอบตั้งต้นจาก
 * ฟิสิกส์ และต้องรู้ว่าครูที่เข้ามาสอนวิชาไหนในกลุ่มสาระเดียวกัน
 */

export const SUBJECT_GROUPS = [
  { value: 'science_physics', label: 'วิทยาศาสตร์และเทคโนโลยี (ฟิสิกส์)', group: 'science' },
  { value: 'science_chemistry', label: 'วิทยาศาสตร์และเทคโนโลยี (เคมี)', group: 'science' },
  { value: 'science_biology', label: 'วิทยาศาสตร์และเทคโนโลยี (ชีววิทยา)', group: 'science' },
  { value: 'science_general', label: 'วิทยาศาสตร์และเทคโนโลยี (วิทยาศาสตร์ทั่วไป)', group: 'science' },
  { value: 'math', label: 'คณิตศาสตร์', group: 'other' },
  { value: 'arts', label: 'ศิลปะ', group: 'other' },
  { value: 'thai', label: 'ภาษาไทย', group: 'other' },
  { value: 'foreign_language', label: 'ภาษาต่างประเทศ', group: 'other' },
  { value: 'social_studies', label: 'สังคมศึกษา ศาสนา และวัฒนธรรม', group: 'other' },
  { value: 'occupations', label: 'การงานอาชีพและเทคโนโลยี', group: 'other' },
  { value: 'health_pe', label: 'สุขศึกษาและพลศึกษา', group: 'other' },
  { value: 'other', label: 'อื่นๆ (โปรดระบุ)', group: 'other' },
] as const

export type SubjectGroup = (typeof SUBJECT_GROUPS)[number]['value']

export const SUBJECT_GROUP_VALUES = SUBJECT_GROUPS.map((s) => s.value) as readonly SubjectGroup[]

export function isSubjectGroup(value: string): value is SubjectGroup {
  return (SUBJECT_GROUP_VALUES as readonly string[]).includes(value)
}

/** ชื่อกลุ่มสาระสำหรับแสดงผล — 'other' คืนข้อความที่ครูกรอกเองถ้ามี */
export function subjectGroupLabel(
  value: string | null,
  custom?: string | null,
): string | null {
  if (!value) return null
  if (value === 'other') return custom?.trim() || 'อื่นๆ'
  return SUBJECT_GROUPS.find((s) => s.value === value)?.label ?? null
}
