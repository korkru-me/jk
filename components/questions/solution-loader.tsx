'use client'

import { createContext, useContext } from 'react'
import { getQuestionSolution } from '@/lib/actions/question-solution'

export type SolutionLoader = typeof getQuestionSolution

const SolutionLoaderContext = createContext<SolutionLoader>(getQuestionSolution)

/**
 * Where the ดูเฉลย dialog reads a เฉลย from: the database, unless a QA lab
 * swaps in synthetic ones — the same way `SolutionSection` takes a
 * `fileStore`, so the lab can open the real cards without anyone signing in.
 */
export function SolutionLoaderProvider({ loader, children }: {
  loader: SolutionLoader
  children: React.ReactNode
}) {
  return <SolutionLoaderContext value={loader}>{children}</SolutionLoaderContext>
}

export function useSolutionLoader(): SolutionLoader {
  return useContext(SolutionLoaderContext)
}
