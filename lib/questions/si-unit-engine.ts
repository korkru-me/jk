// SI Unit formatter and Significant Figure engine — rule-based, no AI

// ─── SI Unit Substitution Table ───────────────────────────────────────────────

const SI_SUBS: [RegExp, string][] = [
  [/m\/s\^2/g,        'm/s²'],
  [/m\/s2/g,          'm/s²'],
  [/kg\.m\/s\^2/g,    'kg⋅m/s²'],
  [/kg\*m\/s\^2/g,    'kg⋅m/s²'],
  [/N\/m\^2/g,        'N/m²'],
  [/N\/m2/g,          'N/m²'],
  [/J\/kg/g,          'J/kg'],
  [/W\/m\^2/g,        'W/m²'],
  [/C\/m\^2/g,        'C/m²'],
  [/V\/m/g,           'V/m'],
  [/kg\/m\^3/g,       'kg/m³'],
  [/kg\/m3/g,         'kg/m³'],
  [/mol\/m\^3/g,      'mol/m³'],
  [/rad\/s\^2/g,      'rad/s²'],
  [/rad\/s2/g,        'rad/s²'],
  [/m\^2/g,           'm²'],
  [/m\^3/g,           'm³'],
  [/cm\^2/g,          'cm²'],
  [/cm\^3/g,          'cm³'],
  [/km\/h/g,          'km/h'],
  [/m\/s/g,           'm/s'],
  [/\bkg\b/g,         'kg'],
  [/\bN\b/g,          'N'],
  [/\bJ\b/g,          'J'],
  [/\bW\b/g,          'W'],
  [/\bPa\b/g,         'Pa'],
  [/\bHz\b/g,         'Hz'],
  [/\bV\b/g,          'V'],
  [/\bA\b/g,          'A'],
  [/\bΩ\b/g,          'Ω'],
  [/\bT\b/g,          'T'],
  [/\bWb\b/g,         'Wb'],
  [/\bK\b(?!\w)/g,    'K'],
]

// ─── Known SI units (for rendering in LaTeX preview) ─────────────────────────

export const SI_UNIT_PATTERNS: { pattern: RegExp; replacement: string; description: string }[] = [
  { pattern: /m\/s\^2/g,    replacement: 'm/s²',    description: 'ความเร่ง' },
  { pattern: /kg\.m\/s\^2/g,replacement: 'kg⋅m/s²', description: 'หน่วยของแรง (อีกรูป)' },
  { pattern: /N\/m\^2/g,    replacement: 'N/m²',    description: 'ความดัน (Pa)' },
  { pattern: /kg\/m\^3/g,   replacement: 'kg/m³',   description: 'ความหนาแน่น' },
  { pattern: /m\^2/g,       replacement: 'm²',      description: 'พื้นที่' },
  { pattern: /m\^3/g,       replacement: 'm³',      description: 'ปริมาตร' },
  { pattern: /rad\/s\^2/g,  replacement: 'rad/s²',  description: 'ความเร่งเชิงมุม' },
  { pattern: /m\/s/g,       replacement: 'm/s',     description: 'ความเร็ว' },
  { pattern: /km\/h/g,      replacement: 'km/h',    description: 'ความเร็ว (กม/ชม)' },
  { pattern: /J\/kg/g,      replacement: 'J/kg',    description: 'พลังงานจำเพาะ' },
]

// ─── Format a raw unit string into display form ───────────────────────────────

export function formatSIUnit(raw: string): string {
  let out = raw.trim()
  for (const [pat, rep] of SI_SUBS) {
    out = out.replace(pat, rep)
  }
  return out
}

// ─── Auto-format all units in a text passage ─────────────────────────────────
// Detects common unit patterns within parentheses or following numbers

export function autoFormatUnitsInText(text: string): string {
  // Match patterns like (m/s^2), (kg.m/s^2), etc.
  return text.replace(/\(([^)]{1,20})\)/g, (_match, inner) => {
    const formatted = formatSIUnit(inner)
    return `(${formatted})`
  })
}

// ─── Significant Figures ──────────────────────────────────────────────────────

export function countSigFigs(n: number): number {
  if (!isFinite(n) || n === 0) return 0
  const str = Math.abs(n).toString()

  // Scientific notation: e.g. 1.23e+5 → sig figs = digits in "1.23" = 3
  if (str.includes('e')) {
    const [mantissa] = str.split('e')
    const digits = mantissa.replace('.', '').replace(/^0+/, '')
    return digits.length
  }

  // Decimal: e.g. 0.00123 → sig figs = 3
  if (str.includes('.')) {
    const [, dec] = str.split('.')
    const intPart = str.split('.')[0].replace(/^0+/, '')
    if (intPart === '') {
      // 0.00123 → count from first non-zero
      return dec.replace(/^0+/, '').length
    }
    return intPart.length + dec.length
  }

  // Integer: trailing zeros are ambiguous — assume significant
  return str.replace(/^0+/, '').length
}

// ─── Check whether the result has consistent sig-figs with inputs ─────────────

export interface SigFigCheck {
  ok: boolean
  warning: string | null
  inputSigFigs: number[]
  resultSigFigs: number
  minInputSigFigs: number
}

export function checkSigFigConsistency(
  inputValues: number[],
  result: number
): SigFigCheck {
  if (inputValues.length === 0 || !isFinite(result)) {
    return { ok: true, warning: null, inputSigFigs: [], resultSigFigs: 0, minInputSigFigs: 0 }
  }

  const inputSigFigs = inputValues.map(countSigFigs)
  const minInputSigFigs = Math.min(...inputSigFigs)
  const resultSigFigs = countSigFigs(result)

  if (minInputSigFigs === 0) {
    return { ok: true, warning: null, inputSigFigs, resultSigFigs, minInputSigFigs }
  }

  if (resultSigFigs > minInputSigFigs + 1) {
    return {
      ok: false,
      warning: `คำตอบมี ${resultSigFigs} เลขนัยสำคัญ แต่ตัวแปรที่มีน้อยที่สุดมีเพียง ${minInputSigFigs} — ควรปัดเหลือ ${minInputSigFigs} ตำแหน่ง`,
      inputSigFigs,
      resultSigFigs,
      minInputSigFigs,
    }
  }

  return { ok: true, warning: null, inputSigFigs, resultSigFigs, minInputSigFigs }
}

// ─── Detect physics constants in text ─────────────────────────────────────────

export const PHYSICS_CONSTANTS: { symbol: string; value: string; name: string }[] = [
  { symbol: 'g',  value: '9.8',               name: 'ความเร่งโน้มถ่วง' },
  { symbol: 'G',  value: '6.674×10⁻¹¹',       name: 'ค่าคงที่โน้มถ่วง' },
  { symbol: 'c',  value: '3×10⁸',             name: 'ความเร็วแสง' },
  { symbol: 'h',  value: '6.626×10⁻³⁴',       name: 'ค่าคงที่พลังค์' },
  { symbol: 'e',  value: '1.6×10⁻¹⁹',         name: 'ประจุอิเล็กตรอน' },
  { symbol: 'k',  value: '9×10⁹',             name: 'ค่าคงที่คูลอมบ์' },
  { symbol: 'R',  value: '8.314',             name: 'ค่าคงที่แก๊ส' },
  { symbol: 'NA', value: '6.022×10²³',        name: 'เลขอาโวกาโดร' },
]

// ─── G-divisible "magic numbers" ─────────────────────────────────────────────
// Numbers that make g = 9.8 or g = 10 divide cleanly

export const G_DIVISIBLE_9_8 = [9.8, 19.6, 29.4, 39.2, 49.0, 98, 196, 490, 980]
export const G_DIVISIBLE_10  = [10, 20, 30, 40, 50, 100, 200, 500, 1000]
