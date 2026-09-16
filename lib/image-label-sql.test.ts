/**
 * The SQL half of ติดป้ายบนรูป scoring, run for real.
 *
 * `education_research_question_max_score` is a plpgsql mirror of
 * `imageLabelMarkerCount` — a research project reads a question's worth through
 * the database, not through the application, so the two have to give the same
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
import { imageLabelMarkerCount } from './image-label'
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

async function maxScore(config: unknown, type = 'image_label'): Promise<number> {
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
  // Every migration since that touched this function or this enum, applied in
  // order, each on its own the way the CLI runs them — one transaction per
  // file, which is the whole reason the enum and the function are two files.
  // Replaying classify's pair first is not ceremony: the image_label function
  // body was lifted from classify's, so this is the sequence production
  // actually ran, and a mistake in the lift shows up here.
  await db.exec(read('20260912073312_add_classify_question_type.sql'))
  await db.exec(read('20260912073314_classify_research_max_score.sql'))
  await db.exec(read('20260916230103_add_image_label_question_type.sql'))
  await db.exec(read('20260916230106_image_label_research_max_score.sql'))
}, 60_000)

afterAll(async () => { await db?.close() })

const marker = (over: Record<string, unknown> = {}) => ({
  id: 'm', point: { x: 50, y: 50 }, answers: ['ปอด'], case_sensitive: false, ...over,
})

describe('image_label migrations', () => {
  it('adds the enum label so an image_label question can be stored at all', async () => {
    const labels = await db.query<{ enumlabel: string }>(
      `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'question_type' ORDER BY e.enumsortorder`,
    )
    // lib/question-sort.ts writes this order out by hand because nothing in
    // JavaScript can read it back; a sort by ประเภทโจทย์ disagrees with the
    // database the moment the two diverge. Compared against that list itself
    // rather than a copy of it, so this proves something.
    expect(labels.rows.map(r => r.enumlabel)).toEqual(QUESTION_TYPE_ORDER)
  })

  it('leaves every other question type scoring exactly as before', async () => {
    expect(await maxScore({ parts: [{ score: 2 }, {}, {}] }, 'composite')).toBe(4)
    expect(await maxScore({ blanks: [{}, {}, {}] }, 'fill_blank')).toBe(3)
    expect(await maxScore({ items: [{}, {}] }, 'ordering')).toBe(2)
    expect(await maxScore({ statements: [{}, {}], explanation_mode: 'none' }, 'true_false')).toBe(3)
    expect(await maxScore({}, 'file_upload')).toBe(1)
    expect(await maxScore({
      columns: [{ id: 'c1', title: 'x', options: ['a', 'b'] }],
      rows: [{ id: 'r1', text: 'a', answers: { c1: 1 } }],
    }, 'classify')).toBe(1)
  })

  it('would report one point per question without the branch', async () => {
    // What this migration exists to prevent: with no image_label branch the
    // question falls through to the trailing answer_parts path, and a research
    // project records a five-point worksheet as worth one.
    expect(await maxScore({
      answer_mode: 'typed',
      markers: [marker({ id: 'm1' }), marker({ id: 'm2', answers: ['จมูก'] })],
    })).toBe(2)
  })
})

describe('education_research_question_max_score agrees with imageLabelMarkerCount', () => {
  const bank = ['จมูก', 'โพรงจมูก', 'ท่อลม', 'ปอด', 'กระบังลม', 'กระดูกซี่โครง']

  /**
   * A point that is keyed under every mode, sat beside the point each case is
   * really about.
   *
   * Not decoration. Both sides floor their answer at 1 — `|| 1` here,
   * `GREATEST(item_count, 1)` there — so a question whose only point is
   * unkeyed scores 1 either way, and a case built from that one point agrees
   * no matter what the SQL does with it. Two deliberate breaks in the SQL
   * reachability rule were watched passing a version of this suite that left
   * this out. With the anchor present every case sits above the floor, where
   * 1 and 2 are different numbers.
   */
  const anchor = marker({ id: 'anchor', answers: ['จมูก'] })

  const cases: Array<[string, unknown]> = [
    ['the worksheet this type comes from', {
      image_url: '/x.png',
      answer_mode: 'drag',
      bank,
      markers: [
        marker({ id: 'm1', answers: ['จมูก'] }),
        marker({ id: 'm2', answers: ['โพรงจมูก'] }),
        marker({ id: 'm3', answers: ['ท่อลม'] }),
        marker({ id: 'm4', answers: ['ปอด'] }),
        marker({ id: 'm5', answers: ['กระบังลม'] }),
      ],
    }],
    ['a point the teacher never keyed', {
      answer_mode: 'drag', bank,
      markers: [anchor, marker({ answers: [] })],
    }],
    ['a dragged answer the bank does not offer', {
      answer_mode: 'drag', bank,
      markers: [anchor, marker({ answers: ['ถุงลม'] })],
    }],
    ['a point still reachable through one of its answers', {
      answer_mode: 'drag', bank,
      markers: [anchor, marker({ answers: ['ถุงลม', 'ปอด'] })],
    }],
    ['a typed answer, which no list can make unreachable', {
      answer_mode: 'typed', bank, markers: [anchor, marker({ answers: ['ถุงลม'] })],
    }],
    ['a dropdown point whose own options exclude its answer', {
      answer_mode: 'dropdown', bank,
      markers: [anchor, marker({ answers: ['ปอด'], options: ['หัวใจ', 'ตับ'] })],
    }],
    ['a dropdown point falling back to the bank', {
      answer_mode: 'dropdown', bank, markers: [anchor, marker({ answers: ['ปอด'] })],
    }],
    ['a dropdown point whose option list was emptied', {
      answer_mode: 'dropdown', bank, markers: [anchor, marker({ answers: ['ปอด'], options: [] })],
    }],
    ['a dropdown point keyed only through its own options', {
      // The mirror image of the case above: 'หัวใจ' is nowhere in the bank, so
      // reading the bank instead of the point's own list would unkey it.
      answer_mode: 'dropdown', bank,
      markers: [anchor, marker({ answers: ['หัวใจ'], options: ['หัวใจ', 'ตับ'] })],
    }],
    ['answers that are blank or only whitespace', {
      answer_mode: 'typed', markers: [anchor, marker({ answers: ['   ', ''] })],
    }],
    ['answers padded with spaces against a bank that is not', {
      answer_mode: 'drag', bank, markers: [anchor, marker({ answers: ['  ปอด  '] })],
    }],
    ['no answer_mode at all, which reads as typed', {
      bank, markers: [anchor, marker({ answers: ['ถุงลม'] })],
    }],
    ['an answer_mode nobody has heard of', {
      answer_mode: 'lasso', bank, markers: [anchor, marker({ answers: ['ถุงลม'] })],
    }],
    ['a drag question with no bank at all', {
      answer_mode: 'drag', markers: [anchor, marker({ answers: ['ปอด'] })],
    }],
    ['a bank holding things that are not words', {
      // jsonb_array_elements_text would read the 1 as the word "1" and make
      // this point reachable; the application never sees a non-string as a word.
      answer_mode: 'drag', bank: [1, 'ปอด', 'จมูก'], markers: [anchor, marker({ answers: ['1'] })],
    }],
    ['answers holding things that are not words', {
      answer_mode: 'typed', markers: [anchor, marker({ answers: [7, null] })],
    }],
    ['a marker that is not an object at all', {
      answer_mode: 'typed', markers: [anchor, 7, null, marker({ answers: ['ปอด'] })],
    }],
    ['markers that are not an array', { answer_mode: 'typed', markers: 'ปอด' }],
    ['no markers key', { answer_mode: 'typed', bank }],
    ['an empty markers list', { answer_mode: 'drag', bank, markers: [] }],
    ['an empty config', {}],
  ]

  for (const [label, config] of cases) {
    it(`gives the same number as the application for ${label}`, async () => {
      expect(await maxScore(config)).toBe(imageLabelMarkerCount(config) || 1)
    })
  }
})
