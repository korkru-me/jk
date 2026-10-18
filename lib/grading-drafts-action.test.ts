import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublishGradingDraftsInput, SaveGradingDraftsInput } from './grading-draft-types'

const mocks = vi.hoisted(() => ({ user:vi.fn(), manage:vi.fn(), admin:vi.fn(), rpc:vi.fn(), revalidate:vi.fn() }))
vi.mock('next/cache',()=>({revalidatePath:mocks.revalidate}))
vi.mock('@/lib/auth/server',()=>({getAuthUser:mocks.user}))
vi.mock('@/lib/auth/assignment-access',()=>({canManageAssignment:mocks.manage}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:mocks.admin}))
import { publishGradingDrafts, saveGradingDrafts } from './actions/grading-drafts'

const A='00000000-0000-4000-8000-000000000001',R='00000000-0000-4000-8000-000000000002',R2='00000000-0000-4000-8000-000000000003',REQUEST='00000000-0000-4000-8000-000000000004'
const timestamp='2026-10-18T04:55:00.123456+00:00'
const input=():SaveGradingDraftsInput=>({assignmentId:A,requestId:REQUEST,items:[{answerId:R,expectedScoreEditedAt:timestamp,expectedDraftUpdatedAt:null,workScore:0}]})
const publish=():PublishGradingDraftsInput=>({...input(),confirmed:true})
beforeEach(()=>{
  vi.clearAllMocks();mocks.user.mockResolvedValue({id:'verified-teacher'});mocks.manage.mockResolvedValue(true)
  mocks.admin.mockReturnValue({rpc:mocks.rpc})
  mocks.rpc.mockResolvedValue({data:{success:true,requestId:REQUEST,drafts:[{answerId:R,expectedScoreEditedAt:timestamp,updatedAt:timestamp,workScore:0}],deletedDraftIds:[]},error:null})
})

describe('guarded private grading draft actions',()=>{
  it('requires verified authentication and exact management before creating a service client',async()=>{
    mocks.user.mockResolvedValueOnce(null)
    expect(await saveGradingDrafts(input())).toMatchObject({code:'permission'})
    expect(mocks.manage).not.toHaveBeenCalled();expect(mocks.admin).not.toHaveBeenCalled()
    mocks.manage.mockResolvedValue(false)
    expect(await saveGradingDrafts(input())).toMatchObject({code:'permission'})
    expect(await publishGradingDrafts(publish())).toMatchObject({code:'permission'})
    expect(mocks.manage).toHaveBeenCalledWith(A,'verified-teacher');expect(mocks.admin).not.toHaveBeenCalled()
  })
  it('preserves an explicit zero, omits untouched parts, derives actor, and only invalidates teacher results',async()=>{
    expect(await saveGradingDrafts(input())).toMatchObject({success:true})
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('save_grading_drafts',{
      p_actor_id:'verified-teacher',p_assignment_id:A,p_request_id:REQUEST,p_items:input().items,
    })
    expect(mocks.revalidate.mock.calls).toEqual([[`/assignments/${A}/results`,'layout']])
  })
  it('requires explicit publication confirmation before any service mutation',async()=>{
    expect(await publishGradingDrafts({...publish(),confirmed:false} as never)).toMatchObject({code:'validation'})
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it.each([null,undefined,'',-1,NaN,Infinity,'0',1_000_001])('rejects invalid score %s without service writes',async workScore=>{
    expect(await saveGradingDrafts({...input(),items:[{...input().items[0],workScore}]} as never)).toMatchObject({code:'validation'})
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('rejects missing fields, malformed IDs/revisions, duplicate IDs, empty and oversized batches',async()=>{
    const good=input()
    for(const bad of [null,[],{...good,requestId:'x'},{...good,assignmentId:'x'},{...good,items:[]},{...good,items:[good.items[0],good.items[0]]},
      {...good,items:[{...good.items[0],expectedDraftUpdatedAt:undefined}]},{...good,items:[{...good.items[0],expectedScoreEditedAt:'2026-10-18'}]},
      {...good,items:[{answerId:R,expectedScoreEditedAt:null,expectedDraftUpdatedAt:null}]},{...good,items:Array(5001).fill(good.items[0])}]) {
      expect(await saveGradingDrafts(bad as never)).toMatchObject({code:'validation'})
    }
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it('supports exact saved-draft removal, while forbidding publish removal or ambiguous remove/score mixtures',async()=>{
    const removal={answerId:R,expectedScoreEditedAt:null,expectedDraftUpdatedAt:timestamp,remove:true as const}
    expect(await saveGradingDrafts({...input(),items:[removal]})).toHaveProperty('success',true)
    mocks.rpc.mockClear()
    expect(await publishGradingDrafts({...publish(),items:[removal]})).toMatchObject({code:'validation'})
    expect(await saveGradingDrafts({...input(),items:[{...removal,answerScore:0}]})).toMatchObject({code:'validation'})
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('publishes once through the atomic RPC and invalidates every affected result without per-answer writes',async()=>{
    const result={success:true,requestId:REQUEST,published:[{answerId:R,submissionId:R2,scoreEditedAt:timestamp}],deletedDraftIds:[R],notificationCount:1}
    mocks.rpc.mockResolvedValue({data:result,error:null})
    expect(await publishGradingDrafts(publish())).toEqual(result)
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('publish_grading_drafts',{
      p_actor_id:'verified-teacher',p_assignment_id:A,p_request_id:REQUEST,p_items:input().items,
    })
    expect(mocks.revalidate).toHaveBeenCalledWith(`/submissions/${R2}`)
    expect(mocks.revalidate).toHaveBeenCalledWith('/dashboard')
  })
  it('sorts the same exact items for retry payload stability without changing precise revisions',async()=>{
    const row={...input().items[0],answerId:R2,expectedDraftUpdatedAt:timestamp}
    await saveGradingDrafts({...input(),items:[row,input().items[0]]})
    expect(mocks.rpc.mock.calls[0][1].p_items).toEqual([input().items[0],row])
  })
  it.each([
    ['PT409','conflict'],['23505','conflict'],['42501','permission'],['22023','validation'],['22P02','validation'],
    ['PGRST202','unavailable'],['42883','unavailable'],['42P01','unavailable'],['42703','unavailable'],['XX000','connection'],
  ])('maps %s safely and never falls back to table or partial grading writes',async(code,expected)=>{
    mocks.rpc.mockResolvedValue({data:null,error:{code,message:'private SQL or student details'}})
    const result=await publishGradingDrafts(publish())
    expect(result).toMatchObject({code:expected})
    expect(JSON.stringify(result)).not.toContain('private SQL')
    expect(mocks.rpc).toHaveBeenCalledTimes(1);expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it('fails closed on missing/malformed RPC success or ambiguous transport rejection',async()=>{
    mocks.rpc.mockResolvedValueOnce({data:null,error:null}).mockRejectedValueOnce(new Error('private network context'))
    expect(await saveGradingDrafts(input())).toMatchObject({code:'connection'})
    expect(await publishGradingDrafts(publish())).toMatchObject({code:'connection'})
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})
