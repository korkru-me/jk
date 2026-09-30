import { redirect } from 'next/navigation'

/** Archive was retired in favour of one recoverable destination: trash. */
export default function ArchivedClassroomsPage() {
  redirect('/classrooms/trash')
}
