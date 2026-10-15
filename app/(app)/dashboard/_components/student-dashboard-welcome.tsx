import { BRAND_MARK_ASPECT_RATIO, BRAND_MARK_URL } from '@/components/brand-mark-data'
import { JoinClassroomForm, type JoinClassroomAction } from '@/components/classrooms/join-classroom-form'
import { Card } from '@/components/ui/card'

/** The same 30 spacing units as a classroom card's h-16 cover + min-h-14 body. */
export function StudentDashboardWelcome({ fullName, greeting, initialJoinCode, joinAction }: {
  fullName: string
  greeting: string
  initialJoinCode: string
  joinAction?: JoinClassroomAction
}) {
  return (
    <Card
      edge="ring"
      className="@container/student-welcome relative isolate flex min-h-30 items-center overflow-hidden bg-linear-to-r from-primary/8 via-card to-primary/5 px-4 py-3"
      data-student-dashboard-welcome
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-2 right-4 -z-10 bg-brand-accent/12"
        style={{
          WebkitMask: `url('${BRAND_MARK_URL}') center / contain no-repeat`,
          mask: `url('${BRAND_MARK_URL}') center / contain no-repeat`,
          aspectRatio: BRAND_MARK_ASPECT_RATIO,
        }}
        data-student-dashboard-welcome-mark
      />
      <div className="grid w-full min-w-0 items-center gap-2 @min-[38rem]/student-welcome:grid-cols-[minmax(0,1fr)_20rem] @min-[38rem]/student-welcome:gap-5">
        <p className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-medium text-foreground/80">{greeting} <span aria-hidden="true">👋</span></span>
          <span className="break-words text-xl leading-tight font-bold text-primary [overflow-wrap:anywhere] @min-[30rem]/student-welcome:text-2xl">{fullName.trim() || 'นักเรียน'}</span>
        </p>
        <div className="min-w-0 [&_input]:min-h-[44px] [&_input]:bg-card/90 [&_button]:min-h-[44px]">
          <JoinClassroomForm initialCode={initialJoinCode} compact joinAction={joinAction} />
        </div>
      </div>
    </Card>
  )
}
