#!/usr/bin/env node
/**
 * Guards the design-token migration against drift.
 *
 * Two things this project spent a lot of effort removing keep growing back on
 * their own, because nothing checks for them:
 *
 *   palette  raw Tailwind palette classes (bg-gray-100, text-blue-600, ...)
 *            instead of the semantic tokens in app/globals.css. These are what
 *            make a theme change a 100-file find-and-replace, and most of them
 *            have no dark: counterpart, so they break dark mode too.
 *
 *   card     card surfaces written by hand (rounded-* + bg-card + border/ring)
 *            instead of <Card>. Same problem for anything that is not colour:
 *            radius, edge and padding cannot be changed centrally.
 *
 * The check is per file against a committed baseline, so existing debt does not
 * block anything, but a file cannot get worse. Touch a file, and you are
 * expected to leave its count where it was or lower.
 *
 *   npm run lint:tokens             check (exit 1 on regression)
 *   npm run lint:tokens -- --update rewrite the baseline after real progress
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const BASELINE = join(ROOT, 'scripts', 'design-tokens-baseline.json')
const UPDATE = process.argv.includes('--update')

/** Primitives may hold literal values — they are the one place a change is central. */
const SKIP_DIRS = ['components/ui', 'node_modules', '.next']

/** Printed and exported artifacts need fixed colours regardless of theme. */
const SKIP_FILES = [
  'app/(app)/assignments/[id]/export/_components/omr-sheet-preview.tsx',
  'app/(app)/assignments/[id]/export/_components/pdf-preview.tsx',
  'app/(app)/assignments/[id]/print/page.tsx',
  'app/(app)/classrooms/[id]/report/page.tsx',
  'components/exam/print-worksheet.tsx',
]

const HUES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const PALETTE = new RegExp(
  String.raw`\b(?:bg|text|border|ring|divide|from|to|via|shadow|outline|decoration|accent|caret|fill|stroke)-(?:${HUES})-\d{2,3}\b`,
  'g'
)
const CLASS_ATTR = /className="([^"]*)"/g

function countPalette(src) {
  return (src.match(PALETTE) ?? []).length
}

/**
 * `bg-primary/10/40` — two opacity modifiers. Tailwind emits nothing for it, so
 * the element silently loses that style. Produced repeatedly by codemods whose
 * replacement pattern did not consume a trailing /N.
 */
const MALFORMED = /\b(?:bg|text|border|ring|divide|fill|shadow)-[a-z0-9-]+\/\d+\/\d+/g

function countMalformed(src) {
  return (src.match(MALFORMED) ?? []).length
}

/**
 * A card is a <div>. Matching the class signature anywhere counted inputs,
 * selects and buttons that happen to share it, which inflated this by 38.
 */
const DIV_CLASS = /<div\b[^>]*?className="([^"]*)"/g

function countHandRolledCards(src) {
  let n = 0
  for (const [, cls] of src.matchAll(DIV_CLASS)) {
    const t = cls.split(/\s+/)
    const rounded = t.some((x) => /^rounded-(sm|md|lg|xl|2xl|3xl)$/.test(x))
    const surface = t.includes('bg-card')
    const edge = t.includes('border') || t.includes('ring-1')
    if (rounded && surface && edge) n++
  }
  return n
}


/**
 * Attributes of every `<name ...>` opening tag.
 *
 * A regex like /<button\b([^>]*)>/ stops at the first `>`, which lands inside
 * `onClick={() => f()}` — that undercounted buttons 80 against a true 340.
 * This walks the tag honouring quotes and JSX braces instead.
 */
function openingTags(src, name) {
  const out = []
  let i = 0
  while ((i = src.indexOf(`<${name}`, i)) !== -1) {
    const after = src[i + 1 + name.length]
    if (after && !' \n\t/>'.includes(after)) { i += 1; continue }
    let j = i + 1 + name.length
    let depth = 0
    let quote = null
    while (j < src.length) {
      const c = src[j]
      if (quote) { if (c === quote) quote = null }
      else if (c === '"' || c === "'" || c === '`') quote = c
      else if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
      j++
    }
    out.push(src.slice(i, j + 1))
    i = j + 1
  }
  return out
}

const STYLED = /className=[{"][^"}]*(?:bg-|border|rounded|px-|py-|p-\d|hover:)/

/**
 * Form controls styled by hand instead of using Input / Textarea /
 * NativeSelect. Checkbox, radio, file, range and colour are exempt — the
 * text-field styling does not apply to them.
 */
function countHandRolledControls(src) {
  let n = 0
  for (const name of ['input', 'select', 'textarea']) {
    for (const tag of openingTags(src, name)) {
      const type = /type="(\w+)"/.exec(tag)?.[1]
      if (type && ['checkbox', 'radio', 'file', 'range', 'color', 'hidden'].includes(type)) continue
      if (/className=[{"][^"}]*(?:border|rounded|bg-card|bg-background)/.test(tag)) n++
    }
  }
  return n
}

/**
 * Buttons styled by hand instead of using Button / IconButton. Counted only
 * when they carry visual styling — a bare <button> wrapping a custom element
 * is a legitimate hit target, not a styled control.
 */
function countHandRolledButtons(src) {
  return openingTags(src, 'button').filter((t) => STYLED.test(t)).length
}

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    const rel = relative(ROOT, full).split(sep).join('/')
    if (SKIP_DIRS.some((d) => rel === d || rel.startsWith(d + '/'))) continue
    if (entry.isDirectory()) await walk(full, out)
    else if (entry.name.endsWith('.tsx')) out.push(rel)
  }
  return out
}

const files = [
  ...(await walk(join(ROOT, 'app'))),
  ...(await walk(join(ROOT, 'components'))),
].filter((f) => !SKIP_FILES.includes(f))

const current = {}
for (const rel of files) {
  const src = readFileSync(join(ROOT, rel), 'utf8')
  const palette = countPalette(src)
  const card = countHandRolledCards(src)
  const control = countHandRolledControls(src)
  const button = countHandRolledButtons(src)
  const malformed = countMalformed(src)
  if (malformed) {
    console.error(`malformed class (two opacity modifiers) in ${rel}:`)
    for (const m of src.match(MALFORMED)) console.error(`  ${m}`)
    process.exitCode = 1
  }
  if (palette || card || control || button) current[rel] = { palette, card, control, button }
}

const total = (m, k) => Object.values(m).reduce((a, v) => a + v[k], 0)

if (UPDATE || !existsSync(BASELINE)) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n')
  console.log(
    `baseline written: ${total(current, 'palette')} palette classes, ` +
      `${total(current, 'card')} hand-rolled cards, across ${Object.keys(current).length} files`
  )
  process.exit(0)
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
const regressions = []
for (const [rel, counts] of Object.entries(current)) {
  const was = baseline[rel] ?? { palette: 0, card: 0, control: 0, button: 0 }
  for (const kind of ['palette', 'card', 'control', 'button']) {
    if (counts[kind] > was[kind]) {
      regressions.push({ rel, kind, was: was[kind], now: counts[kind] })
    }
  }
}

const nowP = total(current, 'palette')
const nowC = total(current, 'card')
const wasP = total(baseline, 'palette')
const wasC = total(baseline, 'card')

console.log(`palette classes: ${nowP}  (baseline ${wasP}, ${nowP - wasP >= 0 ? '+' : ''}${nowP - wasP})`)
console.log(`hand-rolled cards: ${nowC}  (baseline ${wasC}, ${nowC - wasC >= 0 ? '+' : ''}${nowC - wasC})`)
const nowF = total(current, 'control')
const wasF = total(baseline, 'control')
console.log(`hand-rolled form controls: ${nowF}  (baseline ${wasF}, ${nowF - wasF >= 0 ? '+' : ''}${nowF - wasF})`)
const nowB = total(current, 'button')
const wasB = total(baseline, 'button')
console.log(`hand-rolled buttons: ${nowB}  (baseline ${wasB}, ${nowB - wasB >= 0 ? '+' : ''}${nowB - wasB})`)

if (regressions.length) {
  const files = new Set(regressions.map((r) => r.rel)).size
  console.error(
    `\n${regressions.length} regression(s) in ${files} file(s):\n`
  )
  for (const r of regressions) {
    const what = r.kind === 'palette' ? 'raw palette classes'
      : r.kind === 'card' ? 'hand-rolled card surfaces'
      : r.kind === 'control' ? 'hand-rolled form controls'
      : 'hand-rolled buttons'
    console.error(`  ${r.rel}\n    ${what}: ${r.was} -> ${r.now}`)
  }
  console.error(
    '\nUse the semantic tokens in app/globals.css and the primitives in components/ui/.' +
      '\nIf the increase is deliberate, run: npm run lint:tokens -- --update'
  )
  process.exit(1)
}

console.log('\nno file regressed.')
