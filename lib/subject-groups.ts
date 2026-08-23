/**
 * กลุ่มสาระการเรียนรู้ที่ครูผู้สอนเลือกตอนสมัครสมาชิก
 *
 * เก็บลงฐานข้อมูลเป็น slug (คอลัมน์ users.subject_group) ส่วน 'other'
 * ให้กรอกข้อความเองแล้วเก็บใน users.subject_group_other
 *
 * วิทยาศาสตร์และเทคโนโลยีแยกเป็นรายวิชาย่อย เพราะคลังข้อสอบตั้งต้นจาก
 * ฟิสิกส์ และต้องรู้ว่าครูที่เข้ามาสอนวิชาไหนในกลุ่มสาระเดียวกัน
 *
 * เรียงเป็นรายการเดียวไม่แบ่งหัวข้อย่อย — ทุกกลุ่มสาระอยู่ระดับเดียวกัน
 */

export const SUBJECT_GROUPS = [
  { value: 'science_physics', label: 'วิทยาศาสตร์และเทคโนโลยี (ฟิสิกส์)' },
  { value: 'science_chemistry', label: 'วิทยาศาสตร์และเทคโนโลยี (เคมี)' },
  { value: 'science_biology', label: 'วิทยาศาสตร์และเทคโนโลยี (ชีววิทยา)' },
  { value: 'science_general', label: 'วิทยาศาสตร์และเทคโนโลยี (วิทยาศาสตร์ทั่วไป)' },
  { value: 'math', label: 'คณิตศาสตร์' },
  { value: 'arts', label: 'ศิลปะ' },
  { value: 'thai', label: 'ภาษาไทย' },
  { value: 'foreign_language', label: 'ภาษาต่างประเทศ' },
  { value: 'social_studies', label: 'สังคมศึกษา ศาสนา และวัฒนธรรม' },
  { value: 'occupations', label: 'การงานอาชีพและเทคโนโลยี' },
  { value: 'health_pe', label: 'สุขศึกษาและพลศึกษา' },
  { value: 'other', label: 'อื่นๆ (โปรดระบุ)' },
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
