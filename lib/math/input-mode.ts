import type { MathInputMode } from '@/lib/types'

export type MathInputModes = Record<string, MathInputMode>

const MAX_MODE_ENTRIES = 64
const MODE_KEY = /^[A-Za-z0-9:_-]{1,100}$/
const SAFE_PART_ID = /^[A-Za-z0-9_-]{1,90}$/

/**
 * Stable key stored in submission_answers.math_input_modes.
 *
 * A single-answer question deliberately uses `main` even when its authored
 * answer part has an id. This keeps old one-part questions and questions with
 * no answer_parts identical. Multi-part questions prefer the authored part id
 * and fall back to the frozen positional index for imported legacy data.
 */
export function mathInputPartKey(partId: string | null | undefined, index: number, totalParts: number): string {
  if (totalParts <= 1) return 'main'
  const cleanId = partId?.trim()
  return cleanId && SAFE_PART_ID.test(cleanId) ? `part:${cleanId}` : `part-index:${index}`
}

export function readMathInputMode(
  modes: MathInputModes | null | undefined,
  key: string,
): MathInputMode {
  return modes?.[key] === 'rad' ? 'rad' : 'deg'
}

/** Strict parser for the untrusted object sent by the browser. */
export function parseMathInputModes(value: unknown): MathInputModes | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.entries(value)
  if (entries.length > MAX_MODE_ENTRIES) return null

  const modes: MathInputModes = {}
  for (const [key, mode] of entries) {
    if (!MODE_KEY.test(key) || (mode !== 'deg' && mode !== 'rad')) return null
    modes[key] = mode
  }
  return modes
}

/** Server data is trusted structurally but may pre-date the column. */
export function sanitizeMathInputModes(value: unknown): MathInputModes {
  return parseMathInputModes(value) ?? {}
}
