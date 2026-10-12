import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  new URL('../supabase/migrations/20261007145225_assignment_late_submission_bands.sql', import.meta.url),
  'utf8',
)

const ASSIGNMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const STUDENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const DUE = '2026-10-07T09:00:00.000Z'
const CLOSE = '2026-10-10T09:00:00.000Z'
const validBands = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    starts_at: DUE,
    label: 'ส่งช้าไม่เกิน 1 วัน',
    color: 'amber',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    starts_at: '2026-10-08T09:00:00.000Z',
    label: 'ส่งช้าเกิน 1 วัน',
    color: 'red',
  },
]

let db: PGlite

beforeEach(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE public.assignments (
      id uuid PRIMARY KEY,
      start_at timestamptz,
      end_at timestamptz
    );
    CREATE TABLE public.submissions (
      id uuid PRIMARY KEY,
      assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE
    );
    CREATE TABLE public.assignment_extensions (
      id uuid PRIMARY KEY,
      assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
      student_id uuid NOT NULL,
      extended_end_at timestamptz NOT NULL
    );
  `)
  await db.exec(migrationSql)
  await db.query(
    'INSERT INTO public.assignments (id, end_at) VALUES ($1, $2)',
    [ASSIGNMENT_ID, CLOSE],
  )
})

describe('assignment late-submission migration', () => {
  it('keeps every historical assignment unclassified by default', async () => {
    const result = await db.query<{ due_at: string | null; late_bands: unknown }>(
      'SELECT due_at::text, late_bands FROM public.assignments WHERE id = $1',
      [ASSIGNMENT_ID],
    )
    expect(result.rows[0]).toEqual({ due_at: null, late_bands: [] })
  })

  it('accepts an ordered policy including repeated colours', async () => {
    const repeatedColours = validBands.map(band => ({ ...band, color: 'amber' }))
    await expect(db.query(
      'UPDATE public.assignments SET due_at = $2, late_bands = $3::jsonb WHERE id = $1',
      [ASSIGNMENT_ID, DUE, JSON.stringify(repeatedColours)],
    )).resolves.toBeDefined()
  })

  it('rejects a due time before the assignment opens', async () => {
    await expect(db.query(
      `UPDATE public.assignments
       SET start_at = $2, due_at = $3, late_bands = $4::jsonb
       WHERE id = $1`,
      [ASSIGNMENT_ID, '2026-10-07T10:00:00.000Z', DUE, JSON.stringify(validBands)],
    )).rejects.toThrow()
  })

  it.each([
    ['first band does not start at due', [{ ...validBands[0], starts_at: '2026-10-07T10:00:00.000Z' }]],
    ['bands are unordered', [validBands[0], { ...validBands[1], starts_at: DUE }]],
    ['colour is unknown', [{ ...validBands[0], color: 'pink' }]],
    ['band id is duplicated', [validBands[0], { ...validBands[1], id: validBands[0].id }]],
    ['band starts at hard close', [validBands[0], { ...validBands[1], starts_at: CLOSE }]],
    ['shape has an extra key', [{ ...validBands[0], penalty: -2 }]],
  ])('rejects %s', async (_name, candidate) => {
    await expect(db.query(
      'UPDATE public.assignments SET due_at = $2, late_bands = $3::jsonb WHERE id = $1',
      [ASSIGNMENT_ID, DUE, JSON.stringify(candidate)],
    )).rejects.toThrow()
  })

  it('locks due and colours after the first attempt while allowing a later hard close', async () => {
    await db.query(
      'UPDATE public.assignments SET due_at = $2, late_bands = $3::jsonb WHERE id = $1',
      [ASSIGNMENT_ID, DUE, JSON.stringify(validBands)],
    )
    await db.query(
      'INSERT INTO public.submissions (id, assignment_id) VALUES ($1, $2)',
      ['cccccccc-cccc-4ccc-8ccc-cccccccccccc', ASSIGNMENT_ID],
    )

    await expect(db.query(
      'UPDATE public.assignments SET due_at = $2 WHERE id = $1',
      [ASSIGNMENT_ID, '2026-10-07T10:00:00.000Z'],
    )).rejects.toThrow('assignment late-submission schedule is locked')

    await expect(db.query(
      'UPDATE public.assignments SET end_at = $2 WHERE id = $1',
      [ASSIGNMENT_ID, '2026-10-11T09:00:00.000Z'],
    )).resolves.toBeDefined()
  })

  it('allows legacy extensions and constrains a new personal due to its close', async () => {
    await expect(db.query(`
      INSERT INTO public.assignment_extensions (id, assignment_id, student_id, extended_end_at)
      VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '${ASSIGNMENT_ID}', '${STUDENT_ID}', '${CLOSE}')
    `)).resolves.toBeDefined()

    await expect(db.query(`
      UPDATE public.assignment_extensions
      SET extended_due_at = '2026-10-11T09:00:00.000Z'
      WHERE assignment_id = '${ASSIGNMENT_ID}'
    `)).rejects.toThrow()
  })
})
