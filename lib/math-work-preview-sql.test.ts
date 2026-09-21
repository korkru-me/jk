/**
 * Executes the PNG preview-path migration against a throwaway Postgres.
 *
 * The application and Storage layer already accept PNG, but these database
 * checks are the final authority for artifact/board references. Keep the
 * positive Safari fallback and the existing path boundaries pinned together.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const MIGRATION = new URL(
  '../supabase/migrations/20260921185046_allow_png_math_work_preview_paths.sql',
  import.meta.url,
)

const ORG_ID = '10000000-0000-4000-8000-000000000001'
const STUDENT_ID = '20000000-0000-4000-8000-000000000002'
const ASSIGNMENT_ID = '30000000-0000-4000-8000-000000000003'
const SUBMISSION_ID = '40000000-0000-4000-8000-000000000004'
const ANSWER_ID = '50000000-0000-4000-8000-000000000005'
const QUESTION_ID = '60000000-0000-4000-8000-000000000006'
const UPLOAD_ID = '70000000-0000-4000-8000-000000000007'

let db: PGlite

const MINIMAL_SCHEMA = `
  CREATE TABLE public.assignments (
    id uuid PRIMARY KEY,
    org_id uuid NOT NULL,
    mode text NOT NULL,
    scratchpad_enabled boolean NOT NULL,
    require_work_image boolean NOT NULL
  );

  CREATE TABLE public.submissions (
    id uuid PRIMARY KEY,
    org_id uuid NOT NULL,
    assignment_id uuid NOT NULL,
    student_id uuid NOT NULL,
    status text NOT NULL
  );

  CREATE TABLE public.submission_answers (
    id uuid PRIMARY KEY,
    org_id uuid NOT NULL,
    submission_id uuid NOT NULL
  );

  CREATE TABLE public.student_work_artifacts (
    org_id uuid NOT NULL,
    submission_answer_id uuid NOT NULL,
    student_id uuid NOT NULL,
    part_key text NOT NULL,
    source_type text NOT NULL,
    preview_path text NOT NULL,
    scene_path text,
    CONSTRAINT student_work_artifacts_preview_path CHECK (
      preview_path LIKE 'students/' || student_id::text || '/%/preview.webp'
      AND preview_path !~ '(^|/)\\.\\.(/|$)'
    )
  );

  CREATE TABLE public.teaching_boards (
    created_by uuid NOT NULL,
    assignment_id uuid NOT NULL,
    question_id uuid NOT NULL,
    slot smallint NOT NULL,
    preview_path text NOT NULL,
    CONSTRAINT teaching_boards_preview_path CHECK (
      preview_path LIKE 'teachers/' || created_by::text || '/' || assignment_id::text
        || '/' || question_id::text || '/' || slot::text || '/%/preview.webp'
      AND preview_path !~ '(^|/)\\.\\.(/|$)'
    )
  );

  CREATE FUNCTION public.validate_student_work_artifact_scope()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  BEGIN
    RETURN NEW;
  END;
  $$;

  CREATE TRIGGER validate_student_work_artifact_scope
    BEFORE INSERT OR UPDATE ON public.student_work_artifacts
    FOR EACH ROW EXECUTE FUNCTION public.validate_student_work_artifact_scope();
`

function studentPreview(extension: string, submissionId = SUBMISSION_ID) {
  return `students/${STUDENT_ID}/${submissionId}/${ANSWER_ID}/${UPLOAD_ID}/preview.${extension}`
}

function teacherPreview(extension: string) {
  return `teachers/${STUDENT_ID}/${ASSIGNMENT_ID}/${QUESTION_ID}/1/${UPLOAD_ID}/preview.${extension}`
}

async function insertStudentPreview(path: string, partKey: string) {
  await db.query(
    `INSERT INTO public.student_work_artifacts
      (org_id, submission_answer_id, student_id, part_key, source_type, preview_path, scene_path)
     VALUES ($1, $2, $3, $4, 'scratchpad', $5, $6)`,
    [
      ORG_ID,
      ANSWER_ID,
      STUDENT_ID,
      partKey,
      path,
      `students/${STUDENT_ID}/${SUBMISSION_ID}/${ANSWER_ID}/${UPLOAD_ID}/scene.json`,
    ],
  )
}

async function insertTeacherPreview(path: string) {
  await db.query(
    `INSERT INTO public.teaching_boards
      (created_by, assignment_id, question_id, slot, preview_path)
     VALUES ($1, $2, $3, 1, $4)`,
    [STUDENT_ID, ASSIGNMENT_ID, QUESTION_ID, path],
  )
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(MINIMAL_SCHEMA)
  await db.exec(readFileSync(MIGRATION, 'utf8'))
  await db.query(
    `INSERT INTO public.assignments
      (id, org_id, mode, scratchpad_enabled, require_work_image)
     VALUES ($1, $2, 'online', true, false)`,
    [ASSIGNMENT_ID, ORG_ID],
  )
  await db.query(
    `INSERT INTO public.submissions
      (id, org_id, assignment_id, student_id, status)
     VALUES ($1, $2, $3, $4, 'in_progress')`,
    [SUBMISSION_ID, ORG_ID, ASSIGNMENT_ID, STUDENT_ID],
  )
  await db.query(
    `INSERT INTO public.submission_answers (id, org_id, submission_id)
     VALUES ($1, $2, $3)`,
    [ANSWER_ID, ORG_ID, SUBMISSION_ID],
  )
}, 60_000)

afterAll(async () => { await db?.close() })

describe('math work PNG preview migration', () => {
  it('accepts PNG and preserves WebP for exact student scope', async () => {
    await expect(insertStudentPreview(studentPreview('png'), 'answer')).resolves.toBeUndefined()
    await expect(insertStudentPreview(studentPreview('webp'), 'part:1')).resolves.toBeUndefined()
  })

  it('rejects unsupported, traversing, and cross-submission student paths', async () => {
    await expect(insertStudentPreview(studentPreview('gif'), 'part:2')).rejects.toThrow()
    await expect(insertStudentPreview(
      `students/${STUDENT_ID}/../preview.png`,
      'part:3',
    )).rejects.toThrow()
    await expect(insertStudentPreview(
      studentPreview('png', '80000000-0000-4000-8000-000000000008'),
      'part:4',
    )).rejects.toThrow(/student work artifact scope is invalid/)
  })

  it('accepts PNG/WebP and rejects other teacher preview paths', async () => {
    await expect(insertTeacherPreview(teacherPreview('png'))).resolves.toBeUndefined()
    await expect(insertTeacherPreview(teacherPreview('webp'))).resolves.toBeUndefined()
    await expect(insertTeacherPreview(teacherPreview('gif'))).rejects.toThrow()
    await expect(insertTeacherPreview(
      `teachers/${STUDENT_ID}/${ASSIGNMENT_ID}/${QUESTION_ID}/1/../preview.png`,
    )).rejects.toThrow()
  })
})
