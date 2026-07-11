import { redirect } from 'next/navigation'
import { getOrgData } from '@/lib/actions/org-members'
import { OrgSettingsClient } from './_components'

export const metadata = { title: 'พื้นที่ทำงานและทีม — KorKru' }

export default async function OrganizationPage() {
  const data = await getOrgData()
  if (!data) redirect('/dashboard')

  return <OrgSettingsClient data={data} />
}
