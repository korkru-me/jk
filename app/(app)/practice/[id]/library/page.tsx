import { notFound, redirect } from 'next/navigation'
import { PracticeAccessState } from '@/components/practice/practice-access-state'
import { PracticeLibraryView } from '@/components/practice/practice-library-view'
import { loadPracticeExercises } from '@/lib/practice-exercises.server'
import { getAuthUser } from '@/lib/auth/server'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'
import { loadPracticeLibrarySearch } from '@/lib/practice-question-access.server'
import { buildPracticeSearchHref, parsePracticeSearchParams } from '@/lib/practice-search'
import { hasPracticeAccessSession } from '@/lib/practice-access-session.server'

export const metadata = { title: 'คลังฝึกด้วยตนเอง — KorKru' }

type SearchParams = Record<string, string | string[] | undefined>

export default async function StudentPracticeLibraryQuestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParams>
}) {
  if (!isPracticeLibraryEnabled(process.env)) notFound()
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const [{ id }, rawSearch] = await Promise.all([params, searchParams])
  const state = parsePracticeSearchParams(rawSearch)
  const result = await loadPracticeLibrarySearch(user.id, id, state)

  if (result.status !== 'ready') {
    if (result.status === 'unavailable') {
      return <PracticeAccessState kind="unavailable" returnHref="/practice" />
    }
    notFound()
  }
  if (result.library.requiresAccessCode
    && !await hasPracticeAccessSession(user.id, id)) redirect(`/practice/${id}`)
  if (result.canonicalPage !== state.page) {
    redirect(buildPracticeSearchHref(id, state, { page: result.canonicalPage }))
  }

  const groups = await loadPracticeExercises(user.id, id)
  if (state.exerciseId && (!groups.ready || !groups.exercises.some(exercise => exercise.id === state.exerciseId))) {
    if (!groups.ready) return <PracticeAccessState kind="unavailable" returnHref={`/practice/${id}/library`} />
    notFound()
  }

  return (
    <PracticeLibraryView
      key={`${user.id}:${id}`}
      library={result.library}
      items={result.items}
      total={result.total}
      totalPages={result.totalPages}
      state={state}
      storageOwnerId={user.id}
      exercises={groups.ready ? groups.exercises : []}
      exercisesReady={groups.ready}
    />
  )
}
