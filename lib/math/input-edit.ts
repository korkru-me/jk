export interface MathInputEditResult {
  value: string
  cursor: number
}

function selection(value: string, start: number | null, end: number | null) {
  const safeStart = Math.max(0, Math.min(value.length, start ?? value.length))
  const safeEnd = Math.max(safeStart, Math.min(value.length, end ?? safeStart))
  return { start: safeStart, end: safeEnd, selected: value.slice(safeStart, safeEnd) }
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

