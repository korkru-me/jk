'use server'

import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/server'
import { isUuid } from '@/lib/practice-library-contracts'
import { verifyPracticeLibraryAccessCode } from '@/lib/practice-question-access.server'
import { grantPracticeAccessSession } from '@/lib/practice-access-session.server'

export async function unlockPracticeLibrary(libraryId: string, formData: FormData): Promise<never> {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  if (!isUuid(libraryId)) redirect('/practice')
  const accessCode = formData.get('accessCode')
  const result = await verifyPracticeLibraryAccessCode(
    user.id,
    libraryId,
    typeof accessCode === 'string' ? accessCode : '',
  )
  if (result !== 'accepted') {
    redirect(`/practice/${libraryId}?access=${result === 'unavailable' ? 'unavailable' : 'invalid'}`)
  }
  if (!await grantPracticeAccessSession(user.id, libraryId)) {
    redirect(`/practice/${libraryId}?access=unavailable`)
  }
  redirect(`/practice/${libraryId}/library`)
}
