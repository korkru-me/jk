import type { FillBlankConfig, FillBlankItem, FillBlankType } from './types'
import { splitHtmlOnMarker } from './text-blank'

// Old questions were saved with a single config-level `grading_mode` and no
// per-item `type`. New saves always set `type` on every blank, so this only
// falls back to `grading_mode` for legacy data.
export function getBlankType(
  config: Pick<FillBlankConfig, 'grading_mode'> | null | undefined,
  blank: Pick<FillBlankItem, 'type'> | null | undefined,
): FillBlankType {
  if (blank?.type) return blank.type
  return config?.grading_mode === 'manual' ? 'text' : 'fixed'
}

export const BLANK_MARKER = '[___]'

// Splits fill-blank question content (plain text, or rich-text HTML from
// RichTextEditor) on every BLANK_MARKER.
export function splitFillBlankHtml(html: string): string[] {
  return splitHtmlOnMarker(html, BLANK_MARKER)
}
