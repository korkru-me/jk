import type { MathInputMode } from '@/lib/types'

const MAX_EXPRESSION_LENGTH = 1_000
const MAX_TOKENS = 512
const MAX_DEPTH = 64
const MAX_OPERATIONS = 1_000

type Token =
  | { type: 'number'; value: number }
  | { type: 'identifier'; value: string }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' | '^' | '!' }
  | { type: 'left' | 'right' | 'comma' | 'sqrt' | 'end' }

function normalizeExpression(text: string): string {
  return text
    .trim()
    .replace(/[−–—]/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'pi')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
}

function tokenize(raw: string): Token[] | null {
  const text = normalizeExpression(raw)
  if (!text || text.length > MAX_EXPRESSION_LENGTH) return null

  const tokens: Token[] = []
  let index = 0
  while (index < text.length) {
    const char = text[index]
    if (/\s/.test(char)) {
      index++
      continue
    }

    if (char === '√') {
      tokens.push({ type: 'sqrt' })
      index++
    } else if (char === '(') {
      tokens.push({ type: 'left' })
      index++
    } else if (char === ')') {
      tokens.push({ type: 'right' })
      index++
    } else if (char === ',') {
      tokens.push({ type: 'comma' })
      index++
    } else if ('+-*/^!'.includes(char)) {
      tokens.push({ type: 'operator', value: char as '+' | '-' | '*' | '/' | '^' | '!' })
      index++
    } else if (/\d|\./.test(char)) {
      const match = text.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)
      if (!match) return null
      const value = Number(match[0])
      if (!Number.isFinite(value)) return null
      tokens.push({ type: 'number', value })
      index += match[0].length
    } else if (/[A-Za-z]/.test(char)) {
      const match = text.slice(index).match(/^[A-Za-z][A-Za-z0-9]*/)
      if (!match) return null
      tokens.push({ type: 'identifier', value: match[0].toLowerCase() })
      index += match[0].length
    } else {
      return null
    }

    if (tokens.length > MAX_TOKENS) return null
  }
  tokens.push({ type: 'end' })
  return tokens
}

function factorial(value: number): number | null {
  if (!Number.isInteger(value) || value < 0 || value > 170) return null
  let result = 1
  for (let i = 2; i <= value; i++) result *= i
  return result
}

class ExpressionParser {
  private index = 0
  private depth = 0
  private operations = 0

  constructor(
    private readonly tokens: Token[],
    private readonly mode: MathInputMode,
  ) {}

  parse(): number | null {
    const value = this.additive()
    if (value == null || this.peek().type !== 'end') return null
    return Number.isFinite(value) ? value : null
  }

  private peek(): Token {
    return this.tokens[this.index] ?? { type: 'end' }
  }

  private take(): Token {
    const token = this.peek()
    this.index++
    return token
  }

  private count(value: number): number | null {
    this.operations++
    return this.operations <= MAX_OPERATIONS && Number.isFinite(value) ? value : null
  }

  private nested<T>(read: () => T): T | null {
    this.depth++
    if (this.depth > MAX_DEPTH) {
      this.depth--
      return null
    }
    const result = read()
    this.depth--
    return result
  }

  private additive(): number | null {
    let value = this.multiplicative()
    if (value == null) return null
    while (true) {
      const next = this.peek()
      if (next.type !== 'operator' || (next.value !== '+' && next.value !== '-')) break
      const operator = this.take() as Extract<Token, { type: 'operator' }>
      const right = this.multiplicative()
      if (right == null) return null
      value = this.count(operator.value === '+' ? value + right : value - right)
      if (value == null) return null
    }
    return value
  }

  private beginsImplicitFactor(token: Token): boolean {
    return token.type === 'number' || token.type === 'identifier' || token.type === 'left' || token.type === 'sqrt'
  }

  private multiplicative(): number | null {
    let value = this.unary()
    if (value == null) return null
    while (true) {
      const token = this.peek()
      const explicit = token.type === 'operator' && (token.value === '*' || token.value === '/')
      const implicit = this.beginsImplicitFactor(token)
      if (!explicit && !implicit) break
      const operator = explicit ? (this.take() as Extract<Token, { type: 'operator' }>).value : '*'
      const right = this.unary()
      if (right == null || (operator === '/' && right === 0)) return null
      value = this.count(operator === '*' ? value * right : value / right)
      if (value == null) return null
    }
    return value
  }

  // Unary sits below power so -2^2 follows scientific-calculator convention
  // and reads as -(2^2), while 2^-2 still accepts a signed exponent.
  private unary(): number | null {
    const token = this.peek()
    if (token.type === 'operator' && (token.value === '+' || token.value === '-')) {
      this.take()
      const value = this.nested(() => this.unary())
      if (value == null) return null
      return token.value === '-' ? this.count(-value) : value
    }
    return this.power()
  }

  private power(): number | null {
    let value = this.postfix()
    if (value == null) return null
    const token = this.peek()
    if (token.type === 'operator' && token.value === '^') {
      this.take()
      const exponent = this.nested(() => this.unary())
      if (exponent == null) return null
      value = this.count(Math.pow(value, exponent))
    }
    return value
  }

  private postfix(): number | null {
    let value = this.primary()
    if (value == null) return null
    while (true) {
      const next = this.peek()
      if (next.type !== 'operator' || next.value !== '!') break
      this.take()
      const result = factorial(value)
      if (result == null) return null
      value = this.count(result)
      if (value == null) return null
    }
    return value
  }

  private primary(): number | null {
    const token = this.take()
    if (token.type === 'number') return token.value

    if (token.type === 'left') {
      const value = this.nested(() => this.additive())
      if (value == null || this.take().type !== 'right') return null
      return value
    }

    if (token.type === 'sqrt') {
      const value = this.nested(() => this.unary())
      return value == null || value < 0 ? null : this.count(Math.sqrt(value))
    }

    if (token.type !== 'identifier') return null
    if (token.value === 'pi') return Math.PI
    if (token.value === 'e') return Math.E
    if (token.value === 'tau') return Math.PI * 2
    if (this.peek().type !== 'left') return null

    this.take()
    const args: number[] = []
    if (this.peek().type !== 'right') {
      while (true) {
        const arg = this.nested(() => this.additive())
        if (arg == null) return null
        args.push(arg)
        if (this.peek().type !== 'comma') break
        this.take()
      }
    }
    if (this.take().type !== 'right') return null
    return this.call(token.value, args)
  }

  private call(name: string, args: number[]): number | null {
    const unary = (fn: (value: number) => number) => args.length === 1 ? this.count(fn(args[0])) : null
    const radians = (value: number) => this.mode === 'deg' ? value * Math.PI / 180 : value
    const inverse = (value: number) => this.mode === 'deg' ? value * 180 / Math.PI : value

    switch (name) {
      case 'sin': return unary(value => Math.sin(radians(value)))
      case 'cos': return unary(value => Math.cos(radians(value)))
      case 'tan':
        return unary(value => {
          const angle = radians(value)
          return Math.abs(Math.cos(angle)) < 1e-14 ? NaN : Math.tan(angle)
        })
      case 'asin': return unary(value => inverse(Math.asin(value)))
      case 'acos': return unary(value => inverse(Math.acos(value)))
      case 'atan': return unary(value => inverse(Math.atan(value)))
      case 'sinh': return unary(Math.sinh)
      case 'cosh': return unary(Math.cosh)
      case 'tanh': return unary(Math.tanh)
      case 'sqrt': return unary(value => value < 0 ? NaN : Math.sqrt(value))
      case 'cbrt': return unary(Math.cbrt)
      case 'abs': return unary(Math.abs)
      case 'exp': return unary(Math.exp)
      case 'ln': return unary(Math.log)
      case 'log10': return unary(Math.log10)
      case 'log2': return unary(Math.log2)
      case 'ceil': return unary(Math.ceil)
      case 'floor': return unary(Math.floor)
      case 'sign': return unary(Math.sign)
      case 'log':
        if (args.length === 1) return this.count(Math.log10(args[0]))
        if (args.length === 2 && args[0] > 0 && args[1] > 0 && args[1] !== 1) {
          return this.count(Math.log(args[0]) / Math.log(args[1]))
        }
        return null
      case 'pow': return args.length === 2 ? this.count(Math.pow(args[0], args[1])) : null
      case 'root':
        if (args.length !== 2 || args[1] === 0) return null
        if (args[0] < 0 && Number.isInteger(args[1]) && Math.abs(args[1] % 2) === 1) {
          return this.count(-Math.pow(-args[0], 1 / args[1]))
        }
        return this.count(Math.pow(args[0], 1 / args[1]))
      case 'round':
        if (args.length === 1) return this.count(Math.round(args[0]))
        if (args.length === 2 && Number.isInteger(args[1]) && Math.abs(args[1]) <= 15) {
          const factor = Math.pow(10, args[1])
          return this.count(Math.round((args[0] + Number.EPSILON) * factor) / factor)
        }
        return null
      default: return null
    }
  }
}

/**
 * Evaluate one untrusted student expression without eval, Function, or a
 * general-purpose expression runtime. Invalid/non-finite input returns null.
 */
export function evaluateStudentExpression(text: string, mode: MathInputMode = 'deg'): number | null {
  const tokens = tokenize(text)
  if (!tokens) return null
  return new ExpressionParser(tokens, mode === 'rad' ? 'rad' : 'deg').parse()
}
