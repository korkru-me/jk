import { buildFullName } from '@/lib/utils'

export interface HomeroomClassmateUser {
  id: string
  full_name: string
  prefix: string | null
  first_name: string | null
  last_name: string | null
}
export interface HomeroomClassmate {
  id: string
  full_name: string
  class_number: number | null
}

/** Project only display identity and number from an already-authorized roster. */
export function buildHomeroomClassmates(roster: readonly HomeroomClassmateUser[], numbers: readonly { student_id: string; class_number: number | null }[], selfId: string): HomeroomClassmate[] {
  const byId = new Map(numbers.map(row => [row.student_id, row.class_number]))
  const compareNames = new Intl.Collator('th')
  return [...new Map(roster.filter(user => user.id !== selfId).map(user => [user.id, user])).values()].map(user => {
    const number = byId.get(user.id)
    const legacyName = user.full_name.trim()
    const name = user.first_name && user.last_name
      ? buildFullName(user.prefix, user.first_name, user.last_name)
      : user.prefix && !legacyName.startsWith(user.prefix) ? `${user.prefix}${legacyName}` : legacyName
    return {
      id: user.id,
      full_name: name || 'นักเรียน',
      class_number: typeof number === 'number' && Number.isSafeInteger(number) && number > 0 ? number : null,
    }
  }).sort((a, b) => (a.class_number ?? Infinity) - (b.class_number ?? Infinity) || compareNames.compare(a.full_name, b.full_name) || a.id.localeCompare(b.id))
}
