import type { SVGProps } from 'react'
import {
  Atom, Calculator, Cpu, Dumbbell, Earth, HandHeart, Landmark,
  Microscope, Music, Palette, PawPrint, School, Sprout, Telescope,
  TestTubes, FlaskConical, type LucideIcon,
} from 'lucide-react'
import { classroomIconKey, type ClassroomIconKey } from '@/lib/classroom-icons'

const SUBJECT_ICONS = {
  school: School,
  physics: Atom,
  mathematics: Calculator,
  technology: Cpu,
  laboratory: Microscope,
  chemistry: FlaskConical,
  'plant-biology': Sprout,
  'animal-biology': PawPrint,
  science: TestTubes,
  astronomy: Telescope,
  'earth-science': Earth,
  'social-studies': Landmark,
  // A caring hand, rather than a symbol that implies one specific religion.
  religion: HandHeart,
  art: Palette,
  music: Music,
  'physical-education': Dumbbell,
} satisfies Partial<Record<ClassroomIconKey, LucideIcon>>

const LANGUAGE_GLYPHS = {
  thai: 'ก', english: 'A', chinese: '中', korean: '한', japanese: 'あ',
} as const

interface Props extends SVGProps<SVGSVGElement> {
  iconKey?: unknown
}

/** One renderer for saved room metadata. Icons inherit the surrounding theme. */
export function ClassroomIcon({ iconKey, ...props }: Props) {
  const key = classroomIconKey(iconKey)
  if (key in LANGUAGE_GLYPHS) {
    const glyph = LANGUAGE_GLYPHS[key as keyof typeof LANGUAGE_GLYPHS]
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24" height="24" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" focusable="false"
        {...props}
        data-classroom-icon={key}
      >
        <path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z" />
        <text x="12" y="13.5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="11" fontWeight="600" fontFamily="system-ui, sans-serif">{glyph}</text>
      </svg>
    )
  }
  const Icon = SUBJECT_ICONS[key as keyof typeof SUBJECT_ICONS]
  return <Icon aria-hidden="true" focusable="false" {...props} data-classroom-icon={key} />
}
