import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ auth:vi.fn(), admin:vi.fn(), release:vi.fn(), items:vi.fn(), watermark:vi.fn() }))
vi.mock('server-only',()=>({}))
vi.mock('@/lib/auth/server',()=>({getAuthUser:m.auth}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.admin}))
vi.mock('@/lib/attempt-solutions-server',()=>({loadSolutionRelease:m.release,loadAttemptSolutionItems:m.items,SOLUTION_RELEASE_ASSIGNMENT_FIELDS:'show_solutions'}))
vi.mock('@/lib/solution-watermark-server',()=>({loadStudentSolutionWatermark:m.watermark}))
import { getAttemptSolutions } from './actions/attempt-solutions'
const id='00000000-0000-4000-8000-000000000007'
let filters:Record<string,string>
beforeEach(()=>{
  vi.clearAllMocks();filters={}
  m.auth.mockResolvedValue({id:'student'})
  const q={select:vi.fn().mockReturnThis(),eq:vi.fn((key:string,value:string)=>{filters[key]=value;return q}),maybeSingle:vi.fn(async()=>({data:filters.student_id==='student'?{id,status:'submitted',assignments:{show_solutions:true}}:null,error:null}))}
  m.admin.mockReturnValue({from:()=>q});m.release.mockResolvedValue({state:'open'});m.items.mockResolvedValue([{answerId:'one'}]);m.watermark.mockResolvedValue({name:'เด็กชายทดสอบ เรียนรู้',issuedAt:'2026-10-14T00:00:00Z'})
})
describe('released solutions require authorized identity',()=>{
  it('binds both reads to the verified owner and returns a watermark with the solutions',async()=>{
    const result=await getAttemptSolutions(id)
    expect(filters).toEqual({id,student_id:'student'});expect(m.watermark).toHaveBeenCalledWith(expect.anything(),'student');expect(result).toHaveProperty('data.watermark.name','เด็กชายทดสอบ เรียนรู้')
  })
  it('does not read identity or solutions for another owner',async()=>{
    m.auth.mockResolvedValue({id:'other'});expect(await getAttemptSolutions(id)).toHaveProperty('error');expect(m.watermark).not.toHaveBeenCalled();expect(m.items).not.toHaveBeenCalled()
  })
  it('keeps both identity and solution payloads behind the release gate',async()=>{
    m.release.mockResolvedValue({state:'locked'});expect(await getAttemptSolutions(id)).toHaveProperty('error');expect(m.watermark).not.toHaveBeenCalled();expect(m.items).not.toHaveBeenCalled()
  })
  it('does not serialize unwatermarked solutions when identity lookup fails',async()=>{
    m.watermark.mockResolvedValue(null);const result=await getAttemptSolutions(id);expect(result).toHaveProperty('error');expect(result).not.toHaveProperty('data')
  })
  it.each([null,{id:'student'}])('rejects absent Auth or invalid IDs before service reads',async user=>{
    m.auth.mockResolvedValue(user);expect(await getAttemptSolutions('invalid')).toHaveProperty('error');expect(m.admin).not.toHaveBeenCalled()
  })
})
