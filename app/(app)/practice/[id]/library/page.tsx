import { notFound, redirect } from 'next/navigation'
import { PracticeAccessState } from '@/components/practice/practice-access-state'
import { PracticeLocalLibraryView } from '@/components/practice/practice-local-library-view'
import { isLocalPracticeReviewEnabled } from '@/lib/practice-local-review'
import { PracticeLibraryView } from '@/components/practice/practice-library-view'
import { loadPracticeExercises, loadPracticeReviewPins } from '@/lib/practice-exercises.server'
import { getAuthUser } from '@/lib/auth/server'
import { isPracticeLibraryEnabled } from '@/lib/practice-question'
import { loadPracticeLibrarySearch, loadPracticeLibraryLocalSnapshot } from '@/lib/practice-question-access.server'
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
  const localReview = isLocalPracticeReviewEnabled(process.env)
  const search = localReview ? { ...state, exerciseId: undefined, reviewOnly: undefined } : state

  if (localReview) {
    const allState = { q: '', tags: [], page: 1, ignoredTagCount: 0 }
    const [all, filtered] = await Promise.all([
      loadPracticeLibraryLocalSnapshot(user.id, id, allState),
      state.q || state.tags.length ? loadPracticeLibraryLocalSnapshot(user.id, id, search) : null,
    ])
    if (all.status !== 'ready' || (filtered && filtered.status !== 'ready')) {
      const failure = all.status !== 'ready' ? all : filtered!
      if (failure.status === 'unavailable') return <PracticeAccessState kind="unavailable" returnHref={`/practice/${id}`} />
      notFound()
    }
    if (all.library.requiresAccessCode
      && !await hasPracticeAccessSession(user.id, id)) redirect(`/practice/${id}`)
    return <PracticeLocalLibraryView key={`${user.id}:${id}`} library={all.library} items={all.items}
      matchingIds={(filtered?.items ?? all.items).map(item => item.id)} state={state} storageOwnerId={user.id} />
  }

  const result = await loadPracticeLibrarySearch(user.id, id, search)

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

  const [groups, pins] = await Promise.all([loadPracticeExercises(user.id, id), loadPracticeReviewPins(user.id, id)])
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
      pinnedQuestionIds={pins.ready ? pins.questionIds : []}
      pinsReady={pins.ready}
    />
  )
}
