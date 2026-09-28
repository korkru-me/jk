import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const MIGRATION_URL = new URL(
  '../supabase/migrations/20260927094000_fix_seb_s5_essay_cleanup_reconciliation.sql',
  import.meta.url,
)

describe('SEB S5 essay cleanup reconciliation patch', () => {
  it('changes exactly the reviewed question and answer predicates and verifies the result', () => {
    const sql = readFileSync(MIGRATION_URL, 'utf8')

    expect(sql).toContain("proc.proname = 'seb_s5_find_exact_run_targets'")
    expect(sql).toContain("= 'p_criteria jsonb'")
    expect(sql).toContain("<> 2 * length(v_question_old)")
    expect(sql).toContain("<> 2 * length(v_question_new)")
    expect(sql).toContain("$old$then 'written' else 'file_upload' end$old$")
    expect(sql).toContain("$new$then 'essay' else 'file_upload' end$new$")
    expect(sql).toContain("using errcode = '55000'")
    expect(sql).not.toMatch(/drop\s+function/i)
  })
})
