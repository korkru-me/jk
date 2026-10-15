export type RandomValues = Record<string, number>

export function sameRandomValues(left: RandomValues, right: RandomValues): boolean {
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(key => left[key] === right[key])
}

export function parseRandomValues(value: unknown): RandomValues | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.entries(value)
  if (entries.length > 128 || entries.some(([key, number]) => key.length > 120 || ['__proto__', 'constructor', 'prototype'].includes(key) || typeof number !== 'number' || !Number.isFinite(number))) return null
  return Object.fromEntries(entries) as RandomValues
}

/** Never report a new draw as fresh when it is still the displayed value set. */
export function drawFreshValues<T>(draw: () => T, values: (draw: T) => RandomValues, previous?: RandomValues): T | null {
  for (let attempt = 0; attempt < 128; attempt++) {
    const next = draw()
    if (!previous || !sameRandomValues(values(next), previous)) return next
  }
  return null
}
