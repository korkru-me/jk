import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const MIGRATION_URL = new URL(
  '../supabase/migrations/20260927095000_allow_null_owner_for_seb_s5_signed_upload.sql',
  import.meta.url,
)

describe('SEB S5 admin-signed upload owner reconciliation patch', () => {
  it('allows only a missing owner while preserving exact mismatched-owner rejection', () => {
    const sql = readFileSync(MIGRATION_URL, 'utf8')

    expect(sql).toContain("proc.proname = 'seb_s5_attest_storage_object'")
    expect(sql).toContain(
      "'p_schema_version integer, p_qa_namespace text, p_bucket_name text, p_path text'",
    )
    expect(sql).toContain('$old$    if v_object_owner_id is null')
    expect(sql).toContain('$new$    if (v_object_owner_id is not null')
    expect(sql).toContain('and v_object_owner_id <> v_owner_id::text)')
    expect(sql).toContain("using errcode = '55000'")
    expect(sql).not.toMatch(/drop\s+function/i)
    expect(sql).not.toMatch(/security\s+definer/i)
  })
})
