import type { PracticeLibraryStatus } from '@/lib/practice-library-contracts'

export type PracticeManagementSection = 'overview' | 'settings' | 'progress'

/** Presentation only. Access codes and answer-bearing data never enter the sidebar. */
export interface PracticeManagementSummary {
  id: string
  title: string
  status: PracticeLibraryStatus
  classroom: { id: string; name: string; description: string | null }
  questionCount: number
  studentCount: number
}

export function practiceManagementHref(id: string, section: PracticeManagementSection, baseHref?: string) {
  const base = baseHref ?? `/practice/${encodeURIComponent(id)}/edit`
  return section === 'overview' ? base : `${base}?tab=${section}`
}
