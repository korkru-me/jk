import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const baseMigration = readFileSync(new URL('../supabase/migrations/20261018005611_assignment_regrading_and_void.sql', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20261018040444_grading_workspace_review.sql', import.meta.url), 'utf8')
const draftMigration = readFileSync(new URL('../supabase/migrations/20261018133739_grading_score_drafts.sql', import.meta.url), 'utf8')
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
    CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,recipient_id uuid NOT NULL,actor_id uuid,type text NOT NULL CHECK(type IN ('assignment_reminder','co_teacher_invite','extension_granted','classroom_post','homeroom_weekly_digest')),title text NOT NULL,body text,link text,related_assignment_id uuid,is_read boolean DEFAULT false,created_at timestamptz DEFAULT now());
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
    CREATE TABLE public.assignments (id uuid PRIMARY KEY, title text DEFAULT 'งานทดสอบ',show_results text DEFAULT 'immediate',org_id uuid,created_by uuid,question_ids uuid[],
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
  await db.exec(draftMigration)
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

async function rows(table: string) {
  return (await db.query<Record<string, unknown>>(`SELECT * FROM ${table}`)).rows
}
async function answer(answerId=R2) {
  return (await db.query<Record<string,unknown>>('SELECT * FROM submission_answers WHERE id=$1',[answerId])).rows[0]
}
type Item = {answerId:string;expectedScoreEditedAt:string|null;expectedDraftUpdatedAt:string|null;answerScore?:unknown;workScore?:unknown;remove?:true}
function item(answerId=R2,values:Partial<Item>={}): Item {
  return {answerId,expectedScoreEditedAt:null,expectedDraftUpdatedAt:null,answerScore:0.5,...values}
}
let requestSequence=1000
async function mutate(items:Item[], options:{publish?:boolean;actor?:string;assignment?:string;requestId?:string}={}) {
  return (await db.query<{result:Record<string,unknown>}>(`SELECT ${options.publish?'publish':'save'}_grading_drafts($1,$2,$3,$4::jsonb) AS result`,[
    options.actor??T,options.assignment??A,options.requestId??id(requestSequence++),JSON.stringify(items),
  ])).rows[0].result
}
async function drafts(actor=T) {
  return (await db.query<{result:Array<Record<string,unknown>>}>('SELECT read_grading_drafts($1,$2) AS result',[actor,A])).rows[0].result
}
async function configure() {
  await db.query('SELECT configure_assignment_question_grading_parts($1,$2,$3,0.6,0.4,NULL)',[T,A,Q])
}

beforeEach(()=>{requestSequence=1000})

describe('private grading draft transactions',()=>{
  it('persists a private zero without changing published answers, totals, revisions, audit or notifications',async()=>{
    const beforeAnswer=await answer(), beforeSubmission=(await rows('submissions')).find(row=>row.id===S2)
    const result=await mutate([item(R2,{answerScore:0})])
    expect(result).toMatchObject({success:true,deletedDraftIds:[],drafts:[{answerId:R2,answerScore:0,expectedScoreEditedAt:null}]})
    expect(await answer()).toEqual(beforeAnswer)
    expect((await rows('submissions')).find(row=>row.id===S2)).toEqual(beforeSubmission)
    expect(await rows('grading_review_events')).toEqual([])
    expect(await rows('notifications')).toEqual([])
    const saved=await drafts()
    expect(saved).toHaveLength(1);expect(saved[0]).not.toHaveProperty('workScore')
    expect(await drafts(CO)).toEqual([])
  })
  it('replaces the complete private touched-parts snapshot with exact draft CAS',async()=>{
    await configure()
    const current=await answer()
    const revision=current.score_edited_at as string
    const first=await mutate([item(R2,{expectedScoreEditedAt:revision,answerScore:0.2,workScore:0})])
    const saved=(first.drafts as Array<Record<string,unknown>>)[0]
    await expect(mutate([item(R2,{expectedScoreEditedAt:revision,answerScore:0.3})])).rejects.toMatchObject({code:'PT409'})
    await mutate([{answerId:R2,expectedScoreEditedAt:revision,expectedDraftUpdatedAt:saved.updatedAt as string,workScore:0.1}])
    const next=(await drafts())[0]
    expect(next).not.toHaveProperty('answerScore');expect(next.workScore).toBe(0.1)
    expect(next.updatedAt).not.toBe(saved.updatedAt)
  })
  it('returns original save results for an identical request without creating a new draft revision',async()=>{
    const requestId=id(900), payload=[item()]
    const first=await mutate(payload,{requestId}), second=await mutate(payload,{requestId})
    expect(second).toEqual(first)
    expect(await rows('grading_score_drafts')).toHaveLength(1)
    expect(await rows('grading_draft_requests')).toHaveLength(1)
    await expect(mutate([item(R2,{answerScore:0.7})],{requestId})).rejects.toMatchObject({code:'PT409'})
  })
  it('rolls back earlier private draft saves when another member has an invalid score',async()=>{
    const first=await answer(R1)
    await expect(mutate([item(R1,{expectedScoreEditedAt:first.score_edited_at as string}),item(R2,{answerScore:2})])).rejects.toMatchObject({code:'22023'})
    expect(await drafts()).toEqual([])
    expect(await rows('grading_draft_requests')).toEqual([])
    expect(await answer(R1)).toEqual(first)
  })
  it('atomically publishes all answers, clears only own exact drafts, and notifies a recipient once',async()=>{
    await db.query('UPDATE submission_answers SET score_edited_at=NULL,score_edited_by=NULL WHERE id=$1',[R1])
    const inputs=[item(R1,{answerScore:0}),item(R2,{answerScore:0.5})]
    const saved=await mutate(inputs)
    await mutate([item(R2,{answerScore:0.2})],{actor:CO})
    const savedRows=saved.drafts as Array<Record<string,unknown>>
    const publishItems=inputs.map(value=>({...value,expectedDraftUpdatedAt:savedRows.find(row=>row.answerId===value.answerId)!.updatedAt as string}))
    const result=await mutate(publishItems,{publish:true,requestId:id(901)})
    expect(result).toMatchObject({success:true,notificationCount:1,deletedDraftIds:[R1,R2]})
    expect(result.published).toHaveLength(2)
    expect(await answer(R1)).toMatchObject({answer_score:'0.00',score_edited_by:T})
    expect((await answer(R1)).answer_reviewed_at).not.toBeNull()
    expect(await answer(R2)).toMatchObject({answer_score:'0.50',score_edited_by:T})
    expect(await drafts()).toEqual([]);expect(await drafts(CO)).toHaveLength(1)
    expect((await rows('grading_review_events')).filter(row=>row.kind==='review')).toHaveLength(2)
    const notifications=await rows('notifications')
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({recipient_id:STUDENT,type:'grade_published',title:'ครูตรวจคะแนนแล้ว',related_assignment_id:A,grading_publication_request_id:id(901)})
  })
  it('publishes an unsaved explicit work zero without reviewing the untouched answer',async()=>{
    await configure()
    const before=await answer()
    await mutate([{answerId:R2,expectedScoreEditedAt:before.score_edited_at as string,expectedDraftUpdatedAt:null,workScore:0}],{publish:true})
    expect(await answer()).toMatchObject({work_score:'0.00',answer_score:before.answer_score,answer_reviewed_at:null})
    expect((await answer()).work_reviewed_at).not.toBeNull()
  })
  it('retries a committed publish without another grade audit or notification after draft deletion',async()=>{
    const saved=await mutate([item()])
    const payload=[item(R2,{expectedDraftUpdatedAt:(saved.drafts as Array<Record<string,unknown>>)[0].updatedAt as string})]
    const requestId=id(902)
    const first=await mutate(payload,{publish:true,requestId}), before=await answer()
    expect(await mutate(payload,{publish:true,requestId})).toEqual(first)
    expect(await answer()).toEqual(before)
    expect(await rows('notifications')).toHaveLength(1)
    expect((await rows('grading_review_events')).filter(row=>row.kind==='review')).toHaveLength(1)
  })
  it('rejects another request reusing an already-published stale score revision',async()=>{
    await mutate([item()],{publish:true})
    await expect(mutate([item()],{publish:true})).rejects.toMatchObject({code:'PT409'})
    expect(await rows('notifications')).toHaveLength(1)
  })
  it('one stale member rolls back the whole batch, including earlier scores, draft clears and audit',async()=>{
    await db.query('UPDATE submission_answers SET score_edited_at=NULL,score_edited_by=NULL WHERE id=$1',[R1])
    const saved=await mutate([item(R1),item(R2)])
    const savedRows=saved.drafts as Array<Record<string,unknown>>
    const payload=[item(R1),item(R2)].map(value=>({...value,expectedDraftUpdatedAt:savedRows.find(row=>row.answerId===value.answerId)!.updatedAt as string}))
    const old=await answer(R1)
    await db.exec(`RESET ROLE;UPDATE submission_answers SET score_edited_at='2026-10-18T00:00:00Z' WHERE id='${R2}';SET ROLE service_role`)
    await expect(mutate(payload,{publish:true})).rejects.toMatchObject({code:'PT409'})
    expect(await answer(R1)).toEqual(old)
    expect(await drafts()).toHaveLength(2)
    expect(await rows('grading_review_events')).toEqual([])
    expect(await rows('notifications')).toEqual([])
    expect(await rows('grading_draft_requests')).toHaveLength(1)
  })
  it('notification failure rolls back live grading, audit, draft deletion and request receipt',async()=>{
    const saved=await mutate([item()]), before=await answer()
    await db.exec("RESET ROLE;ALTER TABLE notifications ADD CONSTRAINT reject_fixture_notification CHECK(type<>'grade_published');SET ROLE service_role")
    const payload=[item(R2,{expectedDraftUpdatedAt:(saved.drafts as Array<Record<string,unknown>>)[0].updatedAt as string})]
    await expect(mutate(payload,{publish:true})).rejects.toMatchObject({code:'23514'})
    expect(await answer()).toEqual(before);expect(await drafts()).toHaveLength(1)
    expect(await rows('grading_review_events')).toEqual([]);expect(await rows('grading_draft_requests')).toHaveLength(1)
  })
  it('does not include hidden scores or answers in learner notifications and preserves visibility settings',async()=>{
    await db.query("UPDATE assignments SET show_results='never',title='คะแนนลับ' WHERE id=$1",[A])
    await mutate([item(R2,{answerScore:0.37})],{publish:true})
    const notification=(await rows('notifications'))[0]
    expect(notification.title).toBe('ครูตรวจคะแนนแล้ว');expect(notification.body).toBe('คะแนนลับ')
    expect(notification.link).toBe(`/submissions/${S2}`)
    expect(JSON.stringify(notification)).not.toContain('0.37')
    expect((await db.query<{show_results:string}>('SELECT show_results FROM assignments WHERE id=$1',[A])).rows[0].show_results).toBe('never')
  })
  it('creates exactly one notification for each distinct affected student',async()=>{
    await db.query("INSERT INTO users(id,role) VALUES($1,'student')",[id(81)])
    await db.query("INSERT INTO submissions(id,assignment_id,student_id,status) VALUES($1,$2,$3,'in_progress')",[id(82),A,id(81)])
    await db.query('INSERT INTO submission_answers(id,submission_id,question_id) VALUES($1,$2,$3)',[id(83),id(82),Q])
    await db.query("UPDATE submissions SET status='submitted' WHERE id=$1",[id(82)])
    expect(await mutate([item(),item(id(83))],{publish:true})).toHaveProperty('notificationCount',2)
    expect((await rows('notifications')).map(row=>row.recipient_id).sort()).toEqual([STUDENT,id(81)].sort())
  })
  it('rechecks active exact assignment management for private reads, saves and publishes',async()=>{
    for(const actor of [STUDENT,OTHER]) {
      await expect(mutate([item()],{actor})).rejects.toMatchObject({code:'42501'})
      await expect(mutate([item()],{actor,publish:true})).rejects.toMatchObject({code:'42501'})
      await expect(drafts(actor)).rejects.toMatchObject({code:'42501'})
    }
    await expect(mutate([item(RB)])).rejects.toMatchObject({code:'42501'})
    await expect(mutate([item()],{assignment:C})).rejects.toMatchObject({code:'42501'})
    await mutate([item()],{actor:CO})
    await db.query("UPDATE users SET status='suspended' WHERE id=$1",[CO])
    await expect(drafts(CO)).rejects.toMatchObject({code:'42501'})
  })
  it.each([null,'',-1,2,'NaN','Infinity'])('rejects invalid or out-of-range draft component %s before changing any live or draft row',async value=>{
    await expect(mutate([item(R2,{answerScore:value})])).rejects.toMatchObject({code:'22023'})
    expect(await rows('grading_score_drafts')).toEqual([])
    expect(await rows('grading_review_events')).toEqual([])
  })
  it('rejects unfinished/void answers, disabled components and duplicate batch IDs',async()=>{
    await expect(mutate([item(R2,{workScore:0})])).rejects.toMatchObject({code:'22023'})
    await expect(mutate([item(),item()])).rejects.toMatchObject({code:'22023'})
    await db.query("UPDATE submissions SET status='in_progress' WHERE id=$1",[S2])
    await expect(mutate([item()])).rejects.toMatchObject({code:'22023'})
    await db.exec(`RESET ROLE;UPDATE submissions SET status='submitted' WHERE id='${S2}';SET ROLE service_role;INSERT INTO assignment_void_questions(assignment_id,question_id,actor_id,reason) VALUES('${A}','${Q}','${T}','fixture void');SELECT set_config('korkru.question_grading_change','on',false);UPDATE submission_answers SET is_void=true,max_score=0,void_original_max_score=1 WHERE id='${R2}';SELECT set_config('korkru.question_grading_change','',false)`)
    await expect(mutate([item()])).rejects.toMatchObject({code:'22023'})
  })
  it('can remove an exact stale private draft without changing the now-published grade',async()=>{
    const saved=await mutate([item()])
    await mutate([item(R2,{answerScore:0.8})],{publish:true,actor:CO})
    const before=await answer()
    const removal:Item={answerId:R2,expectedScoreEditedAt:null,expectedDraftUpdatedAt:(saved.drafts as Array<Record<string,unknown>>)[0].updatedAt as string,remove:true}
    await expect(mutate([{...removal,expectedDraftUpdatedAt:null}])).rejects.toMatchObject({code:'PT409'})
    expect(await mutate([removal])).toMatchObject({success:true,drafts:[],deletedDraftIds:[R2]})
    expect(await answer()).toEqual(before);expect(await drafts()).toEqual([])
  })
  it('revokes browser reads and writes and keeps all grading draft RPCs service-only invoker functions',async()=>{
    const privileges=await db.query<{name:string;allowed:boolean}>(`SELECT name,has_function_privilege('authenticated',name,'EXECUTE') AS allowed FROM unnest(ARRAY[
      'read_grading_drafts(uuid,uuid)','save_grading_drafts(uuid,uuid,uuid,jsonb)','publish_grading_drafts(uuid,uuid,uuid,jsonb)','write_grading_drafts(uuid,uuid,uuid,jsonb,boolean)']) name`)
    expect(privileges.rows.every(row=>!row.allowed)).toBe(true)
    const security=(await db.query<{prosecdef:boolean;proconfig:string[]}>('SELECT prosecdef,proconfig FROM pg_proc WHERE proname IN ($1,$2,$3,$4)',['read_grading_drafts','save_grading_drafts','publish_grading_drafts','write_grading_drafts'])).rows
    expect(security).toHaveLength(4);expect(security.every(row=>!row.prosecdef&&row.proconfig.includes('search_path=""'))).toBe(true)
    await db.exec('RESET ROLE;SET ROLE authenticated')
    await expect(db.query('SELECT * FROM grading_score_drafts')).rejects.toMatchObject({code:'42501'})
    await expect(db.query('SELECT * FROM grading_draft_requests')).rejects.toMatchObject({code:'42501'})
  })
})
