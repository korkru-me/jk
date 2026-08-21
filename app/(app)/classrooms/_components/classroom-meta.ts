// The create wizard captures more about a classroom than the `classrooms`
// table has columns for — grade level, term, tags, access type, capacity and
// the open/close dates all get flattened into the free-text `description`.
//
// This module owns that encoding so the wizard and the settings dialog agree
// on it: `composeDescription` writes the string, `parseDescription` reads it
// back. Parsing then composing an untouched classroom must reproduce the
// original string exactly, or editing one field would rewrite the others.

export type AccessType = 'open' | 'request' | 'closed'

export interface ClassroomMeta {
  description: string
  /** id of a COVER_PRESETS entry, or '' when the teacher never picked one. */
  cover: string
  gradeLevel: string
  academicTerm: string
  tags: string[]
  accessType: AccessType
  capacityEnabled: boolean
  maxCapacity: string
  startDate: string
  endDate: string
}

// Cover colours reuse the app's own tint/status tokens, so a classroom cover
// follows the active style preset and the light/dark theme instead of carrying
// its own fixed hexes. Same recipe as the question-type cards: a 10% wash for
// the surface, 20% for the edge, and the full-strength colour for the text on
// top — which is what keeps text and background in the same hue family.
//
// Class strings are written out in full because Tailwind only sees literals.
export interface CoverPreset {
  id: string
  label: string
  /** Filled swatch in the picker. */
  solid: string
  /** Tinted surface + matching edge for the cover itself. */
  surface: string
  /** Heading colour on `surface`. */
  text: string
  /** Secondary colour on `surface`. */
  textMuted: string
}

// Text is the cover's own colour mixed toward `--foreground` rather than the
// colour at full strength: measured on the 10% wash, full-strength tokens land
// between 1.9:1 and 4.5:1, so most of them fail WCAG AA. Mixing keeps the hue
// but drags lightness to the readable side, and because `--foreground` flips
// with the theme the same expression darkens in light mode and lightens in
// dark. Dimming with `opacity` instead was measured too and still failed
// (amber reached only 4.14:1 at 90%), hence a second explicit colour.
// Written out per preset so Tailwind sees every class as a literal.
export const COVER_PRESETS: CoverPreset[] = [
  { id: 'blue', label: 'น้ำเงิน',
    solid: 'bg-tint-1', surface: 'bg-tint-1/10 border-tint-1/20',
    text: 'text-[color-mix(in_oklab,var(--tint-1)_60%,var(--foreground))]',
    textMuted: 'text-[color-mix(in_oklab,var(--tint-1)_45%,var(--foreground))]' },
  { id: 'sky', label: 'ฟ้า',
    solid: 'bg-tint-2', surface: 'bg-tint-2/10 border-tint-2/20',
    text: 'text-[color-mix(in_oklab,var(--tint-2)_60%,var(--foreground))]',
    textMuted: 'text-[color-mix(in_oklab,var(--tint-2)_45%,var(--foreground))]' },
  { id: 'mint', label: 'เขียวมิ้นต์',
    solid: 'bg-tint-4', surface: 'bg-tint-4/10 border-tint-4/20',
    text: 'text-[color-mix(in_oklab,var(--tint-4)_60%,var(--foreground))]',
    textMuted: 'text-[color-mix(in_oklab,var(--tint-4)_45%,var(--foreground))]' },
  { id: 'green', label: 'เขียว',
    solid: 'bg-success', surface: 'bg-success/10 border-success/20',
    text: 'text-[color-mix(in_oklab,var(--success)_60%,var(--foreground))]',
    textMuted: 'text-[color-mix(in_oklab,var(--success)_45%,var(--foreground))]' },
  { id: 'amber', label: 'เหลืองส้ม',
    solid: 'bg-warning', surface: 'bg-warning/10 border-warning/20',
    text: 'text-[color-mix(in_oklab,var(--warning)_60%,var(--foreground))]',
    textMuted: 'text-[color-mix(in_oklab,var(--warning)_45%,var(--foreground))]' },
  { id: 'orange', label: 'ส้ม',
    solid: 'bg-flag', surface: 'bg-flag/10 border-flag/20',
    text: 'text-[color-mix(in_oklab,var(--flag)_60%,var(--foreground))]',
    textMuted: 'text-[color-mix(in_oklab,var(--flag)_45%,var(--foreground))]' },
  { id: 'red', label: 'แดง',
    solid: 'bg-tint-3', surface: 'bg-tint-3/10 border-tint-3/20',
    text: 'text-[color-mix(in_oklab,var(--tint-3)_60%,var(--foreground))]',
    textMuted: 'text-[color-mix(in_oklab,var(--tint-3)_45%,var(--foreground))]' },
  { id: 'purple', label: 'ม่วง',
    solid: 'bg-primary', surface: 'bg-primary/10 border-primary/20',
    text: 'text-[color-mix(in_oklab,var(--primary)_60%,var(--foreground))]',
    textMuted: 'text-[color-mix(in_oklab,var(--primary)_45%,var(--foreground))]' },
  { id: 'slate', label: 'เทา',
    solid: 'bg-muted-foreground', surface: 'bg-muted border-border',
    text: 'text-foreground', textMuted: 'text-muted-foreground' },
]

/** The cover a teacher saved, or null when they never picked one. */
export function coverOf(meta: ClassroomMeta): CoverPreset | null {
  if (!meta.cover) return null
  return COVER_PRESETS.find(preset => preset.id === meta.cover) ?? null
}

export const ACCESS_LABEL: Record<AccessType, string> = {
  open: 'เปิดรับอิสระ', request: 'ต้องอนุมัติ', closed: 'ปิดรับ',
}

export const ACCESS_BADGE: Record<AccessType, string> = {
  open: 'bg-success/10 text-success',
  request: 'bg-primary/10 text-primary',
  closed: 'bg-muted text-muted-foreground',
}

export const GRADE_SUGGESTIONS = [
  'ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6',
  'ม.4/1', 'ม.4/2', 'ม.5/1', 'ม.5/2', 'ม.6/1', 'ม.6/2',
  'ป.5', 'ป.6', 'ม.ต้น (1–3)', 'ติวสอบ', 'ติวเข้า ม.1',
]

export function getTermSuggestions(): string[] {
  const now = new Date()
  const be = now.getFullYear() + 543
  return [`1/${be}`, `2/${be}`, `1/${be - 1}`, `2/${be - 1}`, `ภาคฤดูร้อน ${be}`]
}

export function getSmartTermDefault(): string {
  const now = new Date()
  const be = now.getFullYear() + 543
  const month = now.getMonth() + 1
  return (month >= 5 && month <= 10) ? `1/${be}` : `2/${be}`
}

export const EMPTY_META: ClassroomMeta = {
  description: '', cover: '',
  gradeLevel: '', academicTerm: '', tags: [],
  accessType: 'open', capacityEnabled: false, maxCapacity: '30',
  startDate: '', endDate: '',
}

const SEPARATOR = ' · '

// Field order here is also the order `composeDescription` writes them in.
const META_KEYS = ['หน้าปก', 'ระดับ', 'ภาคเรียน', 'แท็ก', 'การเข้าร่วม', 'ที่นั่ง', 'เปิด', 'ปิด'] as const

export function composeDescription(meta: ClassroomMeta): string {
  const parts: string[] = []
  if (meta.cover) parts.push(`หน้าปก: ${meta.cover}`)
  if (meta.gradeLevel)   parts.push(`ระดับ: ${meta.gradeLevel}`)
  if (meta.academicTerm) parts.push(`ภาคเรียน: ${meta.academicTerm}`)
  if (meta.tags.length)  parts.push(`แท็ก: ${meta.tags.join(', ')}`)
  parts.push(`การเข้าร่วม: ${ACCESS_LABEL[meta.accessType]}`)
  if (meta.capacityEnabled && meta.maxCapacity) parts.push(`ที่นั่ง: ${meta.maxCapacity} คน`)
  if (meta.startDate) parts.push(`เปิด: ${meta.startDate}`)
  if (meta.endDate)   parts.push(`ปิด: ${meta.endDate}`)

  return [meta.description.trim(), parts.join(SEPARATOR)].filter(Boolean).join('\n')
}

function splitSegment(segment: string): [string, string] | null {
  const at = segment.indexOf(':')
  if (at === -1) return null
  return [segment.slice(0, at).trim(), segment.slice(at + 1).trim()]
}

// A metadata line is one whose every ` · ` segment is a `key: value` pair with
// a key we wrote. Anything else — including descriptions from the older simple
// create modal, which writes `วิชา: …` — stays untouched free text.
function isMetaLine(line: string): boolean {
  const segments = line.split(SEPARATOR)
  return segments.length > 0 && segments.every(segment => {
    const pair = splitSegment(segment)
    return pair !== null && (META_KEYS as readonly string[]).includes(pair[0])
  })
}

export function parseDescription(raw: string | null): ClassroomMeta {
  const text = raw ?? ''
  if (!text.trim()) return { ...EMPTY_META }

  const lines = text.split('\n')
  const last = lines[lines.length - 1]
  if (!isMetaLine(last)) return { ...EMPTY_META, description: text }

  const meta: ClassroomMeta = { ...EMPTY_META, description: lines.slice(0, -1).join('\n') }

  for (const segment of last.split(SEPARATOR)) {
    const pair = splitSegment(segment)
    if (!pair) continue
    const [key, value] = pair
    switch (key) {
      // Older rows stored `#from,#to,angle` gradients; those ids no longer
      // resolve to a preset and simply read back as "no cover picked".
      case 'หน้าปก':
        meta.cover = COVER_PRESETS.some(preset => preset.id === value) ? value : ''
        break
      case 'ระดับ':      meta.gradeLevel = value; break
      case 'ภาคเรียน':   meta.academicTerm = value; break
      case 'แท็ก':       meta.tags = value.split(',').map(t => t.trim()).filter(Boolean); break
      case 'การเข้าร่วม': {
        const match = (Object.keys(ACCESS_LABEL) as AccessType[]).find(k => ACCESS_LABEL[k] === value)
        if (match) meta.accessType = match
        break
      }
      case 'ที่นั่ง': {
        const seats = value.replace(/\s*คน$/, '').trim()
        if (seats) { meta.capacityEnabled = true; meta.maxCapacity = seats }
        break
      }
      case 'เปิด': meta.startDate = value; break
      case 'ปิด':  meta.endDate = value; break
    }
  }

  return meta
}

// What a teacher should read on a card or header: everything they entered
// except the cover, whose hex values are for rendering, not for display.
export function displayDescription(raw: string | null): string {
  const meta = parseDescription(raw)
  if (!meta.cover) return raw ?? ''
  return composeDescription({ ...meta, cover: '' })
}
