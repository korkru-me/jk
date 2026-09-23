'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  SebQuitPasswordError,
  toSafeSebQuitPasswordError,
  type SafeSebQuitPasswordError,
} from '@/lib/seb-quit-password-core.server'
import { createSebQuitPasswordRevisionForOwner } from '@/lib/seb-quit-password-service.server'

export type SaveSebQuitPasswordResult =
  | Readonly<{ success: true; revision: number; createdAt: string }>
  | Readonly<{ success: false; error: SafeSebQuitPasswordError }>

export async function saveSebQuitPassword(input: unknown): Promise<SaveSebQuitPasswordResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  try {
    if (!user) throw new SebQuitPasswordError('SEB_QUIT_PASSWORD_ACCESS_DENIED')
    const persisted = await createSebQuitPasswordRevisionForOwner(
      input as Parameters<typeof createSebQuitPasswordRevisionForOwner>[0],
      user.id,
    )

    revalidatePath(`/assignments/${persisted.assignmentId}`)
    revalidatePath(`/assignments/${persisted.assignmentId}/edit`)
    return Object.freeze({
      success: true,
      revision: persisted.revision,
      createdAt: persisted.createdAt,
    })
  } catch (error) {
    return Object.freeze({ success: false, error: toSafeSebQuitPasswordError(error) })
  }
}
