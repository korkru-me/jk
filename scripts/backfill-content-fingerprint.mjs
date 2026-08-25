#!/usr/bin/env node
/**
 * Fills `questions.content_fingerprint` for questions written before the column
 * existed.
 *
 * The คลังโจทย์ list spots โจทย์ซ้ำ by grouping on this column. Rows without one
 * are skipped rather than guessed at, so until this has run the duplicate badge
 * stays absent — nothing shows a wrong count, some questions just do not warn.
 *
 * The fingerprint rules live in `lib/question-content-match.ts` and are imported
 * from there, not restated here: Node strips the types on its own, so the script
 * and the server actions cannot drift into two ideas of "the same question".
 *
 * Safe to re-run. It only visits rows that still have no fingerprint, unless
 * --all is passed, and the migration's trigger keeps a fingerprint-only write
 * from touching `updated_at`, so this does not report every question as edited.
 *
 *   node scripts/backfill-content-fingerprint.mjs            fill what is missing
 *   node scripts/backfill-content-fingerprint.mjs --dry-run  count only, no writes
 *   node scripts/backfill-content-fingerprint.mjs --all      recompute every row
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

import { questionFingerprint } from '../lib/question-content-match.ts'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const DRY_RUN = process.argv.includes('--dry-run')
const ALL = process.argv.includes('--all')

/** Same select list as CONTENT_COLUMNS in lib/question-content-match.ts. */
const CONTENT_COLUMNS =
  'id, question_text, question_type, image_urls, mcq_options, answer_formula, ' +
  'answer_unit, answer_tolerance, answer_parts, variables, logic_rules, is_random, extra_data'

const PAGE_SIZE = 500
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

async function run() {
  const { url, key } = readEnv()
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  // Research snapshots are excluded on purpose: a trigger makes them immutable,
  // so any UPDATE against one raises, and they never appear in the bank anyway.
  const page = (from, to) => {
    let query = supabase
      .from('questions')
      .select(CONTENT_COLUMNS)
      .eq('is_research_snapshot', false)
      .order('id')
      .range(from, to)
    return ALL ? query : query.is('content_fingerprint', null)
  }

  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error('read failed:', error.message)
      process.exit(1)
    }
    rows.push(...(data ?? []))
    if ((data ?? []).length < PAGE_SIZE) break
    // Filling as we go would shrink the unfingerprinted set under our own
    // paging, so reads finish before any write goes out.
  }

  console.log(`${rows.length} question(s) to fingerprint${ALL ? ' (--all)' : ''}`)
  if (rows.length === 0) return
  if (DRY_RUN) {
    console.log('--dry-run: nothing written')
    return
  }

  let done = 0
  let failed = 0
  for (let i = 0; i < rows.length; i += WRITE_CONCURRENCY) {
    await Promise.all(rows.slice(i, i + WRITE_CONCURRENCY).map(async row => {
      const fingerprint = createHash('sha256')
        .update(questionFingerprint(row))
        .digest('hex')
      const { error } = await supabase
        .from('questions')
        .update({ content_fingerprint: fingerprint })
        .eq('id', row.id)
      if (error) {
        failed++
        console.error(`  ${row.id}: ${error.message}`)
      } else {
        done++
      }
    }))
    if (done % 200 < WRITE_CONCURRENCY) console.log(`  ${done}/${rows.length}`)
  }

  console.log(`done: ${done} written, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
