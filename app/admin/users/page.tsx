import { createAdminClient } from '@/lib/supabase/admin'
import { UsersFilter, UsersTable } from './_components'

interface Props {
  searchParams: Promise<{ search?: string; role?: string; status?: string }>
}

export default async function AdminUsersPage({ searchParams }: Props) {
  const { search, role, status } = await searchParams
  const admin = createAdminClient()

  // Fetch users with question count
  let query = admin
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  if (search) query = (query as any).or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
  if (role && role !== 'all') query = (query as any).eq('role', role)
  if (status && status !== 'all') query = (query as any).eq('status', status)

  const { data: users } = await query

  // Get question counts per user
  const { data: qCounts } = await admin
    .from('questions')
    .select('created_by')
    .eq('is_research_snapshot', false)

  const countMap: Record<string, number> = {}
  for (const q of qCounts ?? []) {
    countMap[q.created_by] = (countMap[q.created_by] ?? 0) + 1
  }

  const usersWithCount = (users ?? []).map((u) => ({
    ...u,
    question_count: countMap[u.id] ?? 0,
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ผู้ใช้</h1>
        <p className="text-sm text-muted-foreground mt-1">{users?.length ?? 0} คน</p>
      </div>
      <UsersFilter />
      <UsersTable users={usersWithCount as any} />
    </div>
  )
}
