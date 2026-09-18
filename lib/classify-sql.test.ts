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
import { QUESTION_TYPE_ORDER } from './question-sort'

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
    // Compared against the list itself, not a copy of it — a copy would only
    // ever prove the test agrees with the test.
    expect(order).toEqual(QUESTION_TYPE_ORDER.filter(type => type !== 'image_label'))
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
  /**
   * One row crossing two columns, keyed under every variation below, sat beside
   * the cell each case is really about.
   *
   * Not decoration. Both sides floor their answer at 1 — `|| 1` here,
   * `GREATEST(item_count, 1)` there — so a grid whose only gradable cell is the
   * one the rule under test is meant to unkey scores 1 either way, and the case
   * agrees no matter what the SQL does with it. Without the anchor, four of the
   * five guards in that WHERE clause could each be deleted outright and this
   * whole suite stayed green — only the bound on a column's option count failed
   * anything. With it, each of those four turns exactly one case red.
   *
   * Two cells rather than one because one *is* the floor — a case has to reach
   * 2 before 1 and 2 are different numbers. One row crossing two columns is the
   * smallest shape that gets there, and it stays clear of everything the cases
   * vary: no case names an anchor column in its answers, and the anchor row
   * keys nothing but its own two columns, so it contributes exactly 2 every
   * time and each case's own row is left as it was.
   *
   * Still unpinned: `jsonb_typeof(column_value->'options') = 'array'`. Deleting
   * it changes nothing below, because a column carrying no options key then
   * reaches `jsonb_array_length(NULL)` and the NULL comparison drops the cell
   * anyway. Only a column whose options are present and not an array would tell
   * the two apart, and no case here is that.
   *
   * The three cases with no grid to anchor — no columns, no rows, an empty
   * config — stay at the floor. There is no cell to key, and 1 is the whole of
   * what those assert.
   */
  const anchorColumns = [column('anchor1'), column('anchor2')]
  const anchorRow = { id: 'anchor', text: 'anchor', answers: { anchor1: 0, anchor2: 1 } }

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
      columns: [column('origin'), column('monomer'), ...anchorColumns],
      rows: [anchorRow, { id: 'r1', text: 'a', answers: { origin: 7, monomer: 1 } }],
    }],
    ['a fractional key', {
      columns: [column('origin'), ...anchorColumns],
      rows: [anchorRow, { id: 'r1', text: 'a', answers: { origin: 1.5 } }],
    }],
    ['a negative key', {
      columns: [column('origin'), ...anchorColumns],
      rows: [anchorRow, { id: 'r1', text: 'a', answers: { origin: -1 } }],
    }],
    ['a key stored as a string', {
      columns: [column('origin'), ...anchorColumns],
      rows: [anchorRow, { id: 'r1', text: 'a', answers: { origin: '1' } }],
    }],
    ['a column carrying no id', {
      columns: [{ title: 'x', options: ['a', 'b'] }, ...anchorColumns],
      rows: [anchorRow, { id: 'r1', text: 'a', answers: { origin: 0 } }],
    }],
    ['a column whose options are missing', {
      columns: [{ id: 'origin', title: 'x' }, ...anchorColumns],
      rows: [anchorRow, { id: 'r1', text: 'a', answers: { origin: 0 } }],
    }],
    ['a wider column', {
      columns: [column('origin', 5), ...anchorColumns],
      rows: [anchorRow, { id: 'r1', text: 'a', answers: { origin: 4 } }],
    }],
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
