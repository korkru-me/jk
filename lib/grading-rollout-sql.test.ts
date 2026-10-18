import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const baseMigration = readFileSync(new URL('../supabase/migrations/20261018005611_assignment_regrading_and_void.sql', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20261018040444_grading_workspace_review.sql', import.meta.url), 'utf8')
const maxScoreMigration = readFileSync(new URL('../supabase/migrations/20260916230106_image_label_research_max_score.sql', import.meta.url), 'utf8')
const finalizationMigration = readFileSync(new URL('../supabase/migrations/20261014072745_attempt_expiry_finalization.sql', import.meta.url), 'utf8')
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const T = id(1), OTHER = id(2), CO = id(3), STUDENT = id(4), SUPER = id(5)
const ORG = id(10), OTHER_ORG = id(11), Q = id(20), Q2 = id(21), A = id(30), B = id(31), C = id(32)
const S1 = id(40), S2 = id(41), SB = id(42), SC = id(43), R1 = id(50), R2 = id(51), RB = id(52)
let db: PGlite

beforeEach(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TYPE public.submission_status AS ENUM ('in_progress','submitted','graded');
    CREATE TABLE public.organizations (id uuid PRIMARY KEY);
    CREATE TABLE public.users (id uuid PRIMARY KEY, role text DEFAULT 'teacher', status text DEFAULT 'active');
    CREATE TABLE public.organization_members (org_id uuid, user_id uuid);
    CREATE TABLE public.super_admins (user_id uuid PRIMARY KEY);
    CREATE TABLE public.question_shares (question_id uuid, org_id uuid);
    CREATE TABLE public.assignment_classrooms (assignment_id uuid, classroom_id uuid);
    CREATE TABLE public.classroom_co_teachers (classroom_id uuid,user_id uuid,permission text);
    CREATE TABLE public.questions (
      id uuid PRIMARY KEY, created_by uuid REFERENCES public.users(id), org_id uuid, visibility text DEFAULT 'private',
      team_edit_allowed boolean DEFAULT true, is_research_snapshot boolean DEFAULT false,
      category_id uuid, grade_level text, subject text, title text DEFAULT 'question', question_text text DEFAULT 'body',
      question_type text DEFAULT 'mcq', difficulty text, is_random boolean DEFAULT false, variables jsonb,logic_rules jsonb,
      answer_parts jsonb, answer_formula text DEFAULT 'old', answer_unit text, answer_tolerance numeric,
      mcq_options jsonb,extra_data jsonb,solution_text text,solution_image_urls text[],tags text[],image_urls text[],
      requires_work_image boolean DEFAULT false, content_fingerprint text, updated_at timestamptz DEFAULT '2026-10-01T00:00:00Z'
    );
    CREATE TABLE public.assignments (id uuid PRIMARY KEY, org_id uuid,created_by uuid,question_ids uuid[],
      question_points jsonb DEFAULT '{}',require_work_image boolean DEFAULT false,completion_rule text DEFAULT 'fixed',streak_target integer DEFAULT 3,display_max_score numeric);
    CREATE TABLE public.submissions (id uuid PRIMARY KEY,org_id uuid DEFAULT '${ORG}',assignment_id uuid REFERENCES public.assignments(id),
      student_id uuid,created_at timestamptz DEFAULT clock_timestamp(), status public.submission_status DEFAULT 'submitted',total_score numeric DEFAULT 1,max_score numeric DEFAULT 2,
      score_adjustment numeric DEFAULT -1,answer_revision bigint DEFAULT 7,current_streak integer DEFAULT 0,
      best_streak integer DEFAULT 0,streak_reached boolean DEFAULT false,closed_at timestamptz,submitted_at timestamptz,missing_work_evidence boolean DEFAULT false);
    CREATE TABLE public.submission_answers (id uuid PRIMARY KEY,org_id uuid DEFAULT '${ORG}',submission_id uuid REFERENCES public.submissions(id),
      question_id uuid REFERENCES public.questions(id),correct_answer text DEFAULT 'old',score numeric DEFAULT 0,
      max_score numeric DEFAULT 1,is_correct boolean DEFAULT false,student_answer text DEFAULT 'new',
      random_values jsonb DEFAULT '{}',math_input_modes jsonb DEFAULT '{}',work_images jsonb,option_order integer[],
      carried_over boolean DEFAULT false,check_count integer DEFAULT 0,order_index integer DEFAULT 0,
      score_edited_by uuid,score_edited_at timestamptz,teacher_feedback text DEFAULT 'kept',created_at timestamptz DEFAULT clock_timestamp());
    CREATE FUNCTION public.submission_hard_close(uuid) RETURNS timestamptz LANGUAGE sql AS $$ SELECT NULL::timestamptz $$;
    INSERT INTO public.organizations VALUES ('${ORG}'),('${OTHER_ORG}');
    INSERT INTO public.users(id) VALUES ('${T}'),('${OTHER}'),('${CO}'),('${SUPER}');
    INSERT INTO public.users(id,role) VALUES ('${STUDENT}','student');
    INSERT INTO public.super_admins VALUES ('${SUPER}');
    INSERT INTO public.organization_members VALUES ('${ORG}','${T}'),('${ORG}','${CO}'),('${OTHER_ORG}','${OTHER}');
    INSERT INTO public.questions(id,created_by,org_id) VALUES ('${Q}','${T}','${ORG}'),('${Q2}','${T}','${ORG}');
    INSERT INTO public.assignments(id,org_id,created_by,question_ids) VALUES
      ('${A}','${ORG}','${T}',ARRAY['${Q}','${Q2}']::uuid[]),
      ('${B}','${OTHER_ORG}','${OTHER}',ARRAY['${Q}']::uuid[]),
      ('${C}','${ORG}','${OTHER}',ARRAY['${Q}']::uuid[]);
    INSERT INTO public.assignment_classrooms VALUES ('${A}','${id(60)}'),('${C}','${id(61)}');
    INSERT INTO public.classroom_co_teachers VALUES ('${id(60)}','${CO}','manage'),('${id(61)}','${T}','view');
    INSERT INTO public.submissions(id,assignment_id,student_id) VALUES
      ('${S1}','${A}','${STUDENT}'),('${S2}','${A}','${STUDENT}'),('${SB}','${B}','${STUDENT}'),('${SC}','${C}','${STUDENT}');
    INSERT INTO public.submission_answers(id,submission_id,question_id) VALUES
      ('${R1}','${S1}','${Q}'),('${R2}','${S2}','${Q}'),('${RB}','${SB}','${Q}'),('${id(53)}','${SC}','${Q}');
    INSERT INTO public.submission_answers(id,submission_id,question_id,score,is_correct,order_index) VALUES
      ('${id(54)}','${S1}','${Q2}',1,true,1),('${id(55)}','${S2}','${Q2}',1,true,1);
    UPDATE public.submission_answers SET score=0.75,score_edited_by='${T}',score_edited_at='2026-10-01' WHERE id='${R1}';
    UPDATE public.questions SET extra_data='null'::jsonb WHERE id='${Q2}';
  `)
  // The real pre-rollout Production guard is installed BEFORE either grading
  // migration. Its exact catalog definition matches this expiry source slice.
  await db.exec(finalizationMigration.slice(finalizationMigration.indexOf('CREATE FUNCTION public.guard_attempt_answer_write()'),finalizationMigration.indexOf('CREATE FUNCTION public.guard_attempt_work_write()')))
  await db.exec(finalizationMigration.slice(finalizationMigration.indexOf('CREATE FUNCTION public.commit_submission_grade('),finalizationMigration.indexOf('CREATE FUNCTION public.close_expired_submission_attempts(')))
  await db.exec(maxScoreMigration)
  // Supabase projects commonly grant service_role table access by default.
  // The backup's explicit SELECT-only boundary must override that default.
  await db.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role')
  await db.exec(`
    CREATE FUNCTION public.prevent_org_id_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF OLD.org_id IS DISTINCT FROM NEW.org_id THEN RAISE EXCEPTION 'org_id is immutable'; END IF;
      RETURN NEW; END $$;
    CREATE TRIGGER prevent_org_id_change BEFORE UPDATE ON public.submission_answers FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_change();
    CREATE TRIGGER prevent_org_id_change BEFORE UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_change();
    CREATE TABLE public.rollout_header_update_probe(submission_id uuid);
    CREATE FUNCTION public.rollout_record_header_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO public.rollout_header_update_probe VALUES(NEW.id); RETURN NEW; END $$;
    -- Match the event/column boundary of Production's existing research sync
    -- trigger without copying student/research records into this local fixture.
    CREATE TRIGGER submissions_sync_education_research_score AFTER INSERT OR UPDATE OF status,total_score,max_score ON public.submissions
      FOR EACH ROW EXECUTE FUNCTION public.rollout_record_header_update();
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT EXECUTE ON FUNCTION public.submission_hard_close(uuid) TO service_role;
  `)
})
afterEach(async () => { await db.close() })

async function applyRollout() {
  await db.exec('BEGIN;LOCK TABLE public.submissions IN ACCESS EXCLUSIVE MODE;LOCK TABLE public.submission_answers IN ACCESS EXCLUSIVE MODE;')
  try {
    await db.exec(baseMigration)
    await db.exec(migration)
    await db.exec('COMMIT')
  } catch(error) { await db.exec('ROLLBACK');throw error }
}
async function row(table:string,rowId:string) {
  return (await db.query<Record<string,unknown>>(`SELECT * FROM ${table} WHERE id=$1`,[rowId])).rows[0]
}
async function prepareCreditedFile() {
  await db.query("UPDATE questions SET question_type='file_upload' WHERE id=$1",[Q])
  await db.query('UPDATE submission_answers SET score=1,is_correct=true WHERE id=$1',[R2])
  await db.exec(`UPDATE submissions s SET total_score=(SELECT sum(score) FROM submission_answers a WHERE a.submission_id=s.id),status='graded'`)
  await db.exec('DELETE FROM rollout_header_update_probe')
}

describe('grading rollout against the actual pre-existing answer fence',()=>{
  it('applies both migrations with Production-era guards already installed and preserves the changed grading fields privately',async()=>{
    await prepareCreditedFile()
    const before=await row('submission_answers',R2)
    const header=await row('submissions',S2)
    const teacher=await row('submission_answers',R1)
    await applyRollout()
    expect(await row('submission_answers',R2)).toMatchObject({score:'0',is_correct:null,answer_score:'0',answer_max_score:'1',work_max_score:'0'})
    expect(await row('submission_answers',R1)).toMatchObject({score:teacher.score,score_edited_by:T})
    expect(await row('submissions',S2)).toMatchObject({total_score:'1',status:'submitted',answer_revision:header.answer_revision})
    const backups=(await db.query<{source_table:string;grading_before:Record<string,unknown>}>('SELECT source_table,grading_before FROM grading_rollout_backups WHERE source_id IN ($1,$2)',[R2,S2])).rows
    expect(backups.find(value=>value.source_table==='submission_answers')?.grading_before).toEqual({
      score:Number(before.score),is_correct:true,max_score:1,score_edited_by:null,score_edited_at:null,
    })
    expect(backups.find(value=>value.source_table==='submissions')?.grading_before).toMatchObject({total_score:Number(header.total_score),status:'graded',answer_revision:header.answer_revision})
    expect((await db.query<{count:number}>('SELECT count(*)::int AS count FROM grading_rollout_backups WHERE source_table=$1',['submissions'])).rows[0].count).toBe(4)
    expect(JSON.stringify(backups)).not.toMatch(/student_answer|correct_answer|random_values|work_images|grading_config/)
    expect((await db.query('SELECT * FROM rollout_header_update_probe WHERE submission_id=$1',[S1])).rows).toEqual([])
  })
  it('does not touch unchanged finished headers or invoke their existing AFTER UPDATE side effects',async()=>{
    await db.exec("UPDATE submissions s SET total_score=(SELECT sum(score) FROM submission_answers a WHERE a.submission_id=s.id),status='graded';DELETE FROM rollout_header_update_probe")
    await applyRollout()
    expect((await db.query('SELECT * FROM rollout_header_update_probe')).rows).toEqual([])
  })
  it('preserves active attempt inputs and fences, and the old finalizer still commits through the new parts trigger',async()=>{
    await prepareCreditedFile()
    await db.query("UPDATE submissions SET status='in_progress' WHERE id=$1",[S2])
    const before=await row('submission_answers',R2),header=await row('submissions',S2)
    await applyRollout()
    expect(await row('submission_answers',R2)).toMatchObject({student_answer:before.student_answer,correct_answer:before.correct_answer,random_values:before.random_values,check_count:before.check_count,order_index:before.order_index})
    expect(await row('submissions',S2)).toMatchObject({status:'in_progress',closed_at:header.closed_at,answer_revision:header.answer_revision})
    await db.exec('SET ROLE service_role')
    await expect(db.query('UPDATE submission_answers SET student_answer=$1 WHERE id=$2',['blocked',R1])).rejects.toMatchObject({code:'PT425'})
    await db.query('UPDATE submissions SET closed_at=clock_timestamp() WHERE id=$1',[S2])
    await expect(db.query('UPDATE submission_answers SET student_answer=$1 WHERE id=$2',['late',R2])).rejects.toMatchObject({code:'PT425'})
    await db.query('SELECT commit_submission_grade($1,$2,$3::jsonb)',[S2,STUDENT,JSON.stringify([{id:R2,score:1,is_correct:true},{id:id(55),score:1,is_correct:true}])])
    expect(await row('submission_answers',R2)).toMatchObject({score:'0',is_correct:null})
    expect(await row('submissions',S2)).toMatchObject({total_score:'1',status:'submitted'})
  })
  it('refuses a file-credit reset in a streak assignment and rolls back the entire rollout',async()=>{
    await prepareCreditedFile()
    await db.query("UPDATE assignments SET completion_rule='streak' WHERE id=$1",[A])
    const before=await row('submission_answers',R2)
    await expect(applyRollout()).rejects.toMatchObject({code:'PT409'})
    expect(await row('submission_answers',R2)).toEqual(before)
    expect((await db.query<{table:string|null}>("SELECT to_regclass('public.grading_rollout_backups')::text AS table")).rows[0].table).toBeNull()
  })
  it('refuses historical invalid grades before changing any published score',async()=>{
    await db.query('UPDATE submission_answers SET score=2 WHERE id=$1',[R2])
    const before=await row('submission_answers',R2)
    await expect(applyRollout()).rejects.toMatchObject({code:'22023'})
    expect(await row('submission_answers',R2)).toEqual(before)
  })
  it('refuses research-linked finished headers before any sync trigger can repoint observations',async()=>{
    await db.exec(`CREATE TABLE education_research_measurements(id uuid,assignment_id uuid,project_id uuid,org_id uuid,source_type text);
      CREATE TABLE education_research_participants(id uuid,project_id uuid,org_id uuid,student_id uuid);
      INSERT INTO education_research_measurements VALUES('${id(91)}','${A}','${id(92)}','${ORG}','korkru_exam');
      INSERT INTO education_research_participants VALUES('${id(93)}','${id(92)}','${ORG}','${STUDENT}');`)
    await expect(applyRollout()).rejects.toMatchObject({code:'PT409'})
    expect((await db.query('SELECT * FROM rollout_header_update_probe')).rows).toEqual([])
  })
  it('keeps the rollout snapshot immutable to the service client and completely unavailable to browser roles',async()=>{
    await prepareCreditedFile();await applyRollout()
    await db.exec('SET ROLE service_role')
    expect((await db.query('SELECT * FROM grading_rollout_backups')).rows.length).toBeGreaterThan(0)
    await expect(db.query("DELETE FROM grading_rollout_backups")).rejects.toMatchObject({code:'42501'})
    await db.exec('RESET ROLE;SET ROLE authenticated')
    await expect(db.query('SELECT * FROM grading_rollout_backups')).rejects.toMatchObject({code:'42501'})
  })
})
