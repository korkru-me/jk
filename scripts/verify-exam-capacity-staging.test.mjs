import { describe, expect, it } from 'vitest'
import { actionResult, assertTarget, encodeForm, validateManifest } from './verify-exam-capacity-staging.mjs'
const keys={site:'https://staging.korkru.com',projectRef:'dyuxkrzeveknqgtuzpbh',protection:'synthetic'}
describe('bounded Staging exam load harness',()=>{
 it('rejects Production or another project before requests',()=>{
  expect(()=>assertTarget(keys)).not.toThrow()
  expect(()=>assertTarget({...keys,site:'https://www.korkru.com'})).toThrow()
  expect(()=>assertTarget({...keys,projectRef:'libsutfinswqkruihwdx'})).toThrow()
 })
 it('places FormData fields before its streaming root model',()=>{
  const fields=[...encodeForm({role:'student',email:'synthetic@example.test'}).entries()]
  expect(fields).toEqual([['_1_role','student'],['_1_email','synthetic@example.test'],['0','["$K1"]']])
 })
 it('does not count HTTP 200 with an application error as a passed operation',()=>{
  expect(()=>actionResult('0:{}\n1:{"error":"throttled"}\n')).toThrow('throttled')
  expect(()=>actionResult('0:{}\n')).toThrow('Missing action receipt')
  expect(actionResult('0:{}\n1:{"success":true}\n')).toEqual({success:true})
 })
 it('requires exact run-owned synthetic identities and bounds the account count',()=>{
  const run='247298e6-d6be-445b-b9a6-ddb6b008e76e'
  const m={...keys,run,accounts:[{label:'student01',email:`capacity-${run}-student01@qa.staging.korkru.com`,cookies:[]}]}
  expect(()=>validateManifest(m)).not.toThrow()
  expect(()=>validateManifest({...m,accounts:[{...m.accounts[0],email:'real@example.com'}]})).toThrow()
  expect(()=>validateManifest({...m,accounts:Array(82).fill(m.accounts[0])})).toThrow()
  expect(()=>validateManifest({...m,accounts:[m.accounts[0],m.accounts[0]]})).toThrow('Duplicate identity')
 })
})
