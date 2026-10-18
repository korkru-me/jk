import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ user:vi.fn(),manage:vi.fn(),admin:vi.fn(),rpc:vi.fn(),revalidate:vi.fn() }))
vi.mock('next/cache',()=>({revalidatePath:mocks.revalidate}))
vi.mock('@/lib/auth/server',()=>({getAuthUser:mocks.user}))
vi.mock('@/lib/auth/assignment-access',()=>({canManageAssignment:mocks.manage}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:mocks.admin}))
import { configureGradingParts, saveGradingReview } from './actions/grading-review'

const A='00000000-0000-4000-8000-000000000001',Q='00000000-0000-4000-8000-000000000002',R='00000000-0000-4000-8000-000000000003'
const timestamp='2026-10-18T04:55:00.123456+00:00'
const review=()=>({assignmentId:A,answerId:R,expectedScoreEditedAt:timestamp,workScore:0})
const allocation=()=>({assignmentId:A,questionId:Q,expectedUpdatedAt:null,answerMaxScore:3,workMaxScore:7})
beforeEach(()=>{
  vi.clearAllMocks();mocks.user.mockResolvedValue({id:'teacher'});mocks.manage.mockResolvedValue(true)
  mocks.admin.mockReturnValue({rpc:mocks.rpc});mocks.rpc.mockResolvedValue({data:{submission_id:'submission'},error:null})
})
describe('guarded grading review actions',()=>{
  it('requires login and exact assignment management before service mutation',async()=>{
    mocks.user.mockResolvedValueOnce(null)
    expect(await saveGradingReview(review())).toHaveProperty('error')
    expect(mocks.manage).not.toHaveBeenCalled();expect(mocks.admin).not.toHaveBeenCalled()
    mocks.manage.mockResolvedValue(false)
    expect(await saveGradingReview(review())).toHaveProperty('error')
    expect(await configureGradingParts(allocation())).toHaveProperty('error')
    expect(mocks.manage).toHaveBeenCalledWith(A,'teacher');expect(mocks.admin).not.toHaveBeenCalled()
  })
  it.each([null,undefined,'',-1,Number.NaN,Infinity,'0'])('never interprets blank or invalid work score %s as teacher zero',async value=>{
    expect(await saveGradingReview({...review(),workScore:value} as never)).toHaveProperty('error')
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it('requires at least one actual component and a precise revision token',async()=>{
    for(const bad of [null,[],{...review(),assignmentId:'x'},{...review(),expectedScoreEditedAt:undefined},{...review(),expectedScoreEditedAt:'2026-10-18'}, {assignmentId:A,answerId:R,expectedScoreEditedAt:null}]) {
      expect(await saveGradingReview(bad as never)).toHaveProperty('error')
    }
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it('saves an explicit teacher zero atomically while omitting the unchanged automatic answer',async()=>{
    expect(await saveGradingReview(review())).toEqual({success:true})
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('save_grading_review',{
      p_actor_id:'teacher',p_assignment_id:A,p_answer_id:R,p_expected_score_edited_at:timestamp,
      p_answer_score:null,p_work_score:0,p_update_answer:false,p_update_work:true,
    })
    expect(mocks.revalidate).toHaveBeenCalledWith(`/assignments/${A}/results`,'layout')
    expect(mocks.revalidate).toHaveBeenCalledWith('/submissions/submission')
  })
  it('passes both explicit portions through the same RPC and preserves timestamp precision',async()=>{
    await saveGradingReview({...review(),answerScore:2.5,workScore:1.25})
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({p_answer_score:2.5,p_work_score:1.25,p_update_answer:true,p_update_work:true,p_expected_score_edited_at:timestamp})
  })
  it('configures only the current assignment and does not invent a default share',async()=>{
    expect(await configureGradingParts(allocation())).toEqual({success:true})
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('configure_assignment_question_grading_parts',{
      p_actor_id:'teacher',p_assignment_id:A,p_question_id:Q,p_answer_max_score:3,p_work_max_score:7,p_expected_updated_at:null,
    })
  })
  it.each([{answerMaxScore:0,workMaxScore:0},{answerMaxScore:null},{answerMaxScore:-1},{workMaxScore:Infinity},{expectedUpdatedAt:'invalid'}])('validates allocation %j before calling the service',async bad=>{
    expect(await configureGradingParts({...allocation(),...bad} as never)).toHaveProperty('error');expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each([
    ['PT409','โหลดหน้าใหม่'],['PT425','นักเรียนกำลังทำ'],['42501','ไม่มีสิทธิ์'],['22023','ไม่ถูกต้อง'],
    ['PGRST202','migration'],['42883','migration'],['42P01','migration'],['42703','migration'],['XX000','บันทึกคะแนนไม่สำเร็จ'],
  ])('maps SQL failure %s safely and never falls back to partial table updates',async(code,message)=>{
    mocks.rpc.mockResolvedValue({data:null,error:{code,message:'private SQL or student details'}})
    const response=await saveGradingReview(review())
    expect(response).toHaveProperty('error',expect.stringContaining(message))
    expect(JSON.stringify(response)).not.toContain('private SQL')
    expect(mocks.rpc).toHaveBeenCalledTimes(1);expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})
