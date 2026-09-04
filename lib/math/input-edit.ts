export interface MathInputEditResult {
  value: string
  cursor: number
}

export interface MathCaretRange {
  start: number
  end: number
}

/**
 * Keeps a caret inside a value of `length`, with `end` never before `start`.
 *
 * A remembered caret can outlive the text it pointed at, so every caller
 * clamps before using one.
 */
export function clampMathCaret(length: number, start: number | null, end: number | null): MathCaretRange {
  const safeStart = Math.max(0, Math.min(length, start ?? length))
  const safeEnd = Math.max(safeStart, Math.min(length, end ?? safeStart))
  return { start: safeStart, end: safeEnd }
}

/**
 * Where a keypad edit belongs: the caret the field reports while it is
 * focused, else the last one it reported, else the end of the value.
 *
 * `live` is null whenever the field is not focused — a blurred input reports
 * a caret of 0 on iOS, which would send every key to the front of the value.
 */
export function resolveMathCaret(
  length: number,
  live: MathCaretRange | null,
  remembered: MathCaretRange | null,
): MathCaretRange {
  const source = live ?? remembered
  return clampMathCaret(length, source?.start ?? null, source?.end ?? null)
}

function selection(value: string, start: number | null, end: number | null) {
  const range = clampMathCaret(value.length, start, end)
  return { ...range, selected: value.slice(range.start, range.end) }
}

export function insertMathText(
  value: string,
  start: number | null,
  end: number | null,
  text: string,
  cursorOffset = text.length,
): MathInputEditResult {
  const range = selection(value, start, end)
  return {
    value: value.slice(0, range.start) + text + value.slice(range.end),
    cursor: range.start + Math.max(0, Math.min(text.length, cursorOffset)),
  }
}

export function insertMathFunction(
  value: string,
  start: number | null,
  end: number | null,
  name: string,
): MathInputEditResult {
  const range = selection(value, start, end)
  const text = `${name}(${range.selected})`
  return insertMathText(
    value,
    range.start,
    range.end,
    text,
    range.selected ? text.length : name.length + 1,
  )
}

export function insertMathFraction(
  value: string,
  start: number | null,
  end: number | null,
): MathInputEditResult {
  const range = selection(value, start, end)
  const numerator = range.selected ? `(${range.selected})` : '()'
  const text = `${numerator}/()`
  return insertMathText(
    value,
    range.start,
    range.end,
    text,
    range.selected ? text.length - 1 : 1,
  )
}

export function backspaceMathInput(
  value: string,
  start: number | null,
  end: number | null,
): MathInputEditResult {
  const range = selection(value, start, end)
  if (range.start !== range.end) return insertMathText(value, range.start, range.end, '')
  if (range.start === 0) return { value, cursor: 0 }
  return {
    value: value.slice(0, range.start - 1) + value.slice(range.end),
    cursor: range.start - 1,
  }
}

