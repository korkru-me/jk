/**
 * The SQL half of classify scoring, run for real.
 *
 * `education_research_question_max_score` is a plpgsql mirror of
 * `classifyCellCount` — a research project reads a question's worth through the
 * database, not through the application, so the two have to give the same
 * number for the same row. Nothing else in this repo executes a migration, so
 * without this the mirror could drift and only a teacher's exported pre/post
 * totals would show it.
 *
 * PGlite is a real Postgres compiled to wasm, so plpgsql, enums and jsonb all
 * behave as they do on the server. It runs in-process against a throwaway
 * database; nothing here can reach the project's actual Supabase.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { classifyCellCount } from './classify'

const MIGRATIONS = new URL('../supabase/migrations/', import.meta.url).pathname
const read = (file: string) => readFileSync(MIGRATIONS + file, 'utf8')

let db: PGlite

/** Enough schema for the function's argument type to exist — this is not a schema test. */
const MINIMAL_SCHEMA = `
  CREATE TYPE question_type AS ENUM (
    'mcq','written','matching','essay','true_false','fill_blank','ordering','file_upload','composite'
  );
  CREATE TABLE questions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_type question_type NOT NULL DEFAULT 'written',
    extra_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    answer_parts jsonb,
    mcq_options jsonb
  );
`

async function maxScore(config: unknown, type = 'classify'): Promise<number> {
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO questions (question_type, extra_data) VALUES ($1, $2) RETURNING id`,
    [type, JSON.stringify(config ?? {})],
  )
  const scored = await db.query<{ score: string }>(
    `SELECT education_research_question_max_score(q.*) AS score FROM questions q WHERE q.id = $1`,
    [inserted.rows[0].id],
  )
  return Number(scored.rows[0].score)
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(MINIMAL_SCHEMA)
  // The function as it stands today, lifted from the migration that created it.
  await db.exec(
    read('20260824020611_education_research_project_creation.sql')
      .match(/CREATE FUNCTION public\.education_research_question_max_score[\s\S]*?\n\$\$;/)![0],
  )
  // The two migrations under test, each applied on its own the way the CLI runs
  // them — one transaction per file, which is the whole reason they are two files.
  await db.exec(read('20260912073312_add_classify_question_type.sql'))
  await db.exec(read('20260912073314_classify_research_max_score.sql'))
}, 60_000)

afterAll(async () => { await db?.close() })

const column = (id: string, optionCount = 2) => ({
  id, title: id, options: Array.from({ length: optionCount }, (_, i) => `ตัวเลือก ${i + 1}`),
})

describe('classify migrations', () => {
  it('adds the enum label so a classify question can be stored at all', async () => {
    const labels = await db.query<{ enumlabel: string }>(
      `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'question_type' ORDER BY e.enumsortorder`,
    )
    const order = labels.rows.map(r => r.enumlabel)
    expect(order).toContain('classify')
    // lib/question-sort.ts writes this order out by hand because nothing in
    // JavaScript can read it back; a sort by ประเภทโจทย์ disagrees with the
    // database if the two ever diverge.
    expect(order).toEqual([
      'mcq', 'written', 'matching', 'essay', 'true_false', 'fill_blank', 'ordering',
      'file_upload', 'composite', 'classify',
    ])
  })

  it('leaves every other question type scoring exactly as before', async () => {
    expect(await maxScore({ parts: [{ score: 2 }, {}, {}] }, 'composite')).toBe(4)
    expect(await maxScore({ blanks: [{}, {}, {}] }, 'fill_blank')).toBe(3)
    expect(await maxScore({ items: [{}, {}] }, 'ordering')).toBe(2)
    expect(await maxScore({ statements: [{}, {}], explanation_mode: 'none' }, 'true_false')).toBe(3)
    expect(await maxScore({}, 'file_upload')).toBe(1)
  })
})

describe('education_research_question_max_score agrees with classifyCellCount', () => {
  const cases: Array<[string, unknown]> = [
    ['a full 3×2 grid', {
      columns: [column('origin'), column('monomer')],
      rows: [
        { id: 'r1', text: 'เนื้อหมู', answers: { origin: 0, monomer: 1 } },
        { id: 'r2', text: 'ยางรัดของ', answers: { origin: 1, monomer: 0 } },
        { id: 'r3', text: 'เชือกป่าน', answers: { origin: 0, monomer: 0 } },
      ],
    }],
    ['a cell the teacher never keyed', {
      columns: [column('origin'), column('monomer')],
      rows: [
        { id: 'r1', text: 'a', answers: { origin: 0, monomer: 1 } },
        { id: 'r2', text: 'b', answers: { origin: 1 } },
      ],
    }],
    ['a key pointing past the end of its options', {
      columns: [column('origin'), column('monomer')],
      rows: [{ id: 'r1', text: 'a', answers: { origin: 7, monomer: 1 } }],
    }],
    ['a fractional key', { columns: [column('origin')], rows: [{ id: 'r1', text: 'a', answers: { origin: 1.5 } }] }],
    ['a negative key', { columns: [column('origin')], rows: [{ id: 'r1', text: 'a', answers: { origin: -1 } }] }],
    ['a key stored as a string', { columns: [column('origin')], rows: [{ id: 'r1', text: 'a', answers: { origin: '1' } }] }],
    ['a column carrying no id', {
      columns: [{ title: 'x', options: ['a', 'b'] }],
      rows: [{ id: 'r1', text: 'a', answers: { origin: 0 } }],
    }],
    ['a column whose options are missing', {
      columns: [{ id: 'origin', title: 'x' }],
      rows: [{ id: 'r1', text: 'a', answers: { origin: 0 } }],
    }],
    ['a wider column', { columns: [column('origin', 5)], rows: [{ id: 'r1', text: 'a', answers: { origin: 4 } }] }],
    ['no rows at all', { columns: [column('origin')], rows: [] }],
    ['an empty config', {}],
    ['rows with no columns key', { rows: [{ id: 'r1', text: 'a', answers: {} }] }],
  ]

  for (const [label, config] of cases) {
    it(`gives the same number as the application for ${label}`, async () => {
      expect(await maxScore(config)).toBe(classifyCellCount(config) || 1)
    })
  }
})
