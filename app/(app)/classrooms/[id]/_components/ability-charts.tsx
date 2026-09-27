'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { ChartColumnBig, Hexagon } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatPercent, type AbilityCellState } from '@/lib/student-ability'

/**
 * The two charts of the "ศักยภาพผู้เรียน" tab, drawn as plain SVG.
 *
 * A page shows 25 of these at once, so they are hand-drawn rather than built
 * on recharts: no measuring pass, no resize observers, and every colour is a
 * theme token (`fill-primary`, `stroke-border`) so presets and dark mode
 * restyle them with the rest of the app. The student is the accent colour;
 * the class average is the muted ink, drawn as a different mark (a tick on
 * the bars, an unfilled outline on the radar) so it never relies on colour.
 */

export interface AbilityDatum {
  /** Assignment id. */
  key: string
  /** 1-based number shared with the legend chips above the grid. */
  index: number
  title: string
  state: AbilityCellState
  percent: number | null
  score: number | null
  maxScore: number | null
  classAverage?: number | null
  classSubmitted?: number
}

const STATE_LABEL: Record<AbilityCellState, string> = {
  done: 'ส่งแล้ว',
  in_progress: 'กำลังทำ',
  missing: 'ยังไม่ส่ง',
}

/**
 * Handed in, but the งาน has no full marks to divide by. It must not wear
 * the "not handed in" dash — the same card says it was handed in.
 */
export function isUnscored(d: Pick<AbilityDatum, 'state' | 'percent'>): boolean {
  return d.state === 'done' && d.percent === null
}

const UNSCORED_LABEL = 'ส่งแล้ว ไม่มีคะแนนเต็ม'

/** What a column says when it has no bar. */
function noBarLabel(d: AbilityDatum): string {
  return isUnscored(d) ? UNSCORED_LABEL : STATE_LABEL[d.state]
}

/** Spoken value of one column, for the keyboard and screen readers. */
function spokenValue(d: AbilityDatum): string {
  return d.percent !== null ? formatPercent(d.percent) : noBarLabel(d)
}

/** The mark for a handed-in งาน with no percentage: a small open ring on the baseline. */
function UnscoredMark({ cx, baseline, r }: { cx: number; baseline: number; r: number }) {
  return <circle cx={cx} cy={baseline - r - 1} r={r} className="fill-none stroke-muted-foreground" strokeWidth={1.5} />
}

/** A bar with a rounded data end and a square foot on the baseline. */
function barPath(x: number, top: number, width: number, baseline: number, radius: number): string {
  const height = baseline - top
  const r = Math.max(0, Math.min(radius, width / 2, height))
  return `M${x},${baseline} V${top + r} A${r},${r} 0 0 1 ${x + r},${top} H${x + width - r} A${r},${r} 0 0 1 ${x + width},${top + r} V${baseline} Z`
}

function polar(cx: number, cy: number, radius: number, index: number, count: number): [number, number] {
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]
}

function pointsAttr(points: [number, number][]): string {
  return points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

/**
 * The student's shape on the radar, through the งาน they handed in only. A
 * งาน with no percentage is skipped rather than pulled to the centre, which
 * would draw "0%" for work that was never marked.
 */
function StudentShape({ points, dotRadius, strokeWidth }: {
  points: [number, number][]
  dotRadius: number
  strokeWidth: number
}) {
  return (
    <g>
      {points.length >= 3 && (
        <polygon points={pointsAttr(points)} className="fill-primary/12 stroke-primary" strokeWidth={strokeWidth} strokeLinejoin="round" />
      )}
      {points.length === 2 && (
        <polyline points={pointsAttr(points)} className="fill-none stroke-primary" strokeWidth={strokeWidth} strokeLinecap="round" />
      )}
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={dotRadius} className="fill-primary stroke-card" strokeWidth={dotRadius > 3 ? 2 : 1} />
      ))}
    </g>
  )
}

// ─── Mini charts (inside each student card) ─────────────────────────────────

const MINI_W = 200
const MINI_H = 104

export function MiniBarChart({ data }: { data: AbilityDatum[] }) {
  const top = 8
  const baseline = 86
  const plotH = baseline - top
  const slot = (MINI_W - 4) / Math.max(1, data.length)
  const barW = Math.min(18, slot * 0.62)
  const showIndex = data.length <= 14
  const y = (p: number) => baseline - (p / 100) * plotH

  return (
    <svg viewBox={`0 0 ${MINI_W} ${MINI_H}`} className="block h-auto w-full" aria-hidden="true">
      {[0, 50, 100].map(p => (
        <line key={p} x1={2} x2={MINI_W - 2} y1={y(p)} y2={y(p)} className="stroke-border" strokeWidth={1} />
      ))}
      {data.map((d, i) => {
        const cx = 2 + slot * i + slot / 2
        return (
          <g key={d.key}>
            {d.percent !== null ? (
              // A 0% still gets a sliver, so "handed in, scored nothing" never
              // looks the same as "not handed in".
              <path d={barPath(cx - barW / 2, Math.min(y(d.percent), baseline - 2), barW, baseline, 3)} className="fill-primary" />
            ) : isUnscored(d) ? (
              <UnscoredMark cx={cx} baseline={baseline} r={3} />
            ) : (
              <text x={cx} y={baseline - 3} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>–</text>
            )}
            {showIndex && (
              <text x={cx} y={99} textAnchor="middle" className="fill-muted-foreground tabular-nums" fontSize={8.5}>{d.index}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// Every card on a page shows the same chart type, so the radar can take a
// squarer box than the bars without rows of mismatched cards.
const MINI_RADAR_H = 148

export function MiniRadarChart({ data }: { data: AbilityDatum[] }) {
  const cx = MINI_W / 2
  const cy = MINI_RADAR_H / 2
  const R = 58
  const n = data.length
  const ring = (p: number) => pointsAttr(data.map((_, i) => polar(cx, cy, (R * p) / 100, i, n)))
  const studentPoints = data.flatMap((d, i) => (d.percent === null ? [] : [polar(cx, cy, (R * d.percent) / 100, i, n)]))
  const showIndex = n <= 14

  return (
    <svg viewBox={`0 0 ${MINI_W} ${MINI_RADAR_H}`} className="block h-auto w-full" aria-hidden="true">
      <polygon points={ring(100)} className="fill-none stroke-border" strokeWidth={1} />
      <polygon points={ring(50)} className="fill-none stroke-border" strokeWidth={1} />
      {data.map((d, i) => {
        const [x, y] = polar(cx, cy, R, i, n)
        return <line key={d.key} x1={cx} y1={cy} x2={x} y2={y} className="stroke-border" strokeWidth={1} />
      })}
      <StudentShape points={studentPoints} dotRadius={3} strokeWidth={2} />
      {showIndex && data.map((d, i) => {
        const [x, y] = polar(cx, cy, R + 9, i, n)
        return (
          <text
            key={d.key}
            x={x}
            y={y + 3}
            textAnchor="middle"
            className={`tabular-nums ${d.percent === null ? 'fill-muted-foreground/50' : 'fill-muted-foreground'}`}
            fontSize={8.5}
          >
            {d.index}
          </text>
        )
      })}
    </svg>
  )
}

// ─── Full-size charts (the expanded student view) ───────────────────────────

/**
 * The width the chart is actually given. The large charts draw in real
 * pixels at that width instead of scaling one fixed canvas, which on a phone
 * shrank every label to about 5px.
 */
function useMeasuredWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const next = Math.round(el.getBoundingClientRect().width)
      if (next > 0) setWidth(next)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

interface FullChartProps {
  data: AbilityDatum[]
  /** Assignment id under the pointer or keyboard focus — shared with the table. */
  activeKey: string | null
  onActiveChange: (key: string | null) => void
  label: string
}

/**
 * Sits above the point it describes, slid sideways as far as needed to stay
 * inside the chart. Centring it with a fixed clamp pushed it past the dialog
 * edge on a phone, where the chart is narrower than the tooltip is wide.
 */
function ChartTooltip({ datum, x, y, containerWidth }: {
  datum: AbilityDatum
  /** Anchor point in the chart's own pixels. */
  x: number
  y: number
  containerWidth: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [left, setLeft] = useState(x)
  const maxWidth = Math.min(240, containerWidth - 8)
  useLayoutEffect(() => {
    const width = ref.current?.offsetWidth ?? 0
    setLeft(Math.min(Math.max(x - width / 2, 4), Math.max(4, containerWidth - width - 4)))
  }, [x, containerWidth, datum.key])
  return (
    <div
      ref={ref}
      role="status"
      className="pointer-events-none absolute z-10 w-max -translate-y-full rounded-xl bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10"
      style={{ left, top: y - 10, maxWidth }}
    >
      <p className="line-clamp-2 text-muted-foreground">
        <span className="font-semibold tabular-nums">{datum.index}.</span> {datum.title}
      </p>
      {datum.percent !== null ? (
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="text-base font-bold text-foreground">{formatPercent(datum.percent)}</span>
          {datum.score !== null && datum.maxScore !== null && (
            <span className="text-muted-foreground tabular-nums">{datum.score}/{datum.maxScore} คะแนน</span>
          )}
        </p>
      ) : (
        <p className="mt-1 text-sm font-semibold text-foreground">{noBarLabel(datum)}</p>
      )}
      {datum.classAverage !== undefined && (
        <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
          <span aria-hidden="true" className="inline-block h-0.5 w-3 rounded-full bg-muted-foreground" />
          ค่าเฉลี่ยห้อง {formatPercent(datum.classAverage ?? null)}
          {datum.classSubmitted !== undefined && <span className="tabular-nums">(ส่ง {datum.classSubmitted} คน)</span>}
        </p>
      )}
    </div>
  )
}

export function AbilityBarChart({ data, activeKey, onActiveChange, label }: FullChartProps) {
  const [ref, measured] = useMeasuredWidth(640)
  const BAR_W = Math.max(260, measured)
  const BAR_H = BAR_W < 480 ? 280 : 340
  const left = 40
  const right = BAR_W - 8
  const top = 26
  const baseline = BAR_H - 34
  const plotH = baseline - top
  const slot = (right - left) / Math.max(1, data.length)
  const barW = Math.min(26, slot * 0.55)
  const y = (p: number) => baseline - (p / 100) * plotH
  const active = data.find(d => d.key === activeKey) ?? null
  // Narrow columns (many งาน on a phone) cannot fit "100%" over every bar or
  // every number under it. Values then live in the tooltip and the table
  // beside the chart, and only every n-th number is printed.
  const showValues = slot >= 30
  const indexStep = Math.max(1, Math.ceil(20 / slot))

  return (
    <div ref={ref} className="relative" onPointerLeave={() => onActiveChange(null)}>
      <svg viewBox={`0 0 ${BAR_W} ${BAR_H}`} className="block h-auto w-full" role="img" aria-label={label}>
        {[0, 25, 50, 75, 100].map(p => (
          <g key={p}>
            <line x1={left} x2={right} y1={y(p)} y2={y(p)} className="stroke-border" strokeWidth={1} />
            <text x={left - 8} y={y(p) + 4} textAnchor="end" className="fill-muted-foreground tabular-nums" fontSize={11}>
              {p}%
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = left + slot * i
          const cx = x0 + slot / 2
          const isActive = d.key === activeKey
          const dim = activeKey !== null && !isActive
          const barTop = d.percent === null ? baseline : Math.min(y(d.percent), baseline - 2)
          const avgY = d.classAverage == null ? null : y(d.classAverage)
          // The value rides its bar; it only hops over the class-average tick
          // when that tick would sit on top of the number.
          const tickCollides = avgY !== null && avgY <= barTop && avgY >= barTop - 20
          const labelY = (tickCollides ? avgY : barTop) - 7
          return (
            <g key={d.key}>
              {isActive && <rect x={x0 + 2} y={top - 18} width={slot - 4} height={baseline - top + 18} rx={8} className="fill-muted/60" />}
              {d.percent !== null ? (
                <>
                  <path
                    d={barPath(cx - barW / 2, barTop, barW, baseline, 4)}
                    className={`fill-primary motion-safe:transition-opacity ${dim ? 'opacity-40' : ''}`}
                  />
                  {(showValues || isActive) && (
                    <text x={cx} y={labelY} textAnchor="middle" className="fill-foreground font-semibold tabular-nums" fontSize={12}>
                      {formatPercent(d.percent)}
                    </text>
                  )}
                </>
              ) : slot >= 58 ? (
                <text x={cx} y={baseline - 8} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>
                  {isUnscored(d) ? 'ไม่มีคะแนน' : STATE_LABEL[d.state]}
                </text>
              ) : isUnscored(d) ? (
                <UnscoredMark cx={cx} baseline={baseline} r={4} />
              ) : (
                <text x={cx} y={baseline - 8} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>–</text>
              )}
              {avgY !== null && (
                <line
                  x1={cx - barW / 2 - 7}
                  x2={cx + barW / 2 + 7}
                  y1={avgY}
                  y2={avgY}
                  className={`stroke-muted-foreground ${dim ? 'opacity-40' : ''}`}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
              )}
              {/* Numbers only: the table beside the chart carries each full title. */}
              {(i % indexStep === 0 || isActive) && (
                <text x={cx} y={BAR_H - 12} textAnchor="middle" className={`font-semibold tabular-nums ${isActive ? 'fill-primary' : 'fill-foreground'}`} fontSize={slot < 22 ? 11 : 13}>
                  {d.index}
                </text>
              )}
              {/* The whole column is the hit target, not the painted bar. */}
              <rect
                x={x0}
                y={0}
                width={slot}
                height={BAR_H}
                className="fill-transparent outline-none"
                tabIndex={0}
                aria-label={`${d.index}. ${d.title}: ${spokenValue(d)}`}
                onPointerEnter={() => onActiveChange(d.key)}
                onFocus={() => onActiveChange(d.key)}
                onBlur={() => onActiveChange(null)}
              />
            </g>
          )
        })}
      </svg>
      {active && (() => {
        const i = data.indexOf(active)
        const cx = left + slot * i + slot / 2
        const barTop = active.percent === null ? baseline - 20 : y(active.percent)
        const avgY = active.classAverage == null ? barTop : y(active.classAverage)
        return <ChartTooltip datum={active} x={cx} y={Math.min(barTop, avgY)} containerWidth={BAR_W} />
      })()}
    </div>
  )
}

export function AbilityRadarChart({ data, activeKey, onActiveChange, label }: FullChartProps) {
  const [ref, measured] = useMeasuredWidth(420)
  const RADAR_W = Math.max(260, measured)
  const RADAR_H = Math.round(RADAR_W * 0.86)
  const cx = RADAR_W / 2
  const cy = RADAR_H / 2
  const R = Math.min(cx, cy) - 34
  const labelR = R + 20
  const n = data.length
  const ring = (p: number) => pointsAttr(data.map((_, i) => polar(cx, cy, (R * p) / 100, i, n)))
  const studentPoints = data.flatMap((d, i) => (d.percent === null ? [] : [polar(cx, cy, (R * d.percent) / 100, i, n)]))
  const averagePoints = data.flatMap((d, i) => (d.classAverage == null ? [] : [polar(cx, cy, (R * d.classAverage) / 100, i, n)]))
  const active = data.find(d => d.key === activeKey) ?? null

  function wedge(i: number): string {
    const reach = labelR + 16
    const [x1, y1] = polar(cx, cy, reach, i - 0.5, n)
    const [x2, y2] = polar(cx, cy, reach, i + 0.5, n)
    return `M${cx},${cy} L${x1},${y1} A${reach},${reach} 0 0 1 ${x2},${y2} Z`
  }

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[32rem]" onPointerLeave={() => onActiveChange(null)}>
      <svg viewBox={`0 0 ${RADAR_W} ${RADAR_H}`} className="block h-auto w-full" role="img" aria-label={label}>
        {[25, 50, 75, 100].map(p => (
          <polygon key={p} points={ring(p)} className="fill-none stroke-border" strokeWidth={1} />
        ))}
        {data.map((d, i) => {
          const [x, y] = polar(cx, cy, R, i, n)
          return <line key={d.key} x1={cx} y1={cy} x2={x} y2={y} className={d.key === activeKey ? 'stroke-muted-foreground' : 'stroke-border'} strokeWidth={1} />
        })}
        {[50, 100].map(p => (
          <text key={p} x={cx + 5} y={cy - (R * p) / 100 + 11} className="fill-muted-foreground tabular-nums" fontSize={10}>
            {p}%
          </text>
        ))}
        {averagePoints.length >= 3 && (
          <polygon points={pointsAttr(averagePoints)} className="fill-none stroke-muted-foreground" strokeWidth={2} strokeLinejoin="round" />
        )}
        <StudentShape points={studentPoints} dotRadius={4.5} strokeWidth={2} />
        {data.map((d, i) => {
          const [x, y] = polar(cx, cy, labelR, i, n)
          const isActive = d.key === activeKey
          return (
            <g key={d.key}>
              <circle cx={x} cy={y} r={11} className={isActive ? 'fill-primary/15' : 'fill-muted'} />
              <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                className={`font-semibold tabular-nums ${isActive ? 'fill-primary' : d.percent === null ? 'fill-muted-foreground/60' : 'fill-foreground'}`}
                fontSize={11.5}
              >
                {d.index}
              </text>
            </g>
          )
        })}
        {/* Each axis owns the wedge around it, so the pointer only has to be nearest. */}
        {data.map((d, i) => (
          <path
            key={d.key}
            d={wedge(i)}
            className="fill-transparent outline-none"
            tabIndex={0}
            aria-label={`${d.index}. ${d.title}: ${spokenValue(d)}`}
            onPointerEnter={() => onActiveChange(d.key)}
            onFocus={() => onActiveChange(d.key)}
            onBlur={() => onActiveChange(null)}
          />
        ))}
      </svg>
      {active && (() => {
        const i = data.indexOf(active)
        const [x, y] = active.percent === null ? polar(cx, cy, labelR, i, n) : polar(cx, cy, (R * active.percent) / 100, i, n)
        return <ChartTooltip datum={active} x={x} y={y} containerWidth={RADAR_W} />
      })()}
    </div>
  )
}

// ─── Chart type switch ──────────────────────────────────────────────────────

export type AbilityChartType = 'bar' | 'radar'

/** A radar with fewer than three spokes is a line, not a shape. */
export const RADAR_MIN_ASSIGNMENTS = 3

export function ChartTypeToggle({ value, onChange, radarAllowed }: {
  value: AbilityChartType
  onChange: (value: AbilityChartType) => void
  radarAllowed: boolean
}) {
  const itemClass = 'gap-1.5 rounded-lg px-3 text-muted-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm'
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={values => {
        const next = values.at(-1)
        if (next === 'bar' || next === 'radar') onChange(next)
      }}
      aria-label="รูปแบบกราฟ"
      spacing={1}
      className="rounded-xl bg-muted p-1"
    >
      <ToggleGroupItem value="bar" size="sm" className={itemClass}>
        <ChartColumnBig /> กราฟแท่ง
      </ToggleGroupItem>
      <ToggleGroupItem value="radar" size="sm" disabled={!radarAllowed} className={itemClass}>
        <Hexagon /> เรดาร์
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
