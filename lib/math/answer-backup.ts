import { sanitizeMathInputModes, type MathInputModes } from './input-mode'

export interface PendingAnswerPayload {
  value: string
  mathInputModes: MathInputModes
}

interface AnswerBackupV2 {
  version: 2
  entries: Record<string, PendingAnswerPayload>
}

export function copyMathInputModes(modes: MathInputModes | undefined): MathInputModes {
  return { ...(modes ?? {}) }
}

function sameMathInputModes(left: MathInputModes, right: MathInputModes): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length && leftKeys.every(key => left[key] === right[key])
}

export function sameAnswerPayload(
  left: PendingAnswerPayload | undefined,
  right: PendingAnswerPayload,
): boolean {
  return !!left && left.value === right.value && sameMathInputModes(left.mathInputModes, right.mathInputModes)
}

/** Parse the current v2 backup and the legacy `{ answerId: value }` shape. */
export function parseAnswerBackup(raw: string): Record<string, PendingAnswerPayload> {
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const record = parsed as Record<string, unknown>
  const source = record.version === 2
    && record.entries
    && typeof record.entries === 'object'
    && !Array.isArray(record.entries)
    ? record.entries as Record<string, unknown>
    : record
  const result: Record<string, PendingAnswerPayload> = {}
  for (const [answerId, entry] of Object.entries(source)) {
    if (typeof entry === 'string') {
      result[answerId] = { value: entry, mathInputModes: {} }
      continue
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const candidate = entry as Record<string, unknown>
    if (typeof candidate.value !== 'string') continue
    result[answerId] = {
      value: candidate.value,
      mathInputModes: sanitizeMathInputModes(candidate.mathInputModes),
    }
  }
  return result
}

export function serializeAnswerBackup(entries: Iterable<readonly [string, PendingAnswerPayload]>): string {
  const backup: AnswerBackupV2 = {
    version: 2,
    entries: Object.fromEntries(entries),
  }
  return JSON.stringify(backup)
}
