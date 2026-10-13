import { notFound, redirect } from 'next/navigation'
import { PracticeAccessState } from '@/components/practice/practice-access-state'
import { PracticeWaitingRoom } from '@/components/practice/practice-waiting-room'
import { getAuthUser } from '@/lib/auth/server'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'
import { loadPracticeLibraryWaiting } from '@/lib/practice-question-access.server'
import { buildPracticeSearchHref, parsePracticeSearchParams } from '@/lib/practice-search'

export const metadata = { title: 'คลังฝึกด้วยตนเอง — KorKru' }

export default async function StudentPracticeLibraryWaitingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!isPracticeLibraryEnabled(process.env)) notFound()
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const { id } = await params
  const result = await loadPracticeLibraryWaiting(user.id, id)

  if (result.status !== 'ready') {
    if (result.status === 'unavailable') {
      return <PracticeAccessState kind="unavailable" returnHref="/practice" />
    }
    notFound()
  }
  return (
    <PracticeWaitingRoom
      library={result.library}
      questionCount={result.questionCount}
      enterHref={buildPracticeSearchHref(id, parsePracticeSearchParams({}))}
    />
  )
}
