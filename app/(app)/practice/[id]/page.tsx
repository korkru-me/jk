import { notFound, redirect } from 'next/navigation'
import { PracticeAccessState } from '@/components/practice/practice-access-state'
import { PracticeWaitingRoom } from '@/components/practice/practice-waiting-room'
import { getAuthUser } from '@/lib/auth/server'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'
import { loadPracticeLibraryWaiting } from '@/lib/practice-question-access.server'
import { buildPracticeSearchHref, parsePracticeSearchParams } from '@/lib/practice-search'
import { hasPracticeAccessSession } from '@/lib/practice-access-session.server'
import { unlockPracticeLibrary } from '../_access-actions'

export const metadata = { title: 'คลังฝึกด้วยตนเอง — KorKru' }

export default async function StudentPracticeLibraryWaitingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!isPracticeLibraryEnabled(process.env)) notFound()
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const [{ id }, rawSearch] = await Promise.all([params, searchParams])
  const result = await loadPracticeLibraryWaiting(user.id, id)

  if (result.status !== 'ready') {
    if (result.status === 'unavailable') {
      return <PracticeAccessState kind="unavailable" returnHref="/practice" />
    }
    notFound()
  }
  const unlocked = !result.library.requiresAccessCode
    || await hasPracticeAccessSession(user.id, id)
  const rawAccessError = Array.isArray(rawSearch.access) ? rawSearch.access[0] : rawSearch.access
  const accessError = rawAccessError === 'invalid' || rawAccessError === 'unavailable'
    ? rawAccessError
    : null
  return (
    <PracticeWaitingRoom
      library={result.library}
      questionCount={result.questionCount}
      enterHref={buildPracticeSearchHref(id, parsePracticeSearchParams({}))}
      locked={!unlocked}
      accessError={accessError}
      unlockAction={unlockPracticeLibrary.bind(null, id)}
    />
  )
}
