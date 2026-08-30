#!/usr/bin/env node
/**
 * Repairs `submission_answers` rows for `essay` questions that were written
 * before essays had a branch of their own in `buildSkeletonBase`.
 *
 * An essay saves `answer_formula: ''`, so those attempts fell through to the
 * numeric path and froze whatever evaluating an empty formula produced —
 * "undefined", or `evaluateFormula`'s error string 'สูตรไม่ถูกต้อง' if the
 * column held unparseable leftovers — into `correct_answer`. Grading then
 * marked every student wrong (`is_correct false`, `score 0`), and wherever a
 * งาน shows results the student was shown that string as the เฉลย.
 *
 * The code fix keys on `question_type`, so nothing here is needed to make new
 * attempts right, or to stop the wrong เฉลย being displayed. This only settles
 * the rows already stored: it clears the dead `correct_answer` and, for rows
 * no teacher has scored, moves `is_correct` from false to null — "รอครูตรวจ"
 * rather than a silent zero.
 *
 * What it will not do:
 *   - change any `score`, or any `submissions.total_score`
 *   - touch `is_correct` on a row a teacher already scored (`score_edited_by`)
 *   - repair a row that somehow scored above zero. A student who typed the
 *     frozen string word for word was marked fully correct by the old text
 *     comparison; taking that back is a teacher's call, so those are listed
 *     and left alone.
 *
 * Safe to re-run — it only visits rows that still look unrepaired.
 *
 *   node scripts/backfill-essay-answers.mjs --dry-run   count only, no writes
 *   node scripts/backfill-essay-answers.mjs             apply
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const DRY_RUN = process.argv.includes('--dry-run')

const PAGE_SIZE = 500
/** How many question ids go into one `in(...)` filter, so the URL stays short. */
const ID_CHUNK = 100
/** Concurrent UPDATEs. PostgREST cannot set a different value per row in one
 *  request, so the writes go out one per row, a handful at a time. */
const WRITE_CONCURRENCY = 12

function readEnv() {
  const raw = readFileSync(`${ROOT}/.env.local`, 'utf8')
  const env = {}
  for (const line of raw.split('\n')) {
    const eq = line.indexOf('=')
    if (eq === -1 || line.trimStart().startsWith('#')) continue
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('.env.local needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  return { url, key }
}

async function readAllPages(page) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error('read failed:', error.message)
      process.exit(1)
    }
    rows.push(...(data ?? []))
    if ((data ?? []).length < PAGE_SIZE) break
  }
  return rows
}

async function run() {
  const { url, key } = readEnv()
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const questions = await readAllPages((from, to) =>
    supabase.from('questions').select('id').eq('question_type', 'essay').order('id').range(from, to)
  )
  const questionIds = questions.map(q => q.id)
  console.log(`${questionIds.length} essay question(s) in the bank`)
  if (questionIds.length === 0) return

  const answers = []
  for (let i = 0; i < questionIds.length; i += ID_CHUNK) {
    const chunk = questionIds.slice(i, i + ID_CHUNK)
    answers.push(...await readAllPages((from, to) =>
      supabase
        .from('submission_answers')
        .select('id, correct_answer, is_correct, score, score_edited_by')
        .in('question_id', chunk)
        .order('id')
        .range(from, to)
    ))
  }
  console.log(`${answers.length} answer row(s) on those questions`)
  if (answers.length === 0) return

  // A row still carrying the old fall-through: either the dead correct_answer
  // is still there, or auto-grading's verdict on it is still recorded.
  const unrepaired = answers.filter(a => (a.correct_answer ?? '') !== '' || a.is_correct !== null)
  const scoredByTeacher = unrepaired.filter(a => a.score_edited_by !== null)
  const accidentalCredit = unrepaired.filter(a => a.score_edited_by === null && Number(a.score) > 0)
  const silentZero = unrepaired.filter(a => a.score_edited_by === null && Number(a.score) <= 0)

  const frozen = {}
  for (const a of unrepaired) {
    const value = JSON.stringify(a.correct_answer ?? '')
    frozen[value] = (frozen[value] ?? 0) + 1
  }

  console.log(`\n${unrepaired.length} row(s) to repair`)
  console.log('  frozen correct_answer values:', frozen)
  console.log(`  ${silentZero.length} never scored by a teacher → clear the answer, mark รอครูตรวจ (is_correct null)`)
  console.log(`  ${scoredByTeacher.length} already scored by a teacher → clear the answer only, keep their mark`)
  if (accidentalCredit.length > 0) {
    console.log(`  ${accidentalCredit.length} scored above zero without a teacher — LEFT ALONE, review by hand:`)
    for (const a of accidentalCredit) console.log(`    ${a.id} (score ${a.score})`)
  }

  const writes = [
    ...silentZero.map(a => ({ id: a.id, patch: { correct_answer: '', is_correct: null } })),
    ...scoredByTeacher.map(a => ({ id: a.id, patch: { correct_answer: '' } })),
  ]
  if (writes.length === 0) return
  if (DRY_RUN) {
    console.log(`\n--dry-run: nothing written (${writes.length} row(s) would change)`)
    return
  }

  let done = 0
  let failed = 0
  for (let i = 0; i < writes.length; i += WRITE_CONCURRENCY) {
    await Promise.all(writes.slice(i, i + WRITE_CONCURRENCY).map(async ({ id, patch }) => {
      const { error } = await supabase.from('submission_answers').update(patch).eq('id', id)
      if (error) {
        failed++
        console.error(`  ${id}: ${error.message}`)
      } else {
        done++
      }
    }))
  }

  console.log(`\ndone: ${done} written, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
