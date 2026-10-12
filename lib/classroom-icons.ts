/** Stable, presentation-only keys. Teachers may choose any icon for any room. */
export const CLASSROOM_ICON_OPTIONS = [
  { key: 'school', label: 'อาคารเรียน' },
  { key: 'physics', label: 'อะตอม' },
  { key: 'mathematics', label: 'เครื่องคิดเลข' },
  { key: 'technology', label: 'ชิป' },
  { key: 'laboratory', label: 'กล้องจุลทรรศน์' },
  { key: 'chemistry', label: 'ขวดทดลอง' },
  { key: 'plant-biology', label: 'ต้นอ่อน' },
  { key: 'animal-biology', label: 'อุ้งเท้า' },
  { key: 'science', label: 'หลอดทดลอง' },
  { key: 'astronomy', label: 'กล้องดูดาว' },
  { key: 'earth-science', label: 'โลก' },
  { key: 'thai', label: 'ตัวอักษร ก' },
  { key: 'english', label: 'ตัวอักษร A' },
  { key: 'social-studies', label: 'อาคารเสา' },
  { key: 'religion', label: 'มือและหัวใจ' },
  { key: 'art', label: 'จานสี' },
  { key: 'music', label: 'โน้ตดนตรี' },
  { key: 'physical-education', label: 'ดัมเบล' },
  { key: 'chinese', label: 'ตัวอักษร 中' },
  { key: 'korean', label: 'ตัวอักษร 한' },
  { key: 'japanese', label: 'ตัวอักษร あ' },
] as const

export type ClassroomIconKey = typeof CLASSROOM_ICON_OPTIONS[number]['key']
export const DEFAULT_CLASSROOM_ICON: ClassroomIconKey = 'school'

export function isClassroomIconKey(value: unknown): value is ClassroomIconKey {
  return typeof value === 'string' && CLASSROOM_ICON_OPTIONS.some(option => option.key === value)
}

/** Missing or unknown historical metadata always renders the existing school. */
export function classroomIconKey(value: unknown): ClassroomIconKey {
  return isClassroomIconKey(value) ? value : DEFAULT_CLASSROOM_ICON
}
