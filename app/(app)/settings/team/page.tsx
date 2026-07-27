import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMyTeamOrgs, getTeamOrgData } from '@/lib/actions/team-org'
import { TeamOrgClient } from './_components'

export const metadata = { title: 'ทีมของฉัน — KorKru' }

export default async function TeamOrgPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'teacher' && profile?.role !== 'admin') redirect('/dashboard')

  const orgs = await getMyTeamOrgs()
  const teams = (
    await Promise.all(orgs.map(o => getTeamOrgData(o.id)))
  ).filter((t): t is NonNullable<typeof t> => t !== null)

  return <TeamOrgClient teams={teams} />
}
