import { Card } from '@/components/ui/card'

/**
 * What the คลัง shows while its next view is being read.
 *
 * It exists here, below `questions/layout.tsx`, so that the two tabs stay on
 * screen and only the list under them is replaced. That placement is the whole
 * point: without a loading boundary of its own, clicking ภาพรวมคลัง or
 * โจทย์รายข้อ left the old page — old tab still highlighted — sitting there
 * for as long as the server took, and a tab that does not react reads as a
 * click that did not land. With one, the router commits immediately: the
 * highlight moves to the tab just pressed and the skeleton below says the
 * rest is on its way.
 *
 * Shaped like the lists it stands in for — a header line, a row of chips, a
 * search field, then cards — so the page does not jump when the real rows
 * arrive. The group's own spinner (`app/(app)/loading.tsx`) would have blanked
 * the tabs along with everything else.
 */
export default function QuestionsLoading() {
  return (
    <div className="space-y-4 max-w-[1200px] animate-pulse" aria-label="กำลังโหลดคลังโจทย์">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-2">
          <div className="h-6 w-48 rounded-md bg-muted" />
          <div className="h-4 w-64 rounded bg-muted/70" />
        </div>
        <div className="h-9 w-32 rounded-lg bg-muted" />
      </div>

      <div className="h-8 w-64 rounded-lg bg-muted" />
      <div className="h-10 w-full max-w-sm rounded-lg bg-muted" />

      <div className="space-y-3">
        {[0, 1, 2, 3].map(row => (
          <Card key={row} edge="ring" className="p-4 space-y-3">
            <div className="flex gap-1.5 flex-wrap">
              <div className="h-5 w-16 rounded-full bg-muted" />
              <div className="h-5 w-14 rounded-full bg-muted" />
              <div className="h-5 w-24 rounded-full bg-muted" />
            </div>
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-3 w-1/2 rounded bg-muted/70" />
          </Card>
        ))}
      </div>
    </div>
  )
}
