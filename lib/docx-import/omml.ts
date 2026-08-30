/**
 * Word's equations, turned into the TeX this app already renders.
 *
 * A number typed with Word's equation editor is not text — it is an `m:oMath`
 * tree, and pulling the characters out of it in reading order is how "15√2"
 * becomes "152" and "⅛g" becomes "18g". Both of those are real, both come out
 * looking like ordinary numbers, and neither raises anything: the โจทย์ simply
 * says something ten times larger than the teacher wrote.
 *
 * `lib/math/latex.ts` renders `\( ... \)` through KaTeX wherever question text
 * is displayed, so a fraction converted here arrives as a fraction. What this
 * cannot do is guarantee it: OOXML math is a large grammar and this covers the
 * constructs a physics or maths worksheet actually uses. Everything else
 * degrades to its own contents rather than disappearing, and the caller marks
 * the โจทย์ for the teacher to check either way.
 */
import { childrenNamed, firstChild, textContent, type XmlNode } from './xml'

/** Greek letters and the operators worth naming, so KaTeX sets them as maths
 *  rather than as a stray glyph in the body font. */
const SYMBOL_TEX: Record<string, string> = {
  α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\varepsilon',
  ζ: '\\zeta', η: '\\eta', θ: '\\theta', ι: '\\iota', κ: '\\kappa',
  λ: '\\lambda', μ: '\\mu', ν: '\\nu', ξ: '\\xi', π: '\\pi',
  ρ: '\\rho', σ: '\\sigma', τ: '\\tau', υ: '\\upsilon', φ: '\\phi',
  χ: '\\chi', ψ: '\\psi', ω: '\\omega',
  Γ: '\\Gamma', Δ: '\\Delta', Θ: '\\Theta', Λ: '\\Lambda', Ξ: '\\Xi',
  Π: '\\Pi', Σ: '\\Sigma', Φ: '\\Phi', Ψ: '\\Psi', Ω: '\\Omega',
  '×': '\\times', '÷': '\\div', '±': '\\pm', '∓': '\\mp', '·': '\\cdot',
  '≤': '\\le', '≥': '\\ge', '≠': '\\ne', '≈': '\\approx', '∝': '\\propto',
  '√': '\\sqrt', '∞': '\\infty', '°': '^\\circ', '∆': '\\Delta',
  '∫': '\\int', '∑': '\\sum', '∏': '\\prod', '→': '\\to', '⃗': '\\vec',
}

/** Characters TeX reads as instructions rather than as themselves. */
const TEX_ESCAPES: Record<string, string> = {
  '\\': '\\backslash ', '{': '\\{', '}': '\\}', $: '\\$', '&': '\\&',
  '#': '\\#', _: '\\_', '%': '\\%', '~': '\\textasciitilde ', '^': '\\hat{}',
}

/** Anything outside this is not something KaTeX can set as maths on its own. */
const MATH_SAFE = /^[A-Za-z0-9+\-*/=<>().,;:'|[\]!? ]*$/

/**
 * One run of literal characters, as TeX.
 *
 * Split so that a Thai word inside an equation ("แรง = 10") goes into
 * `\text{...}` while the numbers around it stay maths. Passing the Thai
 * through raw makes KaTeX render tofu; wrapping the whole thing in `\text`
 * makes the numbers upright and the minus signs hyphens.
 */
function literalToTex(raw: string): string {
  let out = ''
  let plain = ''

  const flushPlain = () => {
    if (!plain) return
    out += MATH_SAFE.test(plain)
      ? plain.replace(/[\\{}$&#_%~^]/g, ch => TEX_ESCAPES[ch] ?? ch)
      : `\\text{${plain.replace(/[\\{}$&#_%~^]/g, ch => TEX_ESCAPES[ch] ?? ch)}}`
    plain = ''
  }

  for (const ch of raw) {
    const symbol = SYMBOL_TEX[ch]
    if (symbol) {
      flushPlain()
      out += `${symbol} `
    } else {
      plain += ch
    }
  }
  flushPlain()
  return out
}

/** `{...}` unless it is already a single token TeX can take unbraced. */
function group(tex: string): string {
  return `{${tex}}`
}

interface ConvertState {
  /** Set once the tree turns out to hold real structure — a fraction, a root,
   *  an index — rather than characters that merely happen to be in an
   *  equation. Text-only "equations" are returned as text, because wrapping
   *  a plain word in `\( \)` italicises it for no reason. */
  structured: boolean
}

function convertChildren(node: XmlNode, state: ConvertState): string {
  return node.children.map(child => convertNode(child, state)).join('')
}

function convertArgument(node: XmlNode | null, state: ConvertState): string {
  return node ? convertChildren(node, state) : ''
}

function convertNode(node: XmlNode, state: ConvertState): string {
  switch (node.name) {
    // Presentation properties, not content.
    case 'm:argPr':
    case 'm:ctrlPr':
    case 'm:fPr':
    case 'm:radPr':
    case 'm:dPr':
    case 'm:naryPr':
    case 'm:funcPr':
    case 'm:limLowPr':
    case 'm:limUppPr':
    case 'm:barPr':
    case 'm:accPr':
    case 'm:groupChrPr':
    case 'm:mPr':
    case 'm:sSupPr':
    case 'm:sSubPr':
    case 'm:sSubSupPr':
    case 'm:boxPr':
    case 'm:rPr':
    case 'w:rPr':
      return ''

    case 'm:t':
      return literalToTex(node.text)

    case 'm:f': {
      state.structured = true
      const numerator = convertArgument(firstChild(node, 'm:num'), state)
      const denominator = convertArgument(firstChild(node, 'm:den'), state)
      return `\\frac${group(numerator)}${group(denominator)}`
    }

    case 'm:rad': {
      state.structured = true
      const degree = convertArgument(firstChild(node, 'm:deg'), state).trim()
      const radicand = convertArgument(firstChild(node, 'm:e'), state)
      return degree ? `\\sqrt[${degree}]${group(radicand)}` : `\\sqrt${group(radicand)}`
    }

    case 'm:sSup': {
      state.structured = true
      return `${group(convertArgument(firstChild(node, 'm:e'), state))}^${group(convertArgument(firstChild(node, 'm:sup'), state))}`
    }

    case 'm:sSub': {
      state.structured = true
      return `${group(convertArgument(firstChild(node, 'm:e'), state))}_${group(convertArgument(firstChild(node, 'm:sub'), state))}`
    }

    case 'm:sSubSup': {
      state.structured = true
      const base = group(convertArgument(firstChild(node, 'm:e'), state))
      const sub = group(convertArgument(firstChild(node, 'm:sub'), state))
      const sup = group(convertArgument(firstChild(node, 'm:sup'), state))
      return `${base}_${sub}^${sup}`
    }

    case 'm:d': {
      state.structured = true
      const properties = firstChild(node, 'm:dPr')
      const open = firstChild(properties ?? node, 'm:begChr')?.attrs['m:val'] ?? '('
      const close = firstChild(properties ?? node, 'm:endChr')?.attrs['m:val'] ?? ')'
      // Several arguments inside one pair of brackets are separated by `|`
      // in OOXML; `,` is what a reader expects to see.
      const parts = childrenNamed(node, 'm:e').map(child => convertChildren(child, state))
      return `\\left${open || '.'}${parts.join(',')}\\right${close || '.'}`
    }

    case 'm:nary': {
      state.structured = true
      const properties = firstChild(node, 'm:naryPr')
      const operator = firstChild(properties ?? node, 'm:chr')?.attrs['m:val'] ?? '∫'
      const sub = convertArgument(firstChild(node, 'm:sub'), state).trim()
      const sup = convertArgument(firstChild(node, 'm:sup'), state).trim()
      const body = convertArgument(firstChild(node, 'm:e'), state)
      const symbol = SYMBOL_TEX[operator] ?? literalToTex(operator)
      return `${symbol}${sub ? `_${group(sub)}` : ''}${sup ? `^${group(sup)}` : ''} ${body}`
    }

    case 'm:func': {
      state.structured = true
      const name = convertArgument(firstChild(node, 'm:fName'), state).trim()
      const body = convertArgument(firstChild(node, 'm:e'), state)
      return `\\operatorname{${name.replace(/[{}\\]/g, '')}}${group(body)}`
    }

    case 'm:limLow': {
      state.structured = true
      return `${convertArgument(firstChild(node, 'm:e'), state)}_${group(convertArgument(firstChild(node, 'm:lim'), state))}`
    }

    case 'm:limUpp': {
      state.structured = true
      return `${convertArgument(firstChild(node, 'm:e'), state)}^${group(convertArgument(firstChild(node, 'm:lim'), state))}`
    }

    case 'm:bar': {
      state.structured = true
      return `\\overline${group(convertArgument(firstChild(node, 'm:e'), state))}`
    }

    case 'm:acc': {
      state.structured = true
      const properties = firstChild(node, 'm:accPr')
      const mark = firstChild(properties ?? node, 'm:chr')?.attrs['m:val'] ?? '̂'
      const body = group(convertArgument(firstChild(node, 'm:e'), state))
      // Vector arrows are the accent that actually shows up in mechanics.
      if (mark === '⃗' || mark === '→') return `\\vec${body}`
      if (mark === '̄') return `\\overline${body}`
      return `\\hat${body}`
    }

    default:
      return convertChildren(node, state)
  }
}

// ─── A readable, non-TeX rendering ───────────────────────────────────────────

function plainChildren(node: XmlNode): string {
  return node.children.map(plainNode).join('')
}

function plainArgument(node: XmlNode | null): string {
  return node ? plainChildren(node) : ''
}

/** Brackets an argument only when it is long enough to be ambiguous without. */
function bracketIfNeeded(value: string): string {
  return value.length <= 1 ? value : `(${value})`
}

/**
 * The same equation written the way someone would type it in a message.
 *
 * Used where TeX would be noise rather than maths — a โจทย์'s title, and the
 * text the warnings are matched against. "15√2" beats both "152", which is
 * wrong, and "15\sqrt{2}", which is not a title.
 */
function plainNode(node: XmlNode): string {
  switch (node.name) {
    case 'm:argPr': case 'm:ctrlPr': case 'm:fPr': case 'm:radPr': case 'm:dPr':
    case 'm:naryPr': case 'm:funcPr': case 'm:limLowPr': case 'm:limUppPr':
    case 'm:barPr': case 'm:accPr': case 'm:groupChrPr': case 'm:mPr':
    case 'm:sSupPr': case 'm:sSubPr': case 'm:sSubSupPr': case 'm:boxPr':
    case 'm:rPr': case 'w:rPr':
      return ''
    case 'm:t':
      return node.text
    case 'm:f':
      return `${bracketIfNeeded(plainArgument(firstChild(node, 'm:num')))}/${bracketIfNeeded(plainArgument(firstChild(node, 'm:den')))}`
    case 'm:rad': {
      const degree = plainArgument(firstChild(node, 'm:deg')).trim()
      const radicand = plainArgument(firstChild(node, 'm:e'))
      return `${degree}√${bracketIfNeeded(radicand)}`
    }
    case 'm:sSup':
      return `${plainArgument(firstChild(node, 'm:e'))}^${plainArgument(firstChild(node, 'm:sup'))}`
    case 'm:sSub':
      return `${plainArgument(firstChild(node, 'm:e'))}${plainArgument(firstChild(node, 'm:sub'))}`
    case 'm:sSubSup':
      return `${plainArgument(firstChild(node, 'm:e'))}${plainArgument(firstChild(node, 'm:sub'))}^${plainArgument(firstChild(node, 'm:sup'))}`
    case 'm:d':
      return `(${childrenNamed(node, 'm:e').map(plainChildren).join(',')})`
    default:
      return plainChildren(node)
  }
}

export interface OmmlResult {
  /** TeX when `structured`, otherwise the equation's characters as plain text. */
  value: string
  /** The same equation as ordinary characters, for titles and text matching. */
  plain: string
  /** Whether this held real mathematical structure, and so should be rendered
   *  as maths rather than dropped into the sentence as words. */
  structured: boolean
}

/** Converts one `m:oMath` (or `m:oMathPara`) element. */
export function ommlToTex(node: XmlNode): OmmlResult {
  const state: ConvertState = { structured: false }
  const value = convertChildren(node, state).trim()
  if (state.structured) return { value, plain: plainChildren(node).trim(), structured: true }
  // Nothing structural in it — give back the characters as written, not the
  // escaped TeX, since it is about to be treated as ordinary sentence text.
  const text = textContent(node).trim()
  return { value: text, plain: text, structured: false }
}
