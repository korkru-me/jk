/**
 * Original KorKru classroom-cover illustrations.
 *
 * The keys are persisted in classroom description metadata, so keep them
 * stable. The artwork itself is rendered by ClassroomCoverPattern and always
 * inherits the room colour through currentColor.
 */
export const CLASSROOM_COVER_PATTERN_OPTIONS = [
  { key: 'physics', label: 'ฟิสิกส์', description: 'แรง คลื่น และการเคลื่อนที่' },
  { key: 'chemistry', label: 'เคมี', description: 'ภาชนะทดลองและพันธะโมเลกุล' },
  { key: 'biology', label: 'ชีววิทยา', description: 'เซลล์ ใบไม้ และสายดีเอ็นเอ' },
  { key: 'astronomy', label: 'ดาราศาสตร์', description: 'กล้องดูดาว วงโคจร และกลุ่มดาว' },
  { key: 'earth', label: 'โลกและภูมิศาสตร์', description: 'ภูเขา ชั้นภูมิประเทศ และเส้นแผนที่' },
  { key: 'classroom', label: 'ห้องเรียน', description: 'กระดาน โต๊ะเรียน และหนังสือ' },
  { key: 'thai', label: 'ภาษาไทย', description: 'อักษรไทย หนังสือ และจังหวะการเขียน' },
  { key: 'foreign-language', label: 'ภาษาต่างประเทศ', description: 'ฟองสนทนา ตัวอักษร และการสื่อสาร' },
  { key: 'social-studies', label: 'สังคมศึกษา', description: 'ชุมชน หลักฐาน และเส้นทางประวัติศาสตร์' },
  { key: 'physical-education', label: 'พลศึกษา', description: 'สนาม ลูกบอล และการเคลื่อนไหว' },
  { key: 'korkru-deer', label: 'กวาง KorKru', description: 'ลายกวางจากอัตลักษณ์ของ KorKru' },
] as const

export type ClassroomCoverPatternKey = typeof CLASSROOM_COVER_PATTERN_OPTIONS[number]['key']

export const DEFAULT_CLASSROOM_COVER_PATTERN: ClassroomCoverPatternKey = 'classroom'

export function isClassroomCoverPatternKey(value: unknown): value is ClassroomCoverPatternKey {
  return typeof value === 'string'
    && CLASSROOM_COVER_PATTERN_OPTIONS.some(option => option.key === value)
}

export function classroomCoverPatternKey(value: unknown): ClassroomCoverPatternKey {
  return isClassroomCoverPatternKey(value) ? value : DEFAULT_CLASSROOM_COVER_PATTERN
}
