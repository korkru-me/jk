import { useId, type SVGProps } from 'react'
import { BRAND_MARK_PATH, BRAND_MARK_VIEW_BOX } from '@/components/brand-mark-data'
import {
  classroomCoverPatternKey,
  type ClassroomCoverPatternKey,
} from '@/lib/classroom-cover-patterns'

type ClassroomCoverPatternPlacement = 'center' | 'end'

interface Props extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  patternKey?: unknown
  /** Align the triangular artwork with the right edge of a room cover. */
  placement?: ClassroomCoverPatternPlacement
}

/**
 * Original KorKru cover artwork built from one theme colour.
 *
 * A diagonal from the top-left to the bottom-right divides every cover. The
 * artwork lives in the upper-right half, leaving the lower-left quiet for room
 * names and supporting copy. Filled shapes use currentColor at different
 * opacities, so the composition follows every room colour and light/dark mode.
 */
export function ClassroomCoverPattern({ patternKey, placement = 'center', ...props }: Props) {
  const key = classroomCoverPatternKey(patternKey)
  const clipId = `korkru-cover-${useId().replaceAll(':', '')}`

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 320 112"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio={placement === 'end' ? 'xMaxYMin meet' : 'xMidYMid meet'}
      {...props}
      data-classroom-cover-pattern={key}
      data-classroom-cover-placement={placement}
    >
      <defs>
        <clipPath id={clipId}>
          <path d="M0 0h320v112Z" fill="currentColor" stroke="none" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <g data-classroom-cover-field="upper-right">
          <path d="M0 0h320v112Z" fill="currentColor" stroke="none" opacity=".045" />
          <path d="M142 0h178v112L260 91Z" fill="currentColor" stroke="none" opacity=".055" />
          <path d="M236 0h84v61l-25-9Z" fill="currentColor" stroke="none" opacity=".055" />
        </g>
        <g data-classroom-cover-motif={key}>
          {patternFor(key)}
        </g>
      </g>
    </svg>
  )
}

function patternFor(key: ClassroomCoverPatternKey) {
  switch (key) {
    case 'physics':
      return (
        <>
          <path
            d="M160 55c29-2 42-31 72-32 26-1 38 20 64 9-17 22-40 2-63 4-27 2-39 27-73 28Z"
            fill="currentColor"
            stroke="none"
            opacity=".2"
          />
          <rect x="252" y="13" width="48" height="7" rx="3.5" fill="currentColor" stroke="none" opacity=".3" />
          <path d="m277 20-14 38" strokeWidth="3.5" opacity=".72" />
          <circle cx="260" cy="66" r="11" fill="currentColor" stroke="none" opacity=".88" />
          <path d="M244 61a21 21 0 0 0 24 25" strokeWidth="2.5" opacity=".36" />
          <path d="m286 35 7-3-2 7" strokeWidth="2.5" opacity=".7" />
        </>
      )
    case 'chemistry':
      return (
        <>
          <path
            d="M240 14h34v8h-5v20l25 28a6 6 0 0 1-5 10h-64a6 6 0 0 1-5-10l25-28V22h-5Z"
            fill="currentColor"
            stroke="none"
            opacity=".2"
          />
          <path d="M240 14h34v8h-5v20l25 28a6 6 0 0 1-5 10h-64a6 6 0 0 1-5-10l25-28V22h-5" strokeWidth="2.5" opacity=".78" />
          <path d="M228 64c12-8 24 6 37 0 9-4 17-1 25 5l4 5a4 4 0 0 1-4 6h-66a4 4 0 0 1-3-6Z" fill="currentColor" stroke="none" opacity=".72" />
          <circle cx="258" cy="54" r="4" fill="currentColor" stroke="none" opacity=".68" />
          <circle cx="286" cy="26" r="6" fill="currentColor" stroke="none" opacity=".32" />
          <circle cx="300" cy="16" r="3" fill="currentColor" stroke="none" opacity=".72" />
        </>
      )
    case 'biology':
      return (
        <>
          <path
            d="M215 68c7-36 31-54 78-54-3 42-28 61-78 54Z"
            fill="currentColor"
            stroke="none"
            opacity=".3"
          />
          <path
            d="M252 75c8-24 26-35 55-31-5 28-23 39-55 31Z"
            fill="currentColor"
            stroke="none"
            opacity=".62"
          />
          <path d="M216 68c22-18 44-34 69-46M239 49l1-17m11 8 19-4m-36 18 17 10M254 74c15-10 29-18 46-24" strokeWidth="2.5" opacity=".72" />
          <circle cx="296" cy="72" r="7" fill="currentColor" stroke="none" opacity=".25" />
          <circle cx="296" cy="72" r="2.5" fill="currentColor" stroke="none" opacity=".82" />
        </>
      )
    case 'astronomy':
      return (
        <>
          <path
            d="M264 11a33 33 0 1 0 26 54 27 27 0 0 1-26-54Z"
            fill="currentColor"
            stroke="none"
            opacity=".78"
          />
          <path d="M209 77c24-14 51-14 80 0 11 5 21 7 31 5v16c-14 0-27-4-39-10-25-12-47-11-67 1Z" fill="currentColor" stroke="none" opacity=".16" />
          <path d="m295 18 3 7 7 3-7 3-3 7-3-7-7-3 7-3Zm15 33 2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2Z" fill="currentColor" stroke="none" opacity=".88" />
          <circle cx="280" cy="52" r="3.5" fill="currentColor" stroke="none" opacity=".38" />
        </>
      )
    case 'earth':
      return (
        <>
          <circle cx="267" cy="42" r="31" fill="currentColor" stroke="none" opacity=".19" />
          <circle cx="267" cy="42" r="31" strokeWidth="2.5" opacity=".72" />
          <path d="M238 35h58M239 49h56M253 14c-8 17-8 37 0 55m28-55c8 17 8 37 0 55" strokeWidth="2" opacity=".36" />
          <path d="m247 21 12 3 5 10-7 7-12-3-6-7Zm33 24 13 4-5 11-8 7-9-8 2-9Z" fill="currentColor" stroke="none" opacity=".72" />
          <path d="M306 50c-7 0-12 5-12 12 0 9 12 21 12 21s12-12 12-21c0-7-5-12-12-12Z" fill="currentColor" stroke="none" opacity=".78" />
          <circle cx="306" cy="62" r="4" fill="currentColor" stroke="none" opacity=".28" />
        </>
      )
    case 'classroom':
      return (
        <>
          <rect x="219" y="18" width="82" height="46" rx="7" fill="currentColor" stroke="none" opacity=".22" />
          <rect x="219" y="18" width="82" height="46" rx="7" strokeWidth="2.5" opacity=".76" />
          <path d="M231 33h36M231 43h55" strokeWidth="3" opacity=".56" />
          <path d="M244 64v10m33-10v10" strokeWidth="3" opacity=".56" />
          <path d="M224 71h37l-4-13h-29Zm42 0h40l-4-13h-32Z" fill="currentColor" stroke="none" opacity=".76" />
          <path d="M230 71v7m26-7v7m16-7v7m28-7v7" strokeWidth="3" opacity=".46" />
          <rect x="284" y="25" width="10" height="14" rx="2" fill="currentColor" stroke="none" opacity=".7" />
        </>
      )
    case 'thai':
      return (
        <>
          <path d="M207 18h86a9 9 0 0 1 9 9v43a9 9 0 0 1-9 9h-67l-19 14 5-14h-5a9 9 0 0 1-9-9V27a9 9 0 0 1 9-9Z" fill="currentColor" stroke="none" opacity=".18" />
          <text
            x="248"
            y="68"
            fill="currentColor"
            stroke="none"
            fontFamily="var(--font-sans), sans-serif"
            fontSize="58"
            fontWeight="700"
            aria-hidden="true"
          >
            ก
          </text>
          <path d="m286 58 16-25 8 5-16 25-11 7Z" fill="currentColor" stroke="none" opacity=".76" />
          <path d="m283 70 11-7-8-5Z" fill="currentColor" stroke="none" opacity=".34" />
          <path d="M224 75c20-5 40-5 59 0" strokeWidth="2.5" opacity=".4" />
        </>
      )
    case 'foreign-language':
      return (
        <>
          <path d="M205 17h58a11 11 0 0 1 11 11v27a11 11 0 0 1-11 11h-24l-18 14 5-14h-21a11 11 0 0 1-11-11V28a11 11 0 0 1 11-11Z" fill="currentColor" stroke="none" opacity=".28" />
          <path d="M254 34h46a11 11 0 0 1 11 11v24a11 11 0 0 1-11 11h-8l5 13-18-13h-25a11 11 0 0 1-11-11V45a11 11 0 0 1 11-11Z" fill="currentColor" stroke="none" opacity=".72" />
          <text x="218" y="51" fill="currentColor" stroke="none" fontFamily="var(--font-sans), sans-serif" fontSize="22" fontWeight="700">A</text>
          <text x="272" y="67" fill="currentColor" stroke="none" fontFamily="var(--font-sans), sans-serif" fontSize="23" fontWeight="700">ก</text>
          <path d="M242 34h20m-52 20h31m55 2h8m-43 15h11" strokeWidth="3" opacity=".58" />
          <circle cx="299" cy="22" r="5" fill="currentColor" stroke="none" opacity=".24" />
        </>
      )
    case 'social-studies':
      return (
        <>
          <circle cx="236" cy="35" r="10" fill="currentColor" stroke="none" opacity=".46" />
          <circle cx="266" cy="25" r="12" fill="currentColor" stroke="none" opacity=".78" />
          <circle cx="296" cy="35" r="10" fill="currentColor" stroke="none" opacity=".46" />
          <path d="M218 67c2-15 9-23 18-23s16 8 18 23Zm24-4c2-19 11-29 24-29s22 10 24 29Zm36 4c2-15 9-23 18-23s16 8 18 23Z" fill="currentColor" stroke="none" opacity=".62" />
          <path d="M224 76h91" strokeWidth="4" opacity=".28" />
          <circle cx="236" cy="76" r="6" fill="currentColor" stroke="none" opacity=".76" />
          <circle cx="271" cy="76" r="6" fill="currentColor" stroke="none" opacity=".4" />
          <circle cx="306" cy="76" r="6" fill="currentColor" stroke="none" opacity=".76" />
        </>
      )
    case 'physical-education':
      return (
        <>
          <path d="M226 76c28-21 59-25 94-14v18c-34-13-62-9-86 11Z" fill="currentColor" stroke="none" opacity=".18" />
          <path d="M234 70c27-16 54-19 82-10M243 83c23-10 47-11 73-3" strokeWidth="3" opacity=".46" />
          <circle cx="273" cy="17" r="9" fill="currentColor" stroke="none" opacity=".88" />
          <path d="m267 30-16 20 21 8 15 25m-28-42 21 7 18-16m-26 26-24 24" strokeWidth="7" opacity=".78" />
          <path d="M222 35h20m-28 12h22" strokeWidth="4" opacity=".3" />
          <path d="m307 17 4 9 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1Z" fill="currentColor" stroke="none" opacity=".32" />
        </>
      )
    case 'korkru-deer':
      return korKruDeerPattern()
  }
}

function korKruDeerPattern() {
  return (
    <svg x="238" y="2" width="78" height="96" viewBox={BRAND_MARK_VIEW_BOX}>
      <path d={BRAND_MARK_PATH} fill="currentColor" stroke="none" opacity=".78" fillRule="evenodd" />
    </svg>
  )
}
