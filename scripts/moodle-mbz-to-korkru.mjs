#!/usr/bin/env node
/**
 * Converts a Moodle course backup (.mbz) into a KorKru question-export file,
 * ready for the "นำเข้าไฟล์" button on /questions.
 *
 * A .mbz is a gzipped tar holding questions.xml (the whole question bank),
 * files.xml (image metadata) and files/ (the image blobs, named by content
 * hash). This walks the bank, maps each Moodle question type onto the closest
 * KorKru one, and writes a single `.korkru.json` in the format defined by
 * lib/question-portable.ts.
 *
 * Two mappings deserve a note:
 *
 *   qtype_formulas → 'written' + is_random. Moodle's `{a}` placeholders are
 *   already KorKru's syntax. Its `varsglobal` intermediates are inlined into
 *   the part's answer formula (Fx = b*cos(pi()*a/180), answer "Fx" →
 *   "b*cos(pi*a/180)"); one that the question *displays* becomes a KorKru
 *   variable of its own instead — a constant, or a derived Variable.formula
 *   when it's computed from the random variables.
 *
 *   images. Moodle embeds <img src="@@PLUGINFILE@@/name.jpg"> inline in the
 *   question HTML; KorKru keeps images in a separate image_urls[] rendered
 *   below the text. The <img> tags are lifted out of the HTML and their blobs
 *   uploaded to the question-images bucket (--upload-images).
 *
 * Usage:
 *   node scripts/moodle-mbz-to-korkru.mjs <backup.mbz> [options]
 *
 * Options:
 *   --out <file>       output path (default: <backup>.korkru.json)
 *   --subject <name>   subject stamped on every question (default: ฟิสิกส์)
 *   --grade <level>    grade_level stamped on every question (default: none)
 *   --upload-images    upload image blobs to Supabase and fill image_urls
 *   --user <uuid>      owner for the uploaded image paths (required with --upload-images)
 *   --categories <f>   also write the category list to paste into /admin/categories
 *   --limit <n>        convert only the first n questions (for a trial run)
 *   --dry-run          report what would convert; write nothing
 *
 * --upload-images reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * from .env.local. Uploading is the only step that touches the live project;
 * without the flag the script is entirely offline.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { XMLParser } from 'fast-xml-parser'

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const positional = []
  const opts = { subject: 'ฟิสิกส์', grade: null, out: null, categories: null, limit: Infinity }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--upload-images') opts.uploadImages = true
    else if (a === '--dry-run') opts.dryRun = true
    else if (a === '--out') opts.out = argv[++i]
    else if (a === '--subject') opts.subject = argv[++i]
    else if (a === '--grade') opts.grade = argv[++i]
    else if (a === '--user') opts.user = argv[++i]
    else if (a === '--categories') opts.categories = argv[++i]
    else if (a === '--limit') opts.limit = Number(argv[++i])
    else if (a.startsWith('--')) fail(`ไม่รู้จักตัวเลือก ${a}`)
    else positional.push(a)
  }
  if (positional.length !== 1) fail('ระบุไฟล์ .mbz หนึ่งไฟล์')
  opts.mbz = positional[0]
  if (opts.uploadImages && !opts.user) fail('--upload-images ต้องระบุ --user <uuid> ด้วย')
  return opts
}

function fail(msg) {
  console.error(`\n  ✗ ${msg}\n`)
  process.exit(1)
}

// ─── Extract ─────────────────────────────────────────────────────────────────

function extractBackup(mbzPath) {
  if (!existsSync(mbzPath)) fail(`ไม่พบไฟล์ ${mbzPath}`)
  const dir = mkdtempSync(path.join(tmpdir(), 'mbz-'))
  // The system tar handles .mbz (gzipped tar) on both macOS and Linux, and
  // keeps this script free of an archive dependency.
  execFileSync('tar', ['-xzf', mbzPath, '-C', dir], { stdio: ['ignore', 'ignore', 'pipe'] })
  if (!existsSync(path.join(dir, 'questions.xml'))) {
    rmSync(dir, { recursive: true, force: true })
    fail('ไฟล์นี้ไม่มี questions.xml — อาจไม่ใช่ backup ของคอร์ส Moodle')
  }
  return dir
}

// ─── XML ─────────────────────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Everything here is text or markup; letting the parser coerce "0.5" or
  // "37,53" to numbers loses formatting the formula translation depends on.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
})

const asArray = v => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v])
const text = v => (v === undefined || v === null ? '' : String(v))

/** Moodle writes an unset field as this sentinel rather than an empty element. */
const NULLISH = '$@NULL@$'
const clean = v => {
  const s = text(v).trim()
  return s === NULLISH ? '' : s
}

// ─── Formula translation ─────────────────────────────────────────────────────

/**
 * qtype_formulas `varsrandom` → KorKru Variable[].
 *
 *   a={1:10:1}   an evenly spaced ladder. Moodle's upper bound is exclusive,
 *                so the KorKru max is one step below it.
 *   a={37,53}    an explicit set. One distinct value becomes a constant, an
 *                arithmetic run collapses to min/max/step, and anything else
 *                keeps the list in Variable.values.
 */
function parseVarsRandom(raw) {
  const vars = []
  const unsupported = []

  for (const line of text(raw).split(';')) {
    const stmt = line.trim()
    if (!stmt) continue
    const m = stmt.match(/^(\w+)\s*=\s*\{([\s\S]*)\}$/)
    if (!m) { unsupported.push(stmt); continue }

    const [, name, body] = m
    // Moodle allows mixing a set and a range in one literal ({0.1,0.2,0.3:0.5});
    // that hybrid is rare enough to report rather than guess at.
    if (body.includes(':') && body.includes(',')) { unsupported.push(stmt); continue }

    if (body.includes(':')) {
      const nums = body.split(':').map(Number)
      if (nums.some(n => !isFinite(n))) { unsupported.push(stmt); continue }
      const [start, end] = nums
      const step = nums.length > 2 ? nums[2] : 1
      vars.push({ name, min: start, max: round(end - step), step, type: 'value' })
      continue
    }

    const values = [...new Set(body.split(',').map(s => Number(s.trim())))].sort((a, b) => a - b)
    if (values.length === 0 || values.some(n => !isFinite(n))) { unsupported.push(stmt); continue }

    if (values.length === 1) {
      vars.push({ name, min: values[0], max: values[0], step: 1, type: 'value', is_constant: true, constant_value: values[0] })
      continue
    }

    const step = round(values[1] - values[0])
    const arithmetic = values.every((v, i) => i === 0 || Math.abs(v - values[i - 1] - step) < 1e-9)
    vars.push(arithmetic
      ? { name, min: values[0], max: values[values.length - 1], step, type: 'value' }
      : { name, min: values[0], max: values[values.length - 1], step, type: 'value', values })
  }

  return { vars, unsupported }
}

function round(n) {
  return Math.abs(n - Math.round(n)) < 1e-9 ? Math.round(n) : Number(n.toFixed(10))
}

/**
 * Moodle's formula dialect → mathjs.
 *
 *   pi()      is a call in Moodle and a constant in mathjs.
 *   [expr]    qtype_formulas wraps a part's answer in a list, one entry per
 *             answer box. mathjs would read that as a matrix literal and
 *             return an array instead of a number, so a single-entry list is
 *             unwrapped. (Multi-box parts don't occur here; a list that really
 *             holds several entries is left alone and reported downstream.)
 */
function toMathjs(expr) {
  const normalized = text(expr).replace(/\bpi\s*\(\s*\)/g, 'pi').trim()
  const list = normalized.match(/^\[([\s\S]*)\]$/)
  return list && !list[1].includes(',') ? list[1].trim() : normalized
}

function parseVarsGlobal(raw) {
  const globals = new Map()
  for (const line of text(raw).split(';')) {
    const stmt = line.trim()
    if (!stmt) continue
    const m = stmt.match(/^(\w+)\s*=\s*([\s\S]+)$/)
    if (m) globals.set(m[1], toMathjs(m[2]))
  }
  return globals
}

// Matches a bare identifier, i.e. one not followed by "(" — a function call is
// mathjs's own (sqrt, sin), never a varsglobal name.
const BARE_IDENTIFIER = /\b[A-Za-z_]\w*\b(?!\s*\()/g

/**
 * Substitutes varsglobal definitions into an expression until only random
 * variables remain. Bounded, so a self-referential definition (`ans = ans`,
 * which real banks do contain) can't spin forever.
 */
function inlineGlobals(expr, globals, depth = 0) {
  if (depth > 15) return expr
  let changed = false
  const next = expr.replace(BARE_IDENTIFIER, name => {
    if (!globals.has(name)) return name
    changed = true
    return `(${globals.get(name)})`
  })
  return changed ? inlineGlobals(next, globals, depth + 1) : next
}

// ─── HTML / images ───────────────────────────────────────────────────────────

const IMG_TAG = /<img\b[^>]*>/gi
const SRC_ATTR = /\bsrc\s*=\s*"([^"]*)"|\bsrc\s*=\s*'([^']*)'/i
// An <a> pointing at a backup file, which Moodle editors also produce for a
// picture the author linked rather than embedded. Left alone it would leave a
// raw "@@PLUGINFILE@@" URL in the question, so it's treated as one more image.
const PLUGINFILE_LINK = /<a\b[^>]*\bhref\s*=\s*["']((?:@@PLUGINFILE@@)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
const HTML_COMMENT = /<!--[\s\S]*?-->/g

/**
 * Pulls every <img> out of a rich-text fragment.
 *
 * KorKru renders images from dedicated fields (image_urls[], MCQOption.image_url,
 * MatchingPair.left_image) rather than inline in the text, so the tags are
 * removed and their sources returned separately. `resolve` turns one Moodle src
 * into an image record, or null when it can't be found.
 */
function extractImages(html, resolve) {
  const sources = []
  const take = src => {
    const resolved = resolve(src)
    if (resolved) sources.push(resolved)
  }

  const stripped = text(html)
    .replace(HTML_COMMENT, '')
    .replace(IMG_TAG, tag => {
      const m = tag.match(SRC_ATTR)
      take(m ? (m[1] ?? m[2] ?? '') : '')
      return ''
    })
    // Keep the link's own label, if it had one — only the file reference goes.
    .replace(PLUGINFILE_LINK, (_, href, label) => { take(href); return label })

  return { html: collapseEmptyParagraphs(stripped), sources }
}

/**
 * Where an image's uploaded URL should be written once it exists.
 *
 * Images can't be uploaded while a question is being built (that would mean a
 * network round trip per question), so each one is recorded with the callback
 * that files its URL into the right field, and the callbacks run after the
 * upload pass. Without --upload-images they simply never run.
 */
function slot(slots, images, assign) {
  for (const image of images) slots.push({ image, assign })
}

/**
 * Removing an <img> usually leaves an empty wrapper behind — sometimes several
 * layers of them, since Moodle's editor nests <span>s inside the <p>. Anything
 * that carries no words after the tags come off is dropped.
 */
function collapseEmptyParagraphs(html) {
  let out = html
  for (let pass = 0; pass < 3; pass++) {
    const next = out
      .replace(/<(p|span|div)\b[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/\1>/gi, '')
      .replace(/(?:\s*<br\s*\/?>\s*)+$/i, '')
    if (next === out) break
    out = next
  }
  return plainText(out) ? out.trim() : ''
}

// Fields KorKru stores as plain text (MCQ options, matching pairs, answer part
// labels) can't carry <sup>/<sub>, and dropping the tags turns "kg·m/s²" into
// "kg·m/s 2" — a different unit. Unicode has the digits and signs that physics
// notation actually uses, so they survive as characters instead.
const SUPERSCRIPT = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','−':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','i':'ⁱ' }
const SUBSCRIPT   = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋','−':'₋','=':'₌','(':'₍',')':'₎','a':'ₐ','e':'ₑ','i':'ᵢ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','x':'ₓ' }

/** Renders one sup/sub body, falling back to ^x / _x when Unicode has no glyph. */
function toScript(inner, table, marker) {
  const chars = [...inner]
  return chars.every(c => table[c]) ? chars.map(c => table[c]).join('') : marker + inner
}

function plainText(html) {
  return text(html)
    .replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, (_, inner) => toScript(plainInner(inner), SUPERSCRIPT, '^'))
    .replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, (_, inner) => toScript(plainInner(inner), SUBSCRIPT, '_'))
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Moodle nests <span> inside <sup>, so the body needs its own tag strip. */
function plainInner(html) {
  return text(html).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim()
}

const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' }

/**
 * Indexes files.xml by itemid: filename → blob on disk. Moodle stores blobs
 * deduplicated under files/<first 2 hash chars>/<hash>, and an itemid is
 * whichever row owns the image — see collectItemIds.
 */
function indexFiles(root) {
  const xml = parser.parse(readFileSync(path.join(root, 'files.xml'), 'utf8'))
  const byItem = new Map()
  for (const f of asArray(xml.files?.file)) {
    const filename = clean(f.filename)
    if (!filename || filename === '.') continue
    const hash = clean(f.contenthash)
    const blob = path.join(root, 'files', hash.slice(0, 2), hash)
    if (!existsSync(blob)) continue
    const itemid = clean(f.itemid)
    if (!byItem.has(itemid)) byItem.set(itemid, new Map())
    byItem.get(itemid).set(filename, {
      hash,
      blob,
      mimetype: clean(f.mimetype),
      ext: EXT_BY_MIME[clean(f.mimetype)] ?? (path.extname(filename).slice(1).toLowerCase() || 'jpg'),
    })
  }
  return byItem
}

const DATA_URI = /^data:(image\/[a-z+]+);base64,(.+)$/i

/**
 * Every itemid a question's images can hang off.
 *
 * files.xml keys the question stem's images by the question id, but images
 * inside an option, a match row or a formulas sub-part by that *row's* id
 * instead — so resolving by question id alone silently loses them. Collecting
 * every id in the question's subtree covers all of those areas without having
 * to enumerate each plugin's shape.
 */
function collectItemIds(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectItemIds(child, out)
    return out
  }
  if (node && typeof node === 'object') {
    if (node['@_id'] !== undefined) out.push(clean(node['@_id']))
    for (const key of Object.keys(node)) {
      if (key !== '@_id') collectItemIds(node[key], out)
    }
  }
  return out
}

function filesForQuestion(question, filesByItem) {
  const merged = new Map()
  for (const id of collectItemIds(question)) {
    const files = filesByItem.get(id)
    if (!files) continue
    for (const [name, file] of files) merged.set(name, file)
  }
  return merged
}

/**
 * Turns one Moodle <img src> into a record the uploader can handle, or null
 * when it can't be resolved. Two forms appear in a backup: the @@PLUGINFILE@@
 * placeholder pointing into files/, and an inline base64 data: URI.
 */
function makeImageResolver(filesForQuestion, stats) {
  return src => {
    const dataMatch = src.match(DATA_URI)
    if (dataMatch) {
      const [, mimetype, b64] = dataMatch
      const data = Buffer.from(b64, 'base64')
      stats.embedded++
      return { data, ext: EXT_BY_MIME[mimetype] ?? 'png', mimetype, key: `b64-${hashOf(data)}` }
    }

    const placeholder = src.match(/^@@PLUGINFILE@@\/(.+)$/)
    if (!placeholder) { stats.external++; return null }

    // Trailing "?time=..." cache-busters are common in Moodle-authored HTML.
    const filename = decodeURIComponent(placeholder[1].split('?')[0])
    const file = filesForQuestion?.get(filename)
    if (!file) { stats.missing++; return null }
    stats.resolved++
    return { path: file.blob, ext: file.ext, mimetype: file.mimetype, key: file.hash }
  }
}

function hashOf(buffer) {
  // Only needs to be stable per-run, to dedupe identical embedded images.
  let h = 0
  for (let i = 0; i < buffer.length; i += 97) h = (h * 31 + buffer[i]) >>> 0
  return `${buffer.length.toString(36)}-${h.toString(36)}`
}

// ─── Question mapping ────────────────────────────────────────────────────────

// A function, not a shared constant: the arrays and objects here are per
// question and some of them get mutated (image URLs are pushed in once the
// upload resolves), so handing every question the same literal would pool
// every question's images into one list.
function baseQuestion() {
  return {
    difficulty: 'medium',
    is_random: false,
    variables: [],
    logic_rules: [],
    answer_formula: '',
    answer_unit: null,
    answer_tolerance: 0.01,
    answer_parts: null,
    mcq_options: null,
    extra_data: {},
    solution_text: null,
    solution_image_urls: [],
    tags: null,
    image_urls: [],
    requires_work_image: false,
  }
}

function optionRows(plugin, key) {
  return asArray(plugin?.answers?.answer).map(a => ({
    text: text(a.answertext),
    isCorrect: Number(clean(a.fraction) || 0) > 0,
  }))
}

/** Moodle marks the answer as a link to the True/False answer row's id. */
function trueFalseAnswer(plugin) {
  const trueId = clean(plugin?.truefalse?.trueanswer)
  const row = asArray(plugin?.answers?.answer).find(a => clean(a['@_id']) === trueId)
  return Number(clean(row?.fraction) || 0) > 0
}

function convertQuestion(q, ctx) {
  const qtype = clean(q.qtype)
  const title = plainText(q.name).slice(0, 200) || 'โจทย์ไม่มีชื่อ'

  // A 'random' question is not a question at all — it's a Moodle quiz slot
  // that draws from a category at attempt time. KorKru expresses that with
  // question sets instead, so there is nothing here to carry over.
  if (qtype === 'random') return { skip: 'random' }

  const stem = extractImages(q.questiontext, ctx.resolveImage)
  const feedback = plainText(q.generalfeedback)
  const slots = []

  const question = {
    ...baseQuestion(),
    title,
    // A stem that was nothing but a diagram would leave the question looking
    // blank in the editor, so the Moodle question name stands in for it.
    question_text: stem.html || `<p>${escapeHtml(title)}</p>`,
    subject: ctx.subject,
    grade_level: ctx.grade,
    category_name: ctx.categoryPath,
    solution_text: feedback || null,
  }
  slot(slots, stem.sources, url => question.image_urls.push(url))

  const done = (fields, note) => ({ question: Object.assign(question, fields), slots, note })

  switch (qtype) {
    case 'multichoice':
    case 'multichoiceset': {
      const plugin = q[`plugin_qtype_${qtype}_question`]
      const rows = optionRows(plugin)
      if (rows.length === 0) return { skip: 'no-options' }

      const single = qtype === 'multichoice' && clean(plugin?.multichoice?.single) === '1'
      const correctCount = rows.filter(o => o.isCorrect).length

      // KorKru's 'mcq' grading accepts exactly one correct option. A Moodle
      // question with several becomes the "ถูก-ผิดแบบชุด" shape instead —
      // one composite true_false part whose choices are the options and whose
      // target is the correct ones — which grades every choice.
      if (single && correctCount === 1) {
        const options = rows.map((o, i) => {
          const extracted = extractImages(o.text, ctx.resolveImage)
          // MCQ options are plain text in KorKru (the editor is a plain input
          // and the exam prints opt.text verbatim), so Moodle's option markup
          // has to be flattened or students would read the tags.
          //
          // A picture-only option needs *some* text regardless: the exam uses
          // opt.text as the answer's identity, so several blank options would
          // be indistinguishable to both the student and the grader. The Thai
          // choice letter is the natural stand-in.
          const label = plainText(extracted.html) || CHOICE_LETTERS[i] || `ตัวเลือก ${i + 1}`
          const option = { text: label, is_correct: o.isCorrect }
          // MCQOption holds a single image, so a rare multi-image option keeps
          // the first and sends the rest to the question's own gallery.
          slot(slots, extracted.sources, url => {
            if (option.image_url) question.image_urls.push(url)
            else option.image_url = url
          })
          return option
        })
        return done({ question_type: 'mcq', mcq_options: options })
      }

      // TrueFalseStatement carries no image of its own, so a picture-based
      // choice puts its image in the question's gallery and keeps the choice
      // letter as its label — otherwise the student is handed a column of
      // blank checkboxes with no way to tell which picture each one means.
      const choices = rows.map((o, i) => {
        const extracted = extractImages(o.text, ctx.resolveImage)
        slot(slots, extracted.sources, url => question.image_urls.push(url))
        const label = plainText(extracted.html)
          ? extracted.html
          : (CHOICE_LETTERS[i] ?? `ตัวเลือก ${i + 1}`)
        return { id: `c${i + 1}`, text: label, correct_answer: o.isCorrect }
      })

      return done({
        question_type: 'composite',
        extra_data: {
          parts: [{
            id: 'p1',
            type: 'true_false',
            text: '',
            score: Math.max(1, correctCount),
            choices,
            select_target: 'correct',
          }],
        },
      }, 'multi-answer')
    }

    case 'truefalse': {
      const plugin = q.plugin_qtype_truefalse_question
      return done({
        question_type: 'true_false',
        extra_data: {
          correct_answer: trueFalseAnswer(plugin),
          explanation_mode: 'none',
          score_answer: 1,
          score_explanation: 1,
        },
      })
    }

    case 'match': {
      const plugin = q.plugin_qtype_match_question
      const pairs = []
      for (const m of asArray(plugin?.matches?.match)) {
        const left = extractImages(m.questiontext, ctx.resolveImage)
        const rightText = plainText(m.answertext)
        // Moodle allows a distractor row: a right-hand answer with no prompt.
        if (!rightText || (!plainText(left.html) && left.sources.length === 0)) continue
        const pair = { left_text: plainText(left.html), right_text: rightText }
        slot(slots, left.sources, url => { if (!pair.left_image) pair.left_image = url })
        pairs.push(pair)
      }
      if (pairs.length === 0) return { skip: 'no-pairs' }
      return done({ question_type: 'matching', mcq_options: pairs })
    }

    case 'essay':
      return done({ question_type: 'essay' })

    case 'shortanswer':
    case 'numerical': {
      const plugin = q[`plugin_qtype_${qtype}_question`]
      const best = asArray(plugin?.answers?.answer)
        .filter(a => Number(clean(a.fraction) || 0) > 0)
        .map(a => clean(a.answertext))[0]
      // Non-numeric short answers have no KorKru counterpart: 'written' grades
      // by evaluating a formula, so a word answer would always mark wrong.
      if (best === undefined || !isFinite(Number(best))) return { skip: 'non-numeric-answer' }
      const value = String(Number(best))
      return done({
        question_type: 'written',
        answer_formula: value,
        answer_parts: [{ id: 'a1', sub_text: '', formula: value, unit: '', tolerance: 0.01 }],
      })
    }

    case 'formulas':
      return convertFormulas(q, question, slots, ctx)

    default:
      return { skip: `qtype:${qtype}` }
  }
}

// Mirrors CHOICE_LABELS in components/exam/exam-client.tsx.
const CHOICE_LETTERS = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ']

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** The formula placeholders Moodle leaves in the stem where each answer box goes. */
const PART_PLACEHOLDER = /\{#\d+\}/g

function convertFormulas(q, question, slots, ctx) {
  const plugin = q.plugin_qtype_formulas_question
  const { vars, unsupported } = parseVarsRandom(plugin?.formulas?.varsrandom)
  if (unsupported.length > 0) return { skip: 'varsrandom-syntax', detail: unsupported[0] }

  const globals = parseVarsGlobal(plugin?.formulas?.varsglobal)
  const known = new Set(vars.map(v => v.name))

  // KorKru lays the answer boxes out under the stem, labelled ก/ข/ค, so the
  // inline {#1} markers have nothing left to point at.
  const questionText = collapseEmptyParagraphs(question.question_text.replace(PART_PLACEHOLDER, ''))

  // Moodle substitutes varsglobal into the stem too, so `{g}` can name an
  // intermediate rather than a random variable. A numeric one becomes a
  // constant; anything computed from the random variables becomes a KorKru
  // derived variable (Variable.formula), which is evaluated right after
  // sampling and substitutes into `{g}` the same way.
  for (const name of stemPlaceholders(questionText)) {
    if (known.has(name)) continue
    const definition = globals.get(name)
    if (definition === undefined) return { skip: 'undefined-stem-variable', detail: `{${name}}` }

    if (NUMERIC_LITERAL.test(definition)) {
      const value = Number(definition)
      vars.push({ name, min: value, max: value, step: 1, type: 'value', is_constant: true, constant_value: value })
    } else {
      // Inlined rather than left as-is, because KorKru resolves a derived
      // formula against the sampled variables only — it has no notion of
      // Moodle's other intermediates.
      const formula = inlineGlobals(definition, globals)
      const unknowns = (formula.match(BARE_IDENTIFIER) ?? [])
        .filter(id => !known.has(id) && id !== 'pi' && id !== 'e')
      if (unknowns.length > 0) return { skip: 'unresolved-variable', detail: unknowns[0] }
      vars.push({ name, min: 0, max: 0, step: 1, type: 'value', formula })
    }
    known.add(name)
  }

  const parts = []
  for (const [i, a] of asArray(plugin?.formulas_answers?.formulas_answer).entries()) {
    const formula = inlineGlobals(toMathjs(a.answer), globals)
    // Anything left that isn't a random variable or a mathjs constant means a
    // definition we couldn't resolve — better to report than to ship a
    // question whose answer silently fails to evaluate.
    const leftovers = (formula.match(BARE_IDENTIFIER) ?? [])
      .filter(name => !known.has(name) && name !== 'pi' && name !== 'e')
    if (leftovers.length > 0) return { skip: 'unresolved-variable', detail: leftovers[0] }

    const subText = extractImages(a.subqtext, ctx.resolveImage)
    slot(slots, subText.sources, url => question.image_urls.push(url))

    parts.push({
      id: `a${i + 1}`,
      sub_text: plainText(subText.html),
      formula,
      unit: clean(a.postunit),
      tolerance: 0.01,
    })
  }
  if (parts.length === 0) return { skip: 'no-answer-parts' }

  return {
    question: Object.assign(question, {
      question_text: questionText,
      question_type: 'written',
      is_random: vars.length > 0,
      variables: vars,
      answer_parts: parts,
      answer_formula: parts[0].formula,
      answer_unit: parts[0].unit || null,
      extra_data: { part_label_style: 'thai' },
    }),
    slots,
  }
}

const NUMERIC_LITERAL = /^-?\d+(\.\d+)?$/

// `{a}` but not `{#1}` or LaTeX's `10^{2}` — only identifiers KorKru would
// treat as a variable name.
function stemPlaceholders(html) {
  return [...new Set([...html.matchAll(/\{([A-Za-z_]\w*)\}/g)].map(m => m[1]))]
}

// ─── Walk the bank ───────────────────────────────────────────────────────────

function collectQuestions(root, opts) {
  const xml = parser.parse(readFileSync(path.join(root, 'questions.xml'), 'utf8'))
  const categories = asArray(xml.question_categories?.question_category)

  const nameById = new Map()
  const parentById = new Map()
  for (const c of categories) {
    nameById.set(clean(c['@_id']), plainText(c.name))
    parentById.set(clean(c['@_id']), clean(c.parent))
  }

  // Moodle auto-creates one of these per quiz/course context as a catch-all.
  // It names a Moodle context, not a topic, so it carries nothing worth
  // becoming a KorKru category — questions sitting there import uncategorised.
  const isMoodleDefaultBucket = name => /^Default for /.test(name)

  // "หมวดหลัก / หมวดย่อย" — the two-level path the import resolves against.
  // Moodle's synthetic "top" root is not a category a teacher ever sees.
  const isRealCategory = name => !!name && name !== 'top' && !isMoodleDefaultBucket(name)

  const pathOf = id => {
    const name = nameById.get(id)
    if (!isRealCategory(name)) return null
    const parentName = nameById.get(parentById.get(id))
    return isRealCategory(parentName) ? `${parentName} / ${name}` : name
  }

  const filesByItem = indexFiles(root)
  const imageStats = { resolved: 0, embedded: 0, missing: 0, external: 0 }

  const converted = []
  const imageSlots = []
  const skipped = new Map()
  const notes = []
  const categoryPaths = new Set()

  for (const cat of categories) {
    const catId = clean(cat['@_id'])
    const categoryPath = pathOf(catId)
    if (categoryPath) categoryPaths.add(categoryPath)

    for (const q of asArray(cat.questions?.question)) {
      if (converted.length >= opts.limit) break
      const ctx = {
        subject: opts.subject,
        grade: opts.grade,
        categoryPath,
        resolveImage: makeImageResolver(filesForQuestion(q, filesByItem), imageStats),
      }

      let result
      try {
        result = convertQuestion(q, ctx)
      } catch (err) {
        result = { skip: 'error', detail: err.message }
      }

      if (result.skip) {
        const key = result.skip
        skipped.set(key, (skipped.get(key) ?? 0) + 1)
        if (result.detail && notes.length < 40) {
          notes.push(`${key}: ${plainText(q.name).slice(0, 60)} — ${result.detail}`)
        }
        continue
      }
      if (result.note && notes.length < 40) {
        notes.push(`${result.note}: ${plainText(q.name).slice(0, 60)}`)
      }
      converted.push(result.question)
      imageSlots.push(...result.slots)
    }
  }

  return { converted, imageSlots, skipped, notes, imageStats, categoryPaths }
}

// ─── Image upload ────────────────────────────────────────────────────────────

function readEnvLocal() {
  const file = path.join(process.cwd(), '.env.local')
  if (!existsSync(file)) return {}
  const env = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

async function uploadImages(slots, opts) {
  const env = { ...readEnvLocal(), ...process.env }
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) fail('ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน .env.local')

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  // One upload per distinct blob — the same diagram is reused across many
  // questions in a real bank, and Moodle already deduplicated them by hash.
  const urlByKey = new Map()
  let uploaded = 0
  let failed = 0

  for (const { image, assign } of slots) {
    let publicUrl = urlByKey.get(image.key)
    if (!publicUrl) {
      const body = image.data ?? readFileSync(image.path)
      // Same `${userId}/...` prefix the in-app uploader uses, so these files
      // stay consistent with the bucket's existing ownership convention.
      const objectPath = `${opts.user}/moodle-import/${image.key}.${image.ext}`
      const { error } = await supabase.storage
        .from('question-images')
        .upload(objectPath, body, { contentType: image.mimetype || 'image/jpeg', upsert: true })
      if (error) {
        failed++
        process.stderr.write(`\n  ! อัปโหลดไม่สำเร็จ ${objectPath}: ${error.message}`)
        continue
      }
      uploaded++
      publicUrl = supabase.storage.from('question-images').getPublicUrl(objectPath).data.publicUrl
      urlByKey.set(image.key, publicUrl)
      if (uploaded % 25 === 0) process.stdout.write(`\r  อัปโหลดแล้ว ${uploaded} ไฟล์...`)
    }
    assign(publicUrl)
  }

  process.stdout.write(`\r  อัปโหลด ${uploaded} ไฟล์${failed ? ` (ล้มเหลว ${failed})` : ''}          \n`)
}

// ─── Report ──────────────────────────────────────────────────────────────────

const SKIP_LABEL = {
  random: 'โจทย์ random ของ Moodle (เป็น placeholder สุ่มจากหมวด ไม่ใช่โจทย์จริง)',
  'varsrandom-syntax': 'ไวยากรณ์ตัวแปรสุ่มที่ยังไม่รองรับ',
  'unresolved-variable': 'สูตรอ้างตัวแปรที่แทนค่าไม่ได้',
  'undefined-stem-variable': 'โจทย์อ้างตัวแปรที่ไม่ได้นิยามไว้',
  'non-numeric-answer': 'คำตอบไม่ใช่ตัวเลข (KorKru แบบเขียนตอบตรวจด้วยสูตร)',
  'no-answer-parts': 'ไม่มีช่องคำตอบ',
  'no-options': 'ไม่มีตัวเลือก',
  'no-pairs': 'ไม่มีคู่จับคู่',
  error: 'แปลงไม่สำเร็จ',
}

function report({ converted, skipped, notes, imageStats }) {
  const byType = new Map()
  for (const q of converted) byType.set(q.question_type, (byType.get(q.question_type) ?? 0) + 1)

  console.log(`\n  แปลงได้ ${converted.length} ข้อ`)
  for (const [type, n] of [...byType].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(5)}  ${type}`)
  }

  if (skipped.size > 0) {
    console.log('\n  ข้ามไป')
    for (const [reason, n] of [...skipped].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(n).padStart(5)}  ${SKIP_LABEL[reason] ?? reason}`)
    }
  }

  console.log('\n  รูปภาพ')
  console.log(`    ${String(imageStats.resolved).padStart(5)}  อ้างอิงเจอไฟล์ในแบ็กอัป`)
  if (imageStats.embedded) console.log(`    ${String(imageStats.embedded).padStart(5)}  ฝังมาแบบ base64`)
  if (imageStats.missing) console.log(`    ${String(imageStats.missing).padStart(5)}  หาไฟล์ไม่เจอ (ตกหล่น)`)
  if (imageStats.external) console.log(`    ${String(imageStats.external).padStart(5)}  ลิงก์ภายนอก (ข้าม)`)

  if (notes.length > 0) {
    console.log('\n  ควรตรวจด้วยตา')
    for (const n of notes) console.log(`    · ${n}`)
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const root = extractBackup(opts.mbz)

  try {
    const result = collectQuestions(root, opts)
    report(result)

    if (result.converted.length === 0) fail('ไม่มีโจทย์ที่แปลงได้')

    if (opts.uploadImages && !opts.dryRun) {
      console.log('')
      await uploadImages(result.imageSlots, opts)
    } else if (!opts.uploadImages) {
      console.log('\n  (ไม่ได้ใส่ --upload-images: โจทย์จะนำเข้าโดยไม่มีรูป)')
    }

    if (opts.dryRun) {
      console.log('\n  --dry-run: ไม่ได้เขียนไฟล์\n')
      return
    }

    const outPath = opts.out ?? opts.mbz.replace(/\.mbz$/i, '') + '.korkru.json'
    writeFileSync(outPath, JSON.stringify({
      format: 'korkru.question_export',
      version: 1,
      exported_at: new Date().toISOString(),
      kind: 'questions',
      questions: result.converted,
    }, null, 2))
    console.log(`\n  เขียนไฟล์ ${outPath}`)

    if (opts.categories) {
      writeFileSync(opts.categories, [...result.categoryPaths].sort().join('\n') + '\n')
      console.log(`  เขียนรายการหมวด ${result.categoryPaths.size} หมวด → ${opts.categories}`)
      console.log('  วางรายการนี้ที่ /admin/categories → "วางรายการหมวด" ก่อนนำเข้าโจทย์')
    }

    console.log('\n  ขั้นต่อไป: /questions → "นำเข้าไฟล์" แล้วเลือกไฟล์นี้\n')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

main().catch(err => fail(err.stack ?? err.message))
