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

function countHandRolledCards(src) {
  let n = 0
  for (const [, cls] of src.matchAll(CLASS_ATTR)) {
    const t = cls.split(/\s+/)
    const rounded = t.some((x) => /^rounded-(sm|md|lg|xl|2xl|3xl)$/.test(x))
    const surface = t.includes('bg-card')
    const edge = t.includes('border') || t.includes('ring-1')
    if (rounded && surface && edge) n++
  }
  return n
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
  if (palette || card) current[rel] = { palette, card }
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
  const was = baseline[rel] ?? { palette: 0, card: 0 }
  for (const kind of ['palette', 'card']) {
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

if (regressions.length) {
  const files = new Set(regressions.map((r) => r.rel)).size
  console.error(
    `\n${regressions.length} regression(s) in ${files} file(s):\n`
  )
  for (const r of regressions) {
    const what = r.kind === 'palette' ? 'raw palette classes' : 'hand-rolled card surfaces'
    console.error(`  ${r.rel}\n    ${what}: ${r.was} -> ${r.now}`)
  }
  console.error(
    '\nUse the semantic tokens in app/globals.css and <Card> from components/ui/card.tsx.' +
      '\nIf the increase is deliberate, run: npm run lint:tokens -- --update'
  )
  process.exit(1)
}

console.log('\nno file regressed.')
