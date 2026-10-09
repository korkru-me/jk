import type { ReactNode } from 'react'

export default function WaitingExamLayout({ children }: { children: ReactNode }) {
  // Deliberately outside (app): no sidebar, notifications polling, classroom,
  // practice, solution, teacher or account navigation is mounted here.
  return <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
    <header className="flex items-center justify-between border-b pb-4">
      <span className="font-semibold text-primary">KorKru · ห้องสอบ</span>
      <span className="text-sm text-muted-foreground">Safe Exam Browser</span>
    </header>
    {children}
  </main>
}
