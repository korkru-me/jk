/**
 * Original KorKru classroom-cover illustrations.
 *
 * The keys are persisted in classroom description metadata, so keep them
 * stable. The artwork itself is rendered by ClassroomCoverPattern and always
 * inherits the room colour through currentColor.
 */
export const CLASSROOM_COVER_PATTERN_OPTIONS = [
  { key: 'physics', label: 'ฟิสิกส์', description: 'แรง การเคลื่อนที่ และลูกตุ้ม' },
  { key: 'chemistry', label: 'เคมี', description: 'การทดลองและปฏิกิริยา' },
  { key: 'biology', label: 'ชีววิทยา', description: 'การเติบโตและโครงสร้างชีวิต' },
  { key: 'astronomy', label: 'ดาราศาสตร์', description: 'ดวงจันทร์ ดาว และเส้นขอบฟ้า' },
  { key: 'earth', label: 'โลกและภูมิศาสตร์', description: 'โลก แผนที่ และตำแหน่ง' },
  { key: 'classroom', label: 'ห้องเรียน', description: 'กระดานและพื้นที่เรียนรู้' },
  { key: 'thai', label: 'ภาษาไทย', description: 'อักษรไทยและการเขียน' },
  { key: 'foreign-language', label: 'ภาษาต่างประเทศ', description: 'ภาษาและบทสนทนา' },
  { key: 'social-studies', label: 'สังคมศึกษา', description: 'ผู้คน ชุมชน และประวัติศาสตร์' },
  { key: 'physical-education', label: 'พลศึกษา', description: 'การเคลื่อนไหวและกีฬา' },
  { key: 'korkru-deer', label: 'กวาง KorKru', description: 'กวางจากอัตลักษณ์ของ KorKru' },
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
