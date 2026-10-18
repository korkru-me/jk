import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../supabase/migrations/20261018005611_assignment_regrading_and_void.sql', import.meta.url), 'utf8')
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const T = id(1), OTHER = id(2), CO = id(3), STUDENT = id(4), SUPER = id(5)
const ORG = id(10), OTHER_ORG = id(11), Q = id(20), Q2 = id(21), A = id(30), B = id(31), C = id(32)
const S1 = id(40), S2 = id(41), SB = id(42), SC = id(43), R1 = id(50), R2 = id(51), RB = id(52)
let db: PGlite

beforeEach(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
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
      completion_rule text DEFAULT 'fixed',streak_target integer DEFAULT 3,display_max_score numeric);
    CREATE TABLE public.submissions (id uuid PRIMARY KEY,assignment_id uuid REFERENCES public.assignments(id),
      student_id uuid, status text DEFAULT 'submitted',total_score numeric DEFAULT 1,max_score numeric DEFAULT 2,
      score_adjustment numeric DEFAULT -1,answer_revision bigint DEFAULT 7,current_streak integer DEFAULT 0,
      best_streak integer DEFAULT 0,streak_reached boolean DEFAULT false,closed_at timestamptz);
    CREATE TABLE public.submission_answers (id uuid PRIMARY KEY,submission_id uuid REFERENCES public.submissions(id),
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
    UPDATE public.submission_answers SET score_edited_by='${T}',score_edited_at='2026-10-01' WHERE id='${R1}';
    UPDATE public.questions SET extra_data='null'::jsonb WHERE id='${Q2}';
  `)
  await db.exec(migration)
  await db.exec(`
    CREATE TRIGGER guard_attempt_answer_write BEFORE INSERT OR UPDATE ON public.submission_answers
      FOR EACH ROW EXECUTE FUNCTION public.guard_attempt_answer_write();
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT EXECUTE ON FUNCTION public.submission_hard_close(uuid) TO service_role;
    SET ROLE service_role;
  `)
})
afterEach(async () => { await db.close() })

type Change = { assignment_id: string; submissions: Record<string, unknown>[]; answers: Record<string, unknown>[] }
async function change(assignmentId = A, overrides: Record<string, unknown> = {}): Promise<Change> {
  const submissions = (await db.query<Record<string, unknown>>(`
    SELECT id,answer_revision,status,total_score,max_score FROM submissions WHERE assignment_id=$1 ORDER BY id`, [assignmentId])).rows
  const answers = (await db.query<Record<string, unknown>>(`
    SELECT a.id,a.submission_id,a.correct_answer,a.score,a.is_correct,a.max_score,a.grading_config,a.is_void,
      jsonb_build_object('correct_answer',a.correct_answer,'score',a.score,'is_correct',a.is_correct,'max_score',a.max_score,
        'score_edited_by',a.score_edited_by,'score_edited_at',a.score_edited_at,'student_answer',a.student_answer,
        'random_values',a.random_values,'is_void',a.is_void,'grading_config',a.grading_config) AS expected
    FROM submission_answers a JOIN submissions s ON s.id=a.submission_id
    WHERE s.assignment_id=$1 AND a.question_id=$2 ORDER BY a.id`, [assignmentId, Q])).rows.map(a => ({
      ...a, correct_answer: 'new',score: 1,is_correct: true,grading_config: { version: 1 },...overrides,
    }))
  return { assignment_id: assignmentId, submissions, answers }
}
async function apply(changes: Change[], options: { actor?: string; patch?: Record<string, unknown>; voidAssignment?: string; reason?: string; timestamp?: string | null; requiresUnused?: boolean } = {}) {
  return db.query<{ result: { batch_id: string; assignment_count: number; answer_count: number } }>(`
    SELECT public.apply_question_grading_change($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) AS result`, [
    options.actor ?? T, Q, options.timestamp === undefined ? '2026-10-01T00:00:00Z' : options.timestamp,
    JSON.stringify(options.patch ?? (options.voidAssignment ? {} : { answer_formula: 'new' })),
    JSON.stringify(changes),options.voidAssignment ?? null,options.reason ?? 'corrected key',options.requiresUnused ?? false,
  ])
}
async function row(table: string, rowId: string) {
  return (await db.query<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id=$1`, [rowId])).rows[0]
}

describe('finished assignment grading transaction', () => {
  it('backfills legacy grading rules without changing frozen keys, grades or existing teacher history', async () => {
    expect(await row('submission_answers',R1)).toMatchObject({
      correct_answer:'old',score:'0',max_score:'1',score_edited_by:T,
      grading_config:{question_type:'mcq',answer_tolerance:0.1,answer_parts:null,extra_data:{}},
    })
    expect(await row('submissions',S1)).toMatchObject({total_score:'1',max_score:'2',answer_revision:7,status:'submitted'})
    expect((await row('submission_answers',id(54))).grading_config).toMatchObject({extra_data:{}})
    const before = (await row('submission_answers',RB)).grading_config
    await db.exec(`UPDATE questions SET answer_tolerance=0.5,extra_data='{"new_rule":true}' WHERE id='${Q}'`)
    expect((await row('submission_answers',RB)).grading_config).toEqual(before)
  })
  it('freezes fresh insert rules and rejects a stale supplied config while preserving a carried old snapshot', async () => {
    const original = (await row('submission_answers',R1)).grading_config
    await db.exec(`UPDATE questions SET updated_at='2026-10-02T00:00:00Z',answer_tolerance=0.5,extra_data='{"new_rule":true}' WHERE id='${Q}'`)
    await db.query(`INSERT INTO submissions(id,assignment_id,student_id,status,max_score) VALUES($1,$2,$3,'in_progress',3)`,[id(95),A,STUDENT])
    await expect(db.query(`INSERT INTO submission_answers(id,submission_id,question_id,grading_config)
      VALUES($1,$2,$3,$4::jsonb)`,[id(96),id(95),Q,JSON.stringify(original)])).rejects.toMatchObject({code:'PT409'})
    const current = {question_type:'mcq',answer_tolerance:0.5,answer_parts:null,extra_data:{new_rule:true}}
    // Equal grading parameters cannot hide a key-only edit: the question revision also fences it.
    await expect(db.query(`INSERT INTO submission_answers(id,submission_id,question_id,grading_config)
      VALUES($1,$2,$3,$4::jsonb)`,[id(96),id(95),Q,JSON.stringify({...current,question_revision:'2026-10-01T00:00:00Z'})])).rejects.toMatchObject({code:'PT409'})
    const fresh = {...current,question_revision:'2026-10-02T00:00:00Z'}
    await db.query(`INSERT INTO submission_answers(id,submission_id,question_id,grading_config)
      VALUES($1,$2,$3,$4::jsonb)`,[id(97),id(95),Q,JSON.stringify(fresh)])
    expect((await row('submission_answers',id(97))).grading_config).toEqual(fresh)
    const carried = {...original as object,question_revision:'2026-10-01T00:00:00Z'}
    await db.query(`INSERT INTO submission_answers(id,submission_id,question_id,grading_config,carried_over,score,is_correct)
      VALUES($1,$2,$3,$4::jsonb,true,1,true)`,[id(98),id(95),Q,JSON.stringify(carried)])
    expect(await row('submission_answers',id(98))).toMatchObject({grading_config:carried,score:'1',is_correct:true,carried_over:true})
    await db.query(`INSERT INTO submission_answers(id,submission_id,question_id) VALUES($1,$2,$3)`,[id(99),id(95),Q])
    expect((await row('submission_answers',id(99))).grading_config).toEqual(current)
    const normalizedNull = {question_type:'mcq',answer_tolerance:0.1,answer_parts:null,extra_data:{},question_revision:'2026-10-01T00:00:00Z'}
    await db.query(`INSERT INTO submission_answers(id,submission_id,question_id,grading_config)
      VALUES($1,$2,$3,$4::jsonb)`,[id(100),id(95),Q2,JSON.stringify(normalizedNull)])
    expect((await row('submission_answers',id(100))).grading_config).toEqual(normalizedNull)
  })
  it('corrects all managed finished attempts atomically, audits every answer and retains manual history and adjustments', async () => {
    const result = await apply([await change()])
    expect(result.rows[0].result).toMatchObject({ assignment_count: 1,answer_count: 2 })
    expect((await row('questions',Q)).answer_formula).toBe('new')
    for (const s of [S1,S2]) expect(await row('submissions',s)).toMatchObject({ total_score: '2',max_score: '2',answer_revision: 8,score_adjustment: '-1' })
    expect(await row('submission_answers',R1)).toMatchObject({ correct_answer: 'new',score: '1',teacher_feedback: 'kept',score_edited_by: T })
    expect((await row('submission_answers',R1)).score_edited_at).not.toBeNull()
    expect(await row('submission_answers',RB)).toMatchObject({ correct_answer: 'old',score: '0' })
    const audit = (await db.query<{ old_state: { score: number }; new_state: { score: number } }>('SELECT old_state,new_state FROM question_grading_change_items')).rows
    expect(audit).toHaveLength(2)
    expect(audit[0]).toMatchObject({ old_state: {score: 0},new_state: {score: 1} })
    expect((await db.query('SELECT * FROM question_grading_change_batches')).rows).toHaveLength(1)
  })
  it('checks exact assignment scope, foreign tenants, and view-only co-teaching', async () => {
    await expect(apply([await change(),await change(B)])).rejects.toMatchObject({code:'PT409'})
    await expect(apply([await change(),await change(C)])).rejects.toMatchObject({code:'PT409'})
    await expect(apply([await change(B)],{actor:OTHER})).rejects.toMatchObject({code:'42501'})
    await expect(apply([await change()],{actor:STUDENT})).rejects.toMatchObject({code:'42501'})
    await expect(apply([await change(B)],{voidAssignment:B})).rejects.toMatchObject({code:'42501'})
  })
  it('permits an admin/manage co-teacher to void their exact assignment but never a view co-teacher', async () => {
    await apply([await change(A,{score:0,max_score:0,is_correct:true,is_void:true})],{actor:CO,voidAssignment:A})
    expect((await row('submission_answers',R1)).is_void).toBe(true)
    await expect(apply([await change(C,{score:0,max_score:0,is_correct:true,is_void:true})],{voidAssignment:C})).rejects.toMatchObject({code:'42501'})
  })
  it('permits a shared team editor while protecting tenant, owner, sharing and research snapshots', async () => {
    await db.exec(`UPDATE questions SET visibility='organization' WHERE id='${Q}'`)
    await expect(apply([await change()],{actor:CO,patch:{created_by:CO}})).rejects.toMatchObject({code:'22023'})
    await expect(apply([await change()],{actor:CO,patch:{visibility:'public'}})).rejects.toMatchObject({code:'42501'})
    await expect(apply([await change()],{actor:CO,patch:{org_id:OTHER_ORG}})).rejects.toMatchObject({code:'42501'})
    await db.exec(`UPDATE questions SET is_research_snapshot=true WHERE id='${Q}'`)
    await expect(apply([await change()],{actor:CO})).rejects.toMatchObject({code:'42501'})
    await db.exec(`UPDATE questions SET is_research_snapshot=false WHERE id='${Q}'`)
    await apply([await change()],{actor:CO})
    expect((await row('questions',Q)).answer_formula).toBe('new')
  })
  it('fences an unused structural-edit plan against answers gained in an assignment outside the managed scope', async () => {
    // The current manager owns no answer to this question, but another teacher
    // has gained one since the server planned an incompatible unused edit.
    await db.query(`DELETE FROM submission_answers WHERE question_id=$1 AND submission_id IN ($2,$3)`,[Q,S1,S2])
    await expect(apply([await change()],{requiresUnused:true,patch:{question_type:'essay'}})).rejects.toMatchObject({code:'PT409'})
    expect((await row('questions',Q)).question_type).toBe('mcq')
    expect((await db.query('SELECT * FROM question_grading_change_batches')).rows).toHaveLength(0)
    // Once genuinely unused everywhere, the trusted structural plan is allowed.
    await db.query('DELETE FROM submission_answers WHERE question_id=$1',[Q])
    await apply([await change()],{requiresUnused:true,patch:{question_type:'essay'}})
    expect((await row('questions',Q)).question_type).toBe('essay')
  })
  it('rejects any running affected attempt and any stale question/revision/status/score snapshot without partial changes', async () => {
    const c = await change()
    await db.exec(`UPDATE submissions SET status='in_progress' WHERE id='${S1}'`)
    await expect(apply([c])).rejects.toMatchObject({code:'PT409'})
    await db.exec(`UPDATE submissions SET status='submitted',answer_revision=9 WHERE id='${S1}'`)
    await expect(apply([c])).rejects.toMatchObject({code:'PT409'})
    await expect(apply([await change()],{timestamp:null})).rejects.toMatchObject({code:'PT409'})
    await expect(apply([await change()],{timestamp:'2026-09-01T00:00:00Z'})).rejects.toMatchObject({code:'PT409'})
    const score = await change(); await db.exec(`UPDATE submissions SET total_score=0 WHERE id='${S1}'`)
    await expect(apply([score])).rejects.toMatchObject({code:'PT409'})
    expect((await row('questions',Q)).answer_formula).toBe('old')
    expect((await db.query('SELECT * FROM question_grading_change_batches')).rows).toHaveLength(0)
  })
  it('rejects missing/duplicate/foreign answer ids and incomplete header sets before writing any key', async () => {
    const missing = await change(); missing.answers.pop()
    const duplicate = await change(); duplicate.answers[1] = duplicate.answers[0]
    const foreign = await change(); foreign.answers[1] = {...foreign.answers[1],id:RB,submission_id:SB}
    const incomplete = await change(); incomplete.submissions.pop()
    for (const bad of [missing,duplicate,foreign,incomplete]) await expect(apply([bad])).rejects.toThrow()
    expect((await row('questions',Q)).answer_formula).toBe('old')
    expect((await row('submission_answers',R1)).score).toBe('0')
  })
  it('requires answer snapshots and detects a concurrent manual edit even when the header total and revision stay unchanged', async () => {
    const missing = await change(); delete missing.answers[0].expected
    await expect(apply([missing])).rejects.toMatchObject({code:'22023'})
    const stale = await change()
    await db.query('UPDATE submission_answers SET score_edited_at=clock_timestamp() WHERE id=$1',[R1])
    await expect(apply([stale])).rejects.toMatchObject({code:'PT409'})
    expect((await row('questions',Q)).answer_formula).toBe('old')
    expect((await db.query('SELECT * FROM question_grading_change_batches')).rows).toHaveLength(0)
  })
  it('rejects nonfinite, negative, over-ceiling or unauthorized void grades', async () => {
    for (const values of [{score:'NaN'},{score:'Infinity'},{score:-1},{score:2},{max_score:-1},{is_void:true,score:0,max_score:0}]) {
      await expect(apply([await change(A,values)])).rejects.toMatchObject({code:'22023'})
    }
    expect((await row('questions',Q)).answer_formula).toBe('old')
  })
  it('protects finalized keys outside the RPC and resets its transaction-local bypass', async () => {
    await expect(db.query('UPDATE submission_answers SET correct_answer=$1 WHERE id=$2',['forged',R1])).rejects.toMatchObject({code:'PT425'})
    await apply([await change()])
    await expect(db.query('UPDATE submission_answers SET correct_answer=$1 WHERE id=$2',['forged',R1])).rejects.toMatchObject({code:'PT425'})
    await expect(db.query('UPDATE submission_answers SET student_answer=$1 WHERE id=$2',['forged',R1])).rejects.toMatchObject({code:'PT425'})
  })
  it('keeps its RPC and private decision/audit tables unavailable to browser roles', async () => {
    const permissions = (await db.query<{callable:boolean; readable:boolean}>(`
      SELECT has_function_privilege('authenticated','public.apply_question_grading_change(uuid,uuid,timestamptz,jsonb,jsonb,uuid,text,boolean)','EXECUTE') AS callable,
      has_table_privilege('authenticated','public.question_grading_change_items','SELECT') AS readable`)).rows[0]
    expect(permissions).toEqual({callable:false,readable:false})
    await db.exec(`RESET ROLE; GRANT SELECT,UPDATE ON submissions,submission_answers TO authenticated; GRANT SELECT ON assignment_void_questions TO authenticated; SET ROLE authenticated;`)
    await db.query("SELECT set_config('korkru.question_grading_change','on',false)")
    await expect(db.query('UPDATE submission_answers SET correct_answer=$1 WHERE id=$2',['forged',R1])).rejects.toMatchObject({code:'PT425'})
  })
  it('rolls back a bank patch, all grades and audit rows if a later database write fails', async () => {
    await db.exec(`RESET ROLE; CREATE FUNCTION reject_second_answer() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.id='${R2}' THEN RAISE EXCEPTION 'forced failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER z_reject BEFORE UPDATE ON submission_answers FOR EACH ROW EXECUTE FUNCTION reject_second_answer(); SET ROLE service_role;`)
    await expect(apply([await change()])).rejects.toThrow('forced failure')
    expect((await row('questions',Q)).answer_formula).toBe('old')
    expect((await row('submission_answers',R1)).score).toBe('0')
    expect((await db.query('SELECT * FROM question_grading_change_batches')).rows).toHaveLength(0)
  })
  it('lets a super admin correct every assignment using the question, with exact complete scope', async () => {
    await apply([await change(A),await change(B),await change(C)],{actor:SUPER})
    expect((await row('submission_answers',RB)).score).toBe('1')
  })
})

describe('assignment question void', () => {
  it('removes numerator and denominator across every finished attempt without editing the bank or other assignments', async () => {
    await apply([await change(A,{score:0,max_score:0,is_correct:true,is_void:true})],{voidAssignment:A})
    for (const s of [S1,S2]) expect(await row('submissions',s)).toMatchObject({total_score:'1',max_score:'1',voided_max_score:'1',score_adjustment:'-1'})
    expect((await row('questions',Q)).answer_formula).toBe('old')
    expect((await row('submission_answers',RB)).is_void).toBe(false)
    await expect(apply([await change(A,{score:0,max_score:0,is_correct:true,is_void:true})],{voidAssignment:A})).rejects.toMatchObject({code:'PT409'})
  })
  it('forces future answers to zero points, recalculates the attempt ceiling and cannot be manually awarded marks', async () => {
    await apply([await change(A,{score:0,max_score:0,is_correct:true,is_void:true})],{voidAssignment:A})
    await db.query(`INSERT INTO submissions(id,assignment_id,student_id,status,max_score) VALUES($1,$2,$3,'in_progress',2)`,[id(90),A,STUDENT])
    await db.query(`INSERT INTO submission_answers(id,submission_id,question_id,score,max_score) VALUES ($1,$3,$4,1,1),($2,$3,$5,0,1)`,[id(91),id(92),id(90),Q,Q2])
    expect(await row('submission_answers',id(91))).toMatchObject({score:'0',max_score:'0',void_original_max_score:'1',is_correct:true,is_void:true})
    expect(await row('submissions',id(90))).toMatchObject({max_score:'1',voided_max_score:'1'})
    await db.query('UPDATE submission_answers SET score=1,max_score=1 WHERE id=$1',[R1])
    expect(await row('submission_answers',R1)).toMatchObject({score:'0',max_score:'0',is_void:true})
  })
  it('retains each historical original weight for custom display scaling and successive voids', async () => {
    await db.exec(`UPDATE assignments SET display_max_score=10 WHERE id='${A}';
      UPDATE submission_answers SET max_score=4 WHERE id='${R1}';
      UPDATE submissions SET max_score=5 WHERE id='${S1}';`)
    await apply([await change(A,{score:0,max_score:0,is_correct:true,is_void:true})],{voidAssignment:A})
    expect(await row('submissions',S1)).toMatchObject({total_score:'1',max_score:'1',voided_max_score:'4'})
    expect(await row('submissions',S2)).toMatchObject({total_score:'1',max_score:'1',voided_max_score:'1'})
    expect((await row('assignments',A)).display_max_score).toBe('10')
    // Consumers keep the pre-void scale: 10*(1/(1+4))=2 for S1,
    // whereas S2 loses half of its original 10-point scale, leaving 5.
    const scaled = (await db.query<{id:string; displayed_ceiling:string}>(`SELECT s.id,
      a.display_max_score*s.max_score/(s.max_score+s.voided_max_score) AS displayed_ceiling
      FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.assignment_id=$1 ORDER BY s.id`,[A])).rows
    expect(scaled.map(r => Number(r.displayed_ceiling))).toEqual([2,5])
    // A second void decision captures the other original weight without double-counting Q.
    await db.exec(`INSERT INTO assignment_void_questions VALUES ('${A}','${Q2}','second void','${T}',clock_timestamp());
      SELECT set_config('korkru.question_grading_change','on',true);
      UPDATE submission_answers SET is_void=true WHERE question_id='${Q2}' AND submission_id IN ('${S1}','${S2}');`)
    const originals = (await db.query<{total:string}>(`SELECT sum(void_original_max_score) AS total FROM submission_answers WHERE submission_id=$1`,[S1])).rows[0]
    expect(originals.total).toBe('5')
  })
  it('retains original weight on a later carried-over void row and ignores normalized empty random values', async () => {
    await db.exec(`UPDATE submissions SET status='in_progress' WHERE assignment_id='${A}';
      UPDATE submission_answers SET random_values=NULL WHERE id='${R1}';
      UPDATE submission_answers SET random_values='null'::jsonb WHERE id='${R2}';
      UPDATE submissions SET status='submitted' WHERE assignment_id='${A}';`)
    const legacy = await change()
    for (const answer of legacy.answers) (answer.expected as Record<string,unknown>).random_values = {}
    await apply([legacy])
    await apply([await change(A,{score:0,max_score:0,is_correct:true,is_void:true})],{voidAssignment:A})
    await db.query(`INSERT INTO submissions(id,assignment_id,student_id,status,max_score) VALUES($1,$2,$3,'in_progress',0)`,[id(93),A,STUDENT])
    await db.query(`INSERT INTO submission_answers(id,submission_id,question_id,score,max_score,is_void,void_original_max_score,carried_over)
      SELECT $1,$2,question_id,score,max_score,is_void,void_original_max_score,true FROM submission_answers WHERE id=$3`,[id(94),id(93),R1])
    expect(await row('submissions',id(93))).toMatchObject({max_score:'0',voided_max_score:'1'})
    expect((await row('submission_answers',id(94))).void_original_max_score).toBe('1')
  })
  it('preserves a prior void when the shared bank key is corrected later', async () => {
    await apply([await change(A,{score:0,max_score:0,is_correct:true,is_void:true})],{voidAssignment:A})
    await apply([await change(A,{score:0,max_score:0,is_correct:true,is_void:true})])
    expect(await row('submissions',S1)).toMatchObject({total_score:'1',max_score:'1'})
    expect((await row('submission_answers',R1)).correct_answer).toBe('new')
  })
  it('matches the live streak verdict when a correct automatic answer still has manual explanation points', async () => {
    await db.exec(`UPDATE assignments SET completion_rule='streak',streak_target=2 WHERE id='${A}';
      UPDATE submissions SET current_streak=2,best_streak=2,streak_reached=true WHERE assignment_id='${A}';`)
    await apply([await change(A,{score:0.5,is_correct:true})])
    // The live feedback reports the automatic answer as correct even when
    // explanation marks remain for a teacher, so this remains a two-step run.
    for (const s of [S1,S2]) expect(await row('submissions',s)).toMatchObject({current_streak:2,best_streak:2,streak_reached:true})
  })
  it('keeps a streak unchanged across a pending manual answer between full-score answers', async () => {
    await db.exec(`UPDATE assignments SET completion_rule='streak',streak_target=2 WHERE id='${A}';
      UPDATE submissions SET status='in_progress' WHERE assignment_id='${A}';`)
    await db.query(`INSERT INTO submission_answers(id,submission_id,question_id,score,max_score,is_correct,order_index)
      VALUES($1,$2,$3,1,1,true,2)`,[id(101),S1,Q2])
    await db.exec(`UPDATE submissions SET status='submitted' WHERE assignment_id='${A}';
      UPDATE submissions SET max_score=3 WHERE id='${S1}';
      UPDATE submission_answers SET is_correct=NULL,score=0 WHERE id='${id(54)}';`)
    await apply([await change(A,{score:1,is_correct:true})])
    expect(await row('submissions',S1)).toMatchObject({current_streak:2,best_streak:2,streak_reached:true})
    expect(await row('submissions',S2)).toMatchObject({current_streak:2,best_streak:2,streak_reached:true})
  })
  it('recomputes chronological streaks while skipping void questions and revokes stale reached status', async () => {
    await db.exec(`UPDATE assignments SET completion_rule='streak',streak_target=2 WHERE id='${A}';
      UPDATE submission_answers SET is_correct=true,score=1 WHERE question_id='${Q}';
      UPDATE submission_answers SET is_correct=false,score=0 WHERE question_id='${Q2}';
      UPDATE submissions SET total_score=1,current_streak=2,best_streak=2,streak_reached=true WHERE assignment_id='${A}';`)
    await apply([await change(A,{score:0,is_correct:false})])
    expect(await row('submissions',S1)).toMatchObject({current_streak:0,best_streak:0,streak_reached:false})
    await db.exec(`UPDATE submission_answers SET is_correct=true,score=1 WHERE question_id='${Q2}';
      UPDATE submissions SET total_score=1 WHERE assignment_id='${A}';`)
    await apply([await change(A,{score:0,max_score:0,is_correct:true,is_void:true})],{voidAssignment:A})
    expect(await row('submissions',S1)).toMatchObject({current_streak:1,best_streak:1,streak_reached:false})
  })
})


describe('discarding an empty stale-grading attempt', () => {
  async function discard(submissionId: string, studentId = STUDENT) {
    return (await db.query<{discarded:boolean}>(
      'SELECT public.discard_empty_grading_attempt($1,$2) AS discarded',[submissionId,studentId],
    )).rows[0].discarded
  }
  it('deletes an exact owned empty attempt only while it is in progress', async () => {
    await db.query(`INSERT INTO submissions(id,assignment_id,student_id,status) VALUES($1,$2,$3,'in_progress')`,[id(110),A,STUDENT])
    expect(await discard(id(110))).toBe(true)
    expect(await row('submissions',id(110))).toBeUndefined()
    expect(await discard(id(110))).toBe(false)
  })
  it('retains an in-progress attempt as soon as it contains an answer', async () => {
    await db.query(`INSERT INTO submissions(id,assignment_id,student_id,status) VALUES($1,$2,$3,'in_progress')`,[id(111),A,STUDENT])
    await db.query(`INSERT INTO submission_answers(id,submission_id,question_id) VALUES($1,$2,$3)`,[id(112),id(111),Q])
    expect(await discard(id(111))).toBe(false)
    expect(await row('submissions',id(111))).not.toBeUndefined()
    expect(await row('submission_answers',id(112))).not.toBeUndefined()
  })
  it('retains empty attempts belonging to another student and completed attempts', async () => {
    await db.query(`INSERT INTO submissions(id,assignment_id,student_id,status) VALUES
      ($1,$4,$5,'in_progress'),($2,$4,$5,'submitted'),($3,$4,$5,'graded')`,[id(113),id(114),id(115),A,STUDENT])
    expect(await discard(id(113),OTHER)).toBe(false)
    expect(await discard(id(114))).toBe(false)
    expect(await discard(id(115))).toBe(false)
    for (const sub of [id(113),id(114),id(115)]) expect(await row('submissions',sub)).not.toBeUndefined()
  })
  it('denies browser execution even when the caller knows the exact student and attempt ids', async () => {
    await db.query(`INSERT INTO submissions(id,assignment_id,student_id,status) VALUES($1,$2,$3,'in_progress')`,[id(116),A,STUDENT])
    expect((await db.query<{callable:boolean}>(`
      SELECT has_function_privilege('authenticated','public.discard_empty_grading_attempt(uuid,uuid)','EXECUTE') AS callable`,
    )).rows[0].callable).toBe(false)
    await db.exec('SET ROLE authenticated')
    await expect(discard(id(116))).rejects.toMatchObject({code:'42501'})
    await db.exec('SET ROLE service_role')
    expect(await row('submissions',id(116))).not.toBeUndefined()
  })
})
