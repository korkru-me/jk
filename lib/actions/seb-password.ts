'use server'

import { changeSebPasswordDraft, sebPasswordErrorMessage } from '@/lib/seb-password-service'
import { sebPasswordServicePorts } from '@/lib/seb-password-repository'
import type { SebPasswordSettingsResult } from '@/lib/seb-password-settings'

export async function updateSebPasswordDraft(input: unknown): Promise<SebPasswordSettingsResult> {
  try {
    const summary = await changeSebPasswordDraft(input, sebPasswordServicePorts)
    // Return only the acknowledged metadata. No revalidation step after the
    // commit that could hide a successful save behind a cache failure.
    return { ok: true, summary }
  } catch (error) {
    return { ok: false, ...sebPasswordErrorMessage(error) }
  }
}
