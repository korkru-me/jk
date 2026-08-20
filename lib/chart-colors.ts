/**
 * Colours for Recharts charts.
 *
 * Recharts writes these values straight onto SVG attributes, so CSS custom
 * properties work here and the charts follow the light/dark theme with no JS.
 * The variables themselves live in `app/globals.css`.
 *
 * Keep every chart colour in this file — a hex literal inside a chart component
 * is a colour that a rebrand will silently miss.
 */

export const chartColors = {
  /** Brand/primary series. */
  primary: "var(--chart-1)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--destructive)",
  /** Benchmark or comparison series drawn behind the primary one. */
  comparison: "var(--muted-foreground)",

  /** Chart chrome. */
  grid: "var(--border)",
  axis: "var(--muted-foreground)",
  /** Axis labels that need to read as primary content rather than chrome. */
  axisStrong: "var(--foreground)",
  /** Hover highlight behind a bar or column. */
  cursor: "var(--muted)",
  /** Ring around line/scatter dots so they separate from the surface. */
  dotStroke: "var(--card)",
} as const

/**
 * Categorical palette, in the order colours should be handed out to series.
 */
export const chartSeries = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

/** Pick a categorical colour by index, wrapping around the palette. */
export function seriesColor(index: number): string {
  return chartSeries[index % chartSeries.length]
}

/**
 * `contentStyle` for Recharts' built-in `<Tooltip>`.
 *
 * The default tooltip paints an opaque white panel, which is unreadable in dark
 * mode. Spread this into `contentStyle` on every chart that does not supply its
 * own `content` component.
 */
export const chartTooltipStyle = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: `1px solid ${chartColors.grid}`,
  borderRadius: 8,
  fontSize: 12,
} as const
