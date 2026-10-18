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
    CREATE TABLE public.submissions (id uuid PRIMARY KEY,assignment_id uuid REFERENCES public.assignments(id),
      student_id uuid,created_at timestamptz DEFAULT clock_timestamp(), status public.submission_status DEFAULT 'submitted',total_score numeric DEFAULT 1,max_score numeric DEFAULT 2,
      score_adjustment numeric DEFAULT -1,answer_revision bigint DEFAULT 7,current_streak integer DEFAULT 0,
      best_streak integer DEFAULT 0,streak_reached boolean DEFAULT false,closed_at timestamptz,submitted_at timestamptz,missing_work_evidence boolean DEFAULT false);
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
    UPDATE public.submission_answers SET score=0.75,score_edited_by='${T}',score_edited_at='2026-10-01' WHERE id='${R1}';
    UPDATE public.questions SET extra_data='null'::jsonb WHERE id='${Q2}';
  `)
  await db.exec(baseMigration)
  await db.exec(maxScoreMigration)
  await db.exec('REVOKE ALL ON FUNCTION public.education_research_question_max_score(public.questions) FROM PUBLIC,anon,authenticated')
  await db.exec(migration)
  await db.exec(finalizationMigration.slice(finalizationMigration.indexOf('CREATE FUNCTION public.commit_submission_grade('),finalizationMigration.indexOf('CREATE FUNCTION public.close_expired_submission_attempts(')))
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

async function row(table: string, rowId: string) {
  return (await db.query<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id=$1`, [rowId])).rows[0]
}
async function policy() {
  return (await db.query<{ updated_at: string }>('SELECT updated_at::text FROM assignment_question_grading_parts WHERE assignment_id=$1 AND question_id=$2',[A,Q])).rows[0]
}
async function configure(answerMax=0.6,workMax=0.4,expected: string|null=null,actor=T,assignment=A,question=Q) {
  return db.query('SELECT configure_assignment_question_grading_parts($1,$2,$3,$4,$5,$6)',[actor,assignment,question,answerMax,workMax,expected])
}
async function save(answerId=R2,values: {answer?:number;work?:number;revision?:unknown;actor?:string;assignment?:string}={answer:0.5}) {
  const revision=values.revision===undefined?(await row('submission_answers',answerId)).score_edited_at:values.revision
  return db.query('SELECT save_grading_review($1,$2,$3,$4,$5,$6,$7,$8)',[
    values.actor??T,values.assignment??A,answerId,revision,values.answer??null,values.work??null,
    Object.hasOwn(values,'answer'),Object.hasOwn(values,'work'),
  ])
}

describe('assignment-local grading allocation SQL transaction', () => {
  it('backfills original weights and teacher review state while keeping an unmarked answer unreviewed',async()=>{
    expect(await row('submission_answers',R1)).toMatchObject({answer_score:'0.75',answer_max_score:'1',work_max_score:'0',work_score:null})
    expect((await row('submission_answers',R1)).answer_reviewed_at).not.toBeNull()
    expect((await row('submission_answers',R2)).answer_reviewed_at).toBeNull()
  })
  it('apportions automatic credit, leaves work pending zero, and preserves per-attempt raw weights',async()=>{
    await db.query('UPDATE submission_answers SET score=1,is_correct=true WHERE id=$1',[R2])
    await configure()
    expect(await row('submission_answers',R2)).toMatchObject({answer_score:'0.60',answer_max_score:'0.60',work_max_score:'0.40',work_score:null,score:'0.60',max_score:'1',work_reviewed_at:null})
    expect(await row('submissions',S2)).toMatchObject({total_score:'1.60',max_score:'2',answer_revision:8,score_adjustment:'-1'})
    // A second attempt's raw weight may differ from the question's current weight.
    await db.exec(`RESET ROLE;UPDATE submission_answers SET max_score=2,answer_max_score=1.20,work_max_score=0.80 WHERE id='${R2}';SET ROLE service_role`)
    await configure(0.5,0.5,(await policy()).updated_at)
    expect(await row('submission_answers',R2)).toMatchObject({max_score:'2',answer_max_score:'1.00',work_max_score:'1.00'})
    expect(await row('submission_answers',RB)).toMatchObject({score:'0',answer_max_score:'1',work_max_score:'0'})
  })
  it('preserves old whole-question teacher total and marks both portions at the original timestamp',async()=>{
    const timestamp=(await row('submission_answers',R1)).answer_reviewed_at
    await configure()
    expect(await row('submission_answers',R1)).toMatchObject({score:'0.75',answer_score:'0.45',work_score:'0.30',answer_reviewed_at:timestamp,work_reviewed_at:timestamp,score_edited_by:T})
  })
  it('retains a legacy whole-question review even when its first configured work maximum is zero',async()=>{
    const timestamp=(await row('submission_answers',R1)).answer_reviewed_at
    await configure(1,0)
    expect(await row('submission_answers',R1)).toMatchObject({score:'0.75',answer_reviewed_at:timestamp,work_reviewed_at:timestamp})
    await configure(0.2,0.8,(await policy()).updated_at)
    expect(await row('submission_answers',R1)).toMatchObject({score:'0.75',answer_score:'0.15',work_score:'0.60',answer_reviewed_at:timestamp,work_reviewed_at:timestamp})
  })
  it('changes only a selected score and treats teacher zero as reviewed, preserving the automatic answer',async()=>{
    await db.query('UPDATE submission_answers SET score=1,is_correct=true WHERE id=$1',[R2]);await configure()
    await save(R2,{work:0})
    expect(await row('submission_answers',R2)).toMatchObject({score:'0.60',answer_score:'0.60',answer_reviewed_at:null,work_score:'0.00',score_edited_by:T,is_correct:true})
    expect((await row('submission_answers',R2)).work_reviewed_at).not.toBeNull()
    expect(await row('submissions',S2)).toMatchObject({total_score:'1.60',status:'graded',answer_revision:9})
    const event=(await db.query<{old_state:Record<string,unknown>;new_state:Record<string,unknown>}>("SELECT old_state,new_state FROM grading_review_events WHERE kind='review'")).rows[0]
    expect(event.old_state.work_reviewed_at).toBeNull();expect(event.new_state.work_reviewed_at).not.toBeNull()
  })
  it('keeps a submission pending until every enabled component is reviewed and normalizes an early graded status',async()=>{
    await db.query("UPDATE submissions SET status='graded' WHERE id=$1",[S2])
    await configure()
    expect((await row('submissions',S2)).status).toBe('submitted')
    await save(R2,{answer:0.4})
    expect((await row('submissions',S2)).status).toBe('submitted')
    await save(R2,{work:0})
    expect((await row('submissions',S2)).status).toBe('graded')
  })
  it('keeps a manual answer pending after work is reviewed, using its frozen rules rather than a later bank edit',async()=>{
    await db.exec("SELECT set_config('korkru.question_grading_change','on',false)")
    await db.query(`UPDATE submission_answers SET grading_config='{"question_type":"true_false","extra_data":{"explanation_mode":"always"}}'::jsonb,is_correct=true WHERE id=$1`,[R2])
    await db.exec("SELECT set_config('korkru.question_grading_change','',false)")
    await configure();await save(R2,{work:0.2})
    expect((await row('submissions',S2)).status).toBe('submitted')
    await save(R2,{answer:0.6})
    expect((await row('submissions',S2)).status).toBe('graded')
  })
  it('honors assignment-wide required written work even when the bank question flag is false',async()=>{
    await db.query("UPDATE assignments SET require_work_image=true WHERE id=$1",[A])
    await db.query("UPDATE questions SET question_type='written',requires_work_image=false WHERE id=$1",[Q])
    await db.exec("SELECT set_config('korkru.question_grading_change','on',false)")
    await db.query(`UPDATE submission_answers SET grading_config='{"question_type":"written","extra_data":{}}'::jsonb WHERE id=$1`,[R2])
    await db.exec("SELECT set_config('korkru.question_grading_change','',false)")
    await save(R2,{answer:0.5})
    expect((await row('submissions',S2)).status).toBe('submitted')
    await configure()
    expect((await row('submissions',S2)).status).toBe('graded')
  })
  it('recomputes streak pass/fail after teacher answer changes, skipping NULL and excluding void answers',async()=>{
    await db.query("UPDATE assignments SET completion_rule='streak',streak_target=2,question_ids=array_append(question_ids,$1::uuid) WHERE id=$2",[id(22),A])
    await db.query('INSERT INTO questions(id,created_by,org_id) VALUES($1,$2,$3)',[id(22),T,ORG])
    await db.query('INSERT INTO assignment_void_questions(assignment_id,question_id,actor_id,reason) VALUES($1,$2,$3,$4)',[A,id(22),T,'void'])
    await db.query("UPDATE submissions SET status='in_progress' WHERE id=$1",[S2])
    await db.query('UPDATE submission_answers SET order_index=2 WHERE id=$1',[id(55)])
    await db.query('INSERT INTO submission_answers(id,submission_id,question_id,score,is_correct,order_index) VALUES($1,$2,$3,0,NULL,1)',[id(57),S2,Q2])
    await db.query('INSERT INTO submission_answers(id,submission_id,question_id,score,is_correct,order_index) VALUES($1,$2,$3,1,true,3)',[id(58),S2,id(22)])
    await db.query("UPDATE submissions SET status='submitted' WHERE id=$1",[S2])
    await configure()
    await save(R2,{answer:0.6})
    expect(await row('submissions',S2)).toMatchObject({current_streak:2,best_streak:2,streak_reached:true,status:'submitted'})
    await save(R2,{answer:0})
    expect(await row('submissions',S2)).toMatchObject({current_streak:1,best_streak:1,streak_reached:false,status:'submitted'})
    await save(R2,{work:0.4})
    expect(await row('submission_answers',R2)).toMatchObject({is_correct:false})
    expect(await row('submissions',S2)).toMatchObject({current_streak:1,best_streak:1,streak_reached:false})
  })
  it('keeps a partial true/false score with is_correct=true correct for streak purposes',async()=>{
    await db.query("UPDATE assignments SET completion_rule='streak',streak_target=2 WHERE id=$1",[A])
    await db.exec("SELECT set_config('korkru.question_grading_change','on',false)")
    await db.query(`UPDATE submission_answers SET grading_config='{"question_type":"true_false","extra_data":{"explanation_mode":"always"}}'::jsonb,score=0.5,is_correct=true WHERE id=$1`,[R2])
    await db.exec("SELECT set_config('korkru.question_grading_change','',false)")
    await configure();await save(R2,{work:0})
    expect(await row('submissions',S2)).toMatchObject({current_streak:2,best_streak:2,streak_reached:true,status:'submitted'})
    expect(await row('submission_answers',R2)).toMatchObject({is_correct:true,answer_score:'0.30'})
  })
  it('uses exact assignment authorization independently of bank ownership or a view co-teacher',async()=>{
    await expect(configure(0.6,0.4,null,T,B)).rejects.toMatchObject({code:'42501'})
    await expect(configure(0.6,0.4,null,T,C)).rejects.toMatchObject({code:'42501'})
    await expect(save(RB,{answer:0.5})).rejects.toMatchObject({code:'42501'})
    await expect(save(R2,{answer:0.5,actor:STUDENT})).rejects.toMatchObject({code:'42501'})
    await save(R2,{answer:0.5,actor:CO})
    expect((await row('submission_answers',R2)).score_edited_by).toBe(CO)
    await db.query("UPDATE users SET status='suspended' WHERE id=$1",[CO])
    await expect(save(R2,{answer:0.6,actor:CO})).rejects.toMatchObject({code:'42501'})
  })
  it('rejects stale score and policy timestamps before any partial update or audit event',async()=>{
    await configure();const first=(await policy()).updated_at
    await save(R2,{answer:0.5})
    await expect(save(R2,{work:0.2,revision:null})).rejects.toMatchObject({code:'PT409'})
    await configure(0.7,0.3,first)
    await expect(configure(0.5,0.5,first)).rejects.toMatchObject({code:'PT409'})
    expect((await db.query("SELECT * FROM grading_review_events WHERE kind='review'")).rows).toHaveLength(1)
    expect(await row('submission_answers',R2)).toMatchObject({score:'0.50',work_score:null,work_reviewed_at:null})
  })
  it('rejects active attempts even for another question and rolls back policy, scores and audit',async()=>{
    await db.query("UPDATE submissions SET status='in_progress' WHERE id=$1",[S2])
    await expect(configure()).rejects.toMatchObject({code:'PT425'})
    expect(await policy()).toBeUndefined()
    expect((await db.query('SELECT * FROM grading_review_events')).rows).toHaveLength(0)
    expect((await row('submission_answers',R1)).work_max_score).toBe('0')
    await expect(save(R2,{answer:0.5})).rejects.toMatchObject({code:'22023'})
  })
  it('rejects allocations that change the trusted raw maximum and validates nonfinite/bounds',async()=>{
    for(const [a,w] of [[1,1],[-1,2],[Number.NaN,0],[Number.POSITIVE_INFINITY,0],[0,0]]) {
      await expect(configure(a,w)).rejects.toMatchObject({code:'22023'})
    }
    await configure()
    for(const val of [-0.1,0.61,Number.NaN,Number.POSITIVE_INFINITY]) await expect(save(R2,{answer:val})).rejects.toMatchObject({code:'22023'})
    expect((await db.query("SELECT * FROM grading_review_events WHERE kind='review'")).rows).toHaveLength(0)
  })
  it('allows a trusted allocation before there are any submissions using assignment question_points',async()=>{
    await db.query('DELETE FROM submission_answers WHERE submission_id IN ($1,$2)',[S1,S2]);await db.query('DELETE FROM submissions WHERE id IN ($1,$2)',[S1,S2])
    await db.query('UPDATE assignments SET question_points=$1::jsonb,require_work_image=true WHERE id=$2',[JSON.stringify({[Q]:10}),A])
    await configure(4,6)
    expect((await db.query('SELECT work_share FROM assignment_question_grading_parts')).rows).toEqual([{work_share:'0.60000000000000000000'}])
    expect((await db.query('SELECT * FROM grading_review_events')).rows).toHaveLength(1)
  })
  it('matches the application natural maximum for legacy true/false questions without an explanation_mode',async()=>{
    await db.query("UPDATE questions SET question_type='true_false',extra_data='{}'::jsonb WHERE id=$1",[Q])
    await configure(1,1)
    expect((await db.query<{work_share:string}>('SELECT work_share FROM assignment_question_grading_parts')).rows[0].work_share).toBe('0.50000000000000000000')
  })
  it('preserves explicit reviewed flags/totals on reconfiguration and rejects an impossible split atomically',async()=>{
    await configure();await save(R2,{answer:0.55})
    await expect(configure(0.4,0.6,(await policy()).updated_at)).rejects.toMatchObject({code:'22023'})
    expect(await row('submission_answers',R2)).toMatchObject({answer_score:'0.55',work_score:null,answer_max_score:'0.60',work_max_score:'0.40',work_reviewed_at:null})
    await save(R2,{work:0.2});const before=await row('submission_answers',R2)
    await configure(0.5,0.5,(await policy()).updated_at)
    expect(await row('submission_answers',R2)).toMatchObject({score:'0.75',answer_reviewed_at:before.answer_reviewed_at,work_reviewed_at:before.work_reviewed_at})
  })
  it('recomputes an explicit teacher answer verdict and streak when reallocation changes its ceiling',async()=>{
    await db.query("UPDATE assignments SET completion_rule='streak',streak_target=2 WHERE id=$1",[A])
    await configure();await save(R2,{answer:0.6,work:0.1})
    expect(await row('submissions',S2)).toMatchObject({current_streak:2,streak_reached:true})
    await configure(0.3,0.7,(await policy()).updated_at)
    expect(await row('submission_answers',R2)).toMatchObject({score:'0.70',answer_score:'0.21',answer_max_score:'0.30',work_score:'0.49',is_correct:false})
    expect(await row('submissions',S2)).toMatchObject({current_streak:1,best_streak:1,streak_reached:false})
    // Re-saving the displayed value must not change correctness or pass/fail.
    await save(R2,{answer:0.21})
    expect(await row('submissions',S2)).toMatchObject({current_streak:1,best_streak:1,streak_reached:false})
  })
  it('normalizes a previously graded header when a global key correction creates pending explanation review',async()=>{
    await db.query(`UPDATE questions SET question_type='true_false',extra_data='{"explanation_mode":"none"}' WHERE id=$1`,[Q])
    await db.exec("SELECT set_config('korkru.question_grading_change','on',false)")
    await db.query(`UPDATE submission_answers SET grading_config='{"question_type":"true_false","answer_tolerance":0.1,"answer_parts":null,"extra_data":{"explanation_mode":"none"}}',score=1,is_correct=true WHERE question_id=$1`,[Q])
    await db.exec("SELECT set_config('korkru.question_grading_change','',false)")
    await configure();await save(R2,{work:0.1})
    expect((await row('submissions',S2)).status).toBe('graded')
    const headers=(await db.query<Record<string,unknown>>('SELECT id,answer_revision,status,total_score,max_score FROM submissions WHERE assignment_id=$1 ORDER BY id',[A])).rows
    const answers=(await db.query<Record<string,unknown>>(`SELECT a.*,
      jsonb_build_object('correct_answer',a.correct_answer,'score',a.score,'is_correct',a.is_correct,'max_score',a.max_score,
        'score_edited_by',a.score_edited_by,'score_edited_at',a.score_edited_at,'student_answer',a.student_answer,
        'random_values',a.random_values,'is_void',a.is_void,'grading_config',a.grading_config) AS expected
      FROM submission_answers a JOIN submissions s ON s.id=a.submission_id WHERE s.assignment_id=$1 AND a.question_id=$2 ORDER BY a.id`,[A,Q])).rows
    const changes=[{assignment_id:A,submissions:headers,answers:answers.map(a=>({
      id:a.id,submission_id:a.submission_id,correct_answer:a.correct_answer,score:a.answer_reviewed_at?a.score:0.5,
      is_correct:a.is_correct,max_score:a.max_score,is_void:false,expected:a.expected,
      grading_config:{question_type:'true_false',answer_tolerance:0.1,answer_parts:null,extra_data:{explanation_mode:'always'}},
    }))}]
    await db.query('SELECT apply_question_grading_change($1,$2,$3,$4::jsonb,$5::jsonb,NULL,$6,false)',[
      T,Q,'2026-10-01T00:00:00Z',JSON.stringify({extra_data:{explanation_mode:'always'}}),JSON.stringify(changes),'corrected explanation rules',
    ])
    expect((await db.query<{status:string;pending:boolean}>('SELECT status,has_pending_grading_review(id) AS pending FROM submissions WHERE id=$1',[S2])).rows[0])
      .toEqual({status:'submitted',pending:true})
  })
  it('new attempt rows use the configured fraction and finalization never restores full answer points',async()=>{
    await configure();await db.query("INSERT INTO submissions(id,assignment_id,student_id,status) VALUES($1,$2,$3,'in_progress')",[id(90),A,STUDENT])
    await db.query('INSERT INTO submission_answers(id,submission_id,question_id,score) VALUES($1,$2,$3,0)',[id(91),id(90),Q])
    await db.query('UPDATE submission_answers SET score=1,is_correct=true WHERE id=$1',[id(91)])
    expect(await row('submission_answers',id(91))).toMatchObject({answer_score:'0.60',score:'0.60',work_score:null,work_max_score:'0.40'})
    await db.query('UPDATE submission_answers SET score=1,is_correct=true WHERE id=$1',[id(91)])
    expect((await row('submission_answers',id(91))).score).toBe('0.60')
    await db.query('UPDATE submissions SET closed_at=clock_timestamp() WHERE id=$1',[id(90)])
    const result=await db.query<{result:{total_score:number}}>('SELECT commit_submission_grade($1,$2,$3::jsonb) AS result',[id(90),STUDENT,JSON.stringify([{id:id(91),score:1,is_correct:true}])])
    expect(result.rows[0].result.total_score).toBe(0.6)
    expect(await row('submissions',id(90))).toMatchObject({total_score:'0.60',status:'submitted'})
  })
  it('keeps marked work through automatic corrections, and keeps an explicit answer override',async()=>{
    await configure();await save(R2,{work:0.3})
    await db.exec("SELECT set_config('korkru.question_grading_change','on',false)")
    await db.query('UPDATE submission_answers SET score=1,is_correct=true WHERE id=$1',[R2])
    expect(await row('submission_answers',R2)).toMatchObject({answer_score:'0.60',work_score:'0.30',score:'0.90',answer_reviewed_at:null})
    await db.exec("SELECT set_config('korkru.question_grading_change','',false)");await save(R2,{answer:0.25})
    await db.exec("SELECT set_config('korkru.question_grading_change','on',false)")
    await db.query('UPDATE submission_answers SET score=1,is_correct=true WHERE id=$1',[R2])
    expect(await row('submission_answers',R2)).toMatchObject({answer_score:'0.25',work_score:'0.30',score:'0.55'})
  })
  it('rejects a score edit from a screen opened before automatic regrading',async()=>{
    await configure();const oldRevision=(await row('submission_answers',R2)).score_edited_at
    await db.exec("SELECT set_config('korkru.question_grading_change','on',false)")
    await db.query('UPDATE submission_answers SET score=1,is_correct=true WHERE id=$1',[R2])
    await db.exec("SELECT set_config('korkru.question_grading_change','',false)")
    await expect(save(R2,{work:0.2,revision:oldRevision})).rejects.toMatchObject({code:'PT409'})
    expect(await row('submission_answers',R2)).toMatchObject({answer_score:'0.60',work_score:null,work_reviewed_at:null})
  })
  it('preserves carried work-only review metadata for the older SEB copy path and explicit new copy path',async()=>{
    await configure();await save(R2,{work:0.3})
    await db.query("INSERT INTO submissions(id,assignment_id,student_id,status) VALUES($1,$2,$3,'in_progress')",[id(90),A,STUDENT])
    // Older SQL carries whole-score columns only; trigger safely resolves its source.
    await db.query(`INSERT INTO submission_answers(id,submission_id,question_id,score,max_score,is_correct,score_edited_by,score_edited_at,
      student_answer,correct_answer,random_values,option_order,carried_over)
      SELECT $1,$2,question_id,score,max_score,is_correct,score_edited_by,score_edited_at,student_answer,correct_answer,random_values,option_order,true
      FROM submission_answers WHERE id=$3`,[id(91),id(90),R2])
    expect(await row('submission_answers',id(91))).toMatchObject({answer_reviewed_at:null,work_score:'0.30',answer_max_score:'0.60'})
    await db.query(`INSERT INTO submission_answers(id,submission_id,question_id,score,max_score,carried_over,
      answer_score,work_score,answer_max_score,work_max_score,answer_reviewed_at,work_reviewed_at)
      SELECT $1,$2,question_id,score,max_score,true,answer_score,work_score,answer_max_score,work_max_score,answer_reviewed_at,work_reviewed_at
      FROM submission_answers WHERE id=$3`,[id(92),id(90),R2])
    expect(await row('submission_answers',id(92))).toMatchObject({answer_reviewed_at:null,work_score:'0.30',score:'0.30'})
    await expect(db.query(`INSERT INTO submission_answers(id,submission_id,question_id,score,carried_over)
      VALUES($1,$2,$3,0.9,true)`,[id(93),id(90),Q])).rejects.toMatchObject({code:'PT409'})
  })
  it('does not grant points for an attached file when a new attempt is finalized',async()=>{
    await db.query("UPDATE questions SET question_type='file_upload' WHERE id=$1",[Q])
    await db.query("INSERT INTO submissions(id,assignment_id,student_id,status) VALUES($1,$2,$3,'in_progress')",[id(90),A,STUDENT])
    await db.query('INSERT INTO submission_answers(id,submission_id,question_id,score) VALUES($1,$2,$3,0)',[id(91),id(90),Q])
    await db.query('UPDATE submission_answers SET score=1,is_correct=true WHERE id=$1',[id(91)])
    expect(await row('submission_answers',id(91))).toMatchObject({score:'0',answer_score:null,is_correct:null,answer_reviewed_at:null})
  })
  it('rejects void questions/scores and disabled score components',async()=>{
    await expect(save(R2,{work:0})).rejects.toMatchObject({code:'22023'})
    await configure(0,1)
    await expect(save(R2,{answer:0})).rejects.toMatchObject({code:'22023'})
    await save(R2,{work:1});expect((await row('submission_answers',R2)).is_correct).toBe(false)
    await db.query('INSERT INTO assignment_void_questions(assignment_id,question_id,actor_id,reason) VALUES($1,$2,$3,$4)',[A,Q,T,'bad question'])
    await expect(configure(1,0,(await policy()).updated_at)).rejects.toMatchObject({code:'22023'})
    await db.exec("SELECT set_config('korkru.question_grading_change','on',false)")
    await db.query('UPDATE submission_answers SET is_void=true,max_score=0,void_original_max_score=1 WHERE id=$1',[R2])
    expect(await row('submission_answers',R2)).toMatchObject({answer_score:'0',work_score:'0',score:'0',answer_max_score:'0',work_max_score:'0'})
    await expect(save(R2,{work:0})).rejects.toMatchObject({code:'22023'})
  })
  it('retains removed raw weight when the older atomic SEB function carries a void answer',async()=>{
    await db.query('INSERT INTO assignment_void_questions(assignment_id,question_id,actor_id,reason) VALUES($1,$2,$3,$4)',[A,Q,T,'bad question'])
    await db.exec("SELECT set_config('korkru.question_grading_change','on',false)")
    await db.query('UPDATE submission_answers SET is_void=true,max_score=0,void_original_max_score=1 WHERE id=$1',[R2])
    await db.exec("SELECT set_config('korkru.question_grading_change','',false)")
    await db.query("INSERT INTO submissions(id,assignment_id,student_id,status) VALUES($1,$2,$3,'in_progress')",[id(90),A,STUDENT])
    await db.query(`INSERT INTO submission_answers(id,submission_id,question_id,score,max_score,is_correct,score_edited_by,score_edited_at,
      student_answer,correct_answer,random_values,option_order,carried_over)
      SELECT $1,$2,question_id,score,max_score,is_correct,score_edited_by,score_edited_at,student_answer,correct_answer,random_values,option_order,true
      FROM submission_answers WHERE id=$3`,[id(91),id(90),R2])
    expect(await row('submission_answers',id(91))).toMatchObject({max_score:'0',void_original_max_score:'1',is_void:true,score:'0'})
    expect(await row('submissions',id(90))).toMatchObject({max_score:'0',voided_max_score:'1'})
  })
  it('rounds stored scores and their correctness consistently without ever exceeding a bound',async()=>{
    await save(R2,{answer:0.999});expect(await row('submission_answers',R2)).toMatchObject({score:'1',is_correct:true})
  })
  it('keeps private policies/audits and RPC mutation inaccessible to browser roles',async()=>{
    const privileges=(await db.query(`SELECT
      has_function_privilege('authenticated','public.save_grading_review(uuid,uuid,uuid,timestamptz,numeric,numeric,boolean,boolean)','EXECUTE') AS save,
      has_function_privilege('anon','public.configure_assignment_question_grading_parts(uuid,uuid,uuid,numeric,numeric,timestamptz)','EXECUTE') AS configure,
      has_table_privilege('authenticated','public.assignment_question_grading_parts','SELECT') AS policy,
      has_table_privilege('authenticated','public.grading_review_events','SELECT') AS audit`)).rows[0]
    expect(privileges).toEqual({save:false,configure:false,policy:false,audit:false})
  })
})
