import type { SVGProps } from 'react'
import {
  classroomCoverPatternKey,
  type ClassroomCoverPatternKey,
} from '@/lib/classroom-cover-patterns'

interface Props extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  patternKey?: unknown
}

/**
 * Original one-colour line art for classroom covers.
 *
 * Every illustration uses currentColor and no fixed palette, so the same art
 * follows the room cover selected by the teacher. The compositions deliberately
 * use one continuous visual language (open arcs, offset anchors and rounded
 * strokes) rather than borrowing a cover system from another classroom app.
 */
export function ClassroomCoverPattern({ patternKey, ...props }: Props) {
  const key = classroomCoverPatternKey(patternKey)

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 320 112"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
      {...props}
      data-classroom-cover-pattern={key}
    >
      <path d="M-18 96C48 66 86 104 146 79S247 28 338 42" opacity=".22" />
      <path d="M-8 103C54 77 98 110 164 87S264 40 332 51" opacity=".12" />
      {patternFor(key)}
    </svg>
  )
}

function patternFor(key: ClassroomCoverPatternKey) {
  switch (key) {
    case 'physics':
      return (
        <g>
          <path d="M25 71c23-32 46 32 69 0s46 32 69 0" opacity=".72" />
          <circle cx="219" cy="48" r="7" />
          <ellipse cx="219" cy="48" rx="38" ry="14" transform="rotate(-18 219 48)" />
          <ellipse cx="219" cy="48" rx="38" ry="14" transform="rotate(42 219 48)" opacity=".62" />
          <path d="M270 20v18l12 25" />
          <circle cx="284" cy="68" r="7" />
          <path d="M260 20h20M277 78l10 7m-3-10 5 1-2 5" opacity=".72" />
          <path d="m47 28 13 0m-6-6v13M101 26h27m-10-7 10 7-10 7" opacity=".55" />
        </g>
      )
    case 'chemistry':
      return (
        <g>
          <path d="M51 23v27L35 82a9 9 0 0 0 8 13h43a9 9 0 0 0 8-13L78 50V23" />
          <path d="M45 67c12 5 27-6 39 1M48 23h33" opacity=".72" />
          <circle cx="58" cy="78" r="3" /><circle cx="73" cy="60" r="2.5" />
          <path d="M129 28v23l-12 30a8 8 0 0 0 7 11h35a8 8 0 0 0 7-11l-12-30V28m-28 0h31m-34 45h38" />
          <path d="m207 39 19-11 19 11v22l-19 11-19-11Zm38 0 20-11 19 11v22l-19 11-20-11" opacity=".78" />
          <circle cx="226" cy="50" r="4" /><circle cx="265" cy="50" r="4" />
          <path d="M197 87h96" opacity=".35" />
        </g>
      )
    case 'biology':
      return (
        <g>
          <path d="M34 24c38 16 38 48 0 64m40-64c-38 16-38 48 0 64" />
          <path d="M41 30h26M35 43h37M34 56h40M35 69h37M41 82h26" opacity=".62" />
          <path d="M123 87c10-38 33-56 68-62-1 35-20 59-58 66" />
          <path d="M128 88c16-21 33-38 58-55m-42 36-1-20m18 4 18-1" opacity=".68" />
          <circle cx="251" cy="57" r="34" />
          <path d="M230 50c8-14 24-15 34-5s8 26-5 35c-13 9-30 3-35-11" opacity=".7" />
          <circle cx="248" cy="56" r="9" /><circle cx="271" cy="41" r="3" /><circle cx="233" cy="75" r="3" />
        </g>
      )
    case 'astronomy':
      return (
        <g>
          <path d="m52 50 55-25 9 18-55 25zM82 58 70 92m25-40 18 40M60 92h61" />
          <path d="M120 36c34-19 75-19 110 0s55 46 59 68" opacity=".5" />
          <circle cx="205" cy="52" r="25" />
          <path d="M182 60c18 8 39 4 51-9M195 30c-5 15 8 34 30 39" opacity=".58" />
          <ellipse cx="205" cy="52" rx="48" ry="13" transform="rotate(-12 205 52)" />
          <path d="m271 21 3 7 7 3-7 3-3 7-3-7-7-3 7-3Zm-128 1 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
          <circle cx="294" cy="59" r="2.5" />
        </g>
      )
    case 'earth':
      return (
        <g>
          <path d="M16 86 61 41l25 25 19-18 47 42" />
          <path d="m45 57 16-16 10 10-10 4-7 11Zm71 2 13 1 23 30" opacity=".58" />
          <path d="M9 96c45-12 83 2 120-3s58-22 86-18" opacity=".72" />
          <circle cx="245" cy="55" r="38" />
          <path d="M207 55h76M245 17c-21 20-21 56 0 76m0-76c21 20 21 56 0 76M214 34c20 8 42 8 62 0m-62 42c20-8 42-8 62 0" opacity=".66" />
          <path d="M166 27c14-8 28-9 42-3m-47 11c12-5 23-5 34-1" opacity=".38" />
        </g>
      )
    case 'classroom':
      return (
        <g>
          <rect x="31" y="20" width="124" height="60" rx="5" />
          <path d="M45 65c17-17 31 9 49-8s31 4 47-10M46 34h49m-49 10h29" opacity=".62" />
          <path d="M57 80v13m72-13v13M185 77h99m-87 0v17m75-17v17" />
          <path d="M203 46c15-8 30-8 45 0v31c-15-8-30-8-45 0Zm45 0c15-8 30-8 45 0v31c-15-8-30-8-45 0" />
          <path d="M248 46v31M211 57h28m18 0h27M211 66h23m23 0h21" opacity=".58" />
          <circle cx="176" cy="30" r="8" />
          <path d="M176 38v20m-11 12 11-12 11 12m-25-20 14 8 15-12" opacity=".7" />
        </g>
      )
    case 'thai':
      return (
        <g>
          <path d="M34 38c19-10 39-10 58 0v49c-19-10-39-10-58 0Zm58 0c19-10 39-10 58 0v49c-19-10-39-10-58 0" />
          <path d="M92 38v49M47 51h31M47 62h24m35-11h31m-31 11h24" opacity=".52" />
          <text x="188" y="69" fill="currentColor" stroke="none" fontSize="52" fontWeight="600" fontFamily="system-ui, sans-serif">ก</text>
          <text x="245" y="72" fill="currentColor" stroke="none" fontSize="45" fontWeight="500" fontFamily="system-ui, sans-serif" opacity=".64">ข</text>
          <path d="M179 84c32 9 68 8 106-4M183 94c27 7 56 6 85 0" opacity=".42" />
          <path d="m164 26 7-8m-2 13 10-3" opacity=".65" />
        </g>
      )
    case 'foreign-language':
      return (
        <g>
          <path d="M25 28h105a12 12 0 0 1 12 12v27a12 12 0 0 1-12 12H68L45 94l5-15H25a12 12 0 0 1-12-12V40a12 12 0 0 1 12-12Z" />
          <text x="43" y="65" fill="currentColor" stroke="none" fontSize="34" fontWeight="650" fontFamily="system-ui, sans-serif">A</text>
          <path d="M82 47h40M82 60h31" opacity=".58" />
          <path d="M190 21h94a12 12 0 0 1 12 12v30a12 12 0 0 1-12 12h-18l6 18-27-18h-55a12 12 0 0 1-12-12V33a12 12 0 0 1 12-12Z" />
          <path d="M201 43h28m-28 12h61m-61 12h47" opacity=".58" />
          <circle cx="252" cy="43" r="4" /><circle cx="266" cy="43" r="4" />
        </g>
      )
    case 'social-studies':
      return (
        <g>
          <path d="m30 43 52-25 52 25H30Zm9 8h86M47 51v35m22-35v35m26-35v35m22-35v35M31 86h102m-110 9h118" />
          <path d="M180 33c22-17 50-16 69 2 21 20 20 47-1 65" opacity=".65" />
          <circle cx="180" cy="33" r="5" /><circle cx="248" cy="100" r="5" />
          <path d="M208 34v47m-24-32h48m-36 0-12 22h24Zm24 0-12 22h24Z" />
          <path d="M196 71h12m0 0h24M199 89h18" opacity=".58" />
          <path d="M269 32h30m-15-15v30" opacity=".4" />
        </g>
      )
    case 'physical-education':
      return (
        <g>
          <path d="M16 96c48-58 102-80 164-67 55 11 92 39 124 67" />
          <path d="M45 96c41-44 85-59 133-49 43 9 73 28 99 49M82 96c32-29 64-37 97-30 31 6 53 18 70 30" opacity=".48" />
          <circle cx="228" cy="48" r="24" />
          <path d="m228 24 10 14-6 15-17 2-11-12 6-14m28 9 14-4m-20 19 7 16m-24-14-8 12" opacity=".72" />
          <path d="M49 35c10-10 20-10 30 0m-39 13c16-15 32-15 48 0M39 62h48" />
          <path d="m99 23 14 11-14 11" opacity=".65" />
        </g>
      )
    case 'korkru-deer':
      return (
        <g>
          {/* A purpose-drawn outline echo of the KorKru mark: tall antlers,
              forward profile and the long rising neck, without copying a
              third-party classroom-cover composition. */}
          <path d="M186 96c-5-20-1-40 12-55 8-9 18-15 29-18 16-4 31 0 42 11 7 8 10 17 9 28-1 12-7 23-18 31" />
          <path d="M199 44c-10-9-14-20-12-33m17 26c-2-12 1-23 10-33m13 19c-1-9 3-16 11-21m-45 27c-9-5-15-12-18-21m74 22c10-7 21-7 31 0" />
          <path d="M217 45c11-8 27-9 39-1 7 4 12 10 15 18-17 0-31 6-42 18-13 14-20 25-22 32" opacity=".8" />
          <path d="M263 55c5-1 10 1 13 5m-38-12c-2 0-4 2-4 4m37 24c9 2 16 7 23 16" />
          <path d="M203 97c-26-3-52-13-72-29-13-10-23-23-30-38M194 84c-30-3-57-16-78-37" opacity=".44" />
          <path d="M36 85c23-19 44-28 65-27m-72 37c28-13 56-16 84-8" opacity=".36" />
          <circle cx="286" cy="28" r="3" /><circle cx="69" cy="38" r="3" />
        </g>
      )
  }
}
