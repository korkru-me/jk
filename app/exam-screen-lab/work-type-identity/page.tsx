import { notFound } from 'next/navigation'
import { isExamScreenLabEnabled } from '@/lib/exam-screen-lab-access'
import { AppFeatureFlagsProvider } from '@/components/layout/app-feature-flags'
import { AssignmentCreationMenu } from '@/components/assignments/assignment-creation-menu'
import { AssignmentTypeChoice } from '@/app/(app)/assignments/new/_components/assignment-start-choice'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ตัวอย่างสีประเภทงาน — KorKru' }

/** UI-only preview: the feature flag is confined to the guarded fixture. */
export default function WorkTypeIdentityLabPage() {
  if (!isExamScreenLabEnabled(process.env)) notFound()
  return <AppFeatureFlagsProvider practiceLibrary>
    <main className="flex min-w-0 flex-col gap-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">ตัวอย่างสีประเภทงาน · ข้อมูลจำลอง</p>
        <AssignmentCreationMenu classroomId="00000000-0000-4000-8000-000000000001" />
      </div>
      <AssignmentTypeChoice
        backHref="/exam-screen-lab/classroom-groups?view=work"
        exerciseHref="/exam-screen-lab/assignment-creation?type=exercise"
        examHref="/exam-screen-lab/assignment-creation?type=exam"
        practiceHref="/exam-screen-lab/practice-library"
      />
    </main>
  </AppFeatureFlagsProvider>
}
