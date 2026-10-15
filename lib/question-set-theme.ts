import type { CSSProperties } from 'react'

/** Same allowlist as the classroom colour picker. Presentation metadata only. */
export const QUESTION_SET_THEMES = ['blue', 'sky', 'mint', 'green', 'amber', 'orange', 'red', 'purple', 'slate'] as const
export type QuestionSetTheme = typeof QUESTION_SET_THEMES[number]

export function isQuestionSetTheme(value: unknown): value is QuestionSetTheme {
  return typeof value === 'string' && QUESTION_SET_THEMES.some(theme => theme === value)
}

/** A versioned envelope in the existing description column, like classroom metadata.
 *  Old plain-text descriptions and portable .korkru.json files remain readable. */
export function parseQuestionSetDescription(raw: string | null | undefined): { description: string; theme?: QuestionSetTheme } {
  const text = raw ?? ''
  const match = /^\[korkru:set-theme:v1:([a-z]+)\]\n/.exec(text)
  if (!match || !isQuestionSetTheme(match[1])) return { description: text }
  return { description: text.slice(match[0].length), theme: match[1] }
}

export function composeQuestionSetDescription(description: string, theme: QuestionSetTheme): string {
  return `[korkru:set-theme:v1:${theme}]\n${parseQuestionSetDescription(description).description.trim()}`
}

/** Legacy folders get varied, stable colours without a database backfill. */
export function questionSetTheme(id: string, description?: string | null): QuestionSetTheme {
  const saved = parseQuestionSetDescription(description).theme
  if (saved) return saved
  let hash = 0
  for (const char of id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0
  return QUESTION_SET_THEMES[hash % QUESTION_SET_THEMES.length]
}

export function randomQuestionSetTheme(random = Math.random): QuestionSetTheme {
  const index = Math.max(0, Math.min(QUESTION_SET_THEMES.length - 1, Math.floor(random() * QUESTION_SET_THEMES.length)))
  return QUESTION_SET_THEMES[index]
}

const THEME_COLOR: Record<QuestionSetTheme, string> = {
  blue: 'var(--tint-1)', sky: 'var(--tint-2)', mint: 'var(--tint-4)',
  green: 'var(--success)', amber: 'var(--warning)', orange: 'var(--flag)',
  red: 'var(--tint-3)', purple: 'var(--primary)', slate: 'var(--muted-foreground)',
}

export function questionSetThemeStyle(theme: QuestionSetTheme): CSSProperties {
  return { '--question-set-accent': THEME_COLOR[theme] } as CSSProperties
}

// Scoped decoration: do not override semantic status colours or the global primary.
export const SET_THEME_TEXT = 'text-[color-mix(in_oklab,var(--question-set-accent,var(--primary))_60%,var(--foreground))]'
export const SET_THEME_SURFACE = 'bg-[color-mix(in_oklab,var(--question-set-accent,var(--primary))_8%,var(--card))] border-[color-mix(in_oklab,var(--question-set-accent,var(--primary))_20%,var(--border))]'
export const SET_THEME_ICON = 'bg-[color-mix(in_oklab,var(--question-set-accent,var(--primary))_10%,var(--card))]'

export const SET_THEME_BORDER = 'border-[color-mix(in_oklab,var(--question-set-accent,var(--primary))_20%,var(--border))]'
