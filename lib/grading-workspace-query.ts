/** Bound route state; database identities and scores are never taken from it. */
export interface GradingWorkspaceQuery {
  view?: 'questions' | 'students'
  classroom?: string
  sort?: 'classroom' | 'code' | 'number' | 'name'
  dir?: 'asc' | 'desc'
  page?: number
}

export function parseGradingWorkspaceQuery(values: Record<string, string | string[] | undefined>): GradingWorkspaceQuery {
  const scalar = (key: string) => typeof values[key] === 'string' ? values[key] as string : undefined
  const view = scalar('view')
  const sort = scalar('sort')
  const dir = scalar('dir')
  const room = scalar('classroom')
  const rawPage = scalar('page')
  const page = rawPage && /^\d{1,7}$/.test(rawPage) ? Number(rawPage) : 1
  return {
    view: view === 'students' ? 'students' : 'questions',
    classroom: room && room.length <= 80 ? room : undefined,
    sort: sort === 'name' || sort === 'code' || sort === 'number' ? sort : 'classroom',
    dir: dir === 'desc' ? 'desc' : 'asc',
    page: page >= 1 ? page : 1,
  }
}
