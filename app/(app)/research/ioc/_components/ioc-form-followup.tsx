'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { IocFormDashboard, type DashboardExpert } from './ioc-form-dashboard'
import { IocSummaryPanel, type SummaryRow } from './ioc-summary-panel'
import type { IocSummary } from '@/lib/ioc'

/**
 * What a form looks like once it has gone out: who is still filling it in, and
 * what the answers add up to so far. Two views of the same collection, kept
 * side by side rather than on two routes so the teacher does not lose the
 * freshly issued links by navigating.
 */
export function IocFormFollowUp({
  formId,
  examTitle,
  authorName,
  itemCount,
  experts,
  summary,
  rows,
  percentRuleLabel,
  generatedParagraph,
  savedParagraph,
  paragraphStale,
}: {
  formId: string
  examTitle: string
  authorName: string
  itemCount: number
  experts: DashboardExpert[]
  summary: IocSummary
  rows: SummaryRow[]
  percentRuleLabel: string
  generatedParagraph: string
  savedParagraph: string | null
  paragraphStale: boolean
}) {
  const [tab, setTab] = useState<'experts' | 'summary'>('experts')
  const submitted = experts.filter(expert => expert.status === 'submitted').length

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2" aria-label="มุมมองของฟอร์ม">
        <Button
          size="sm"
          variant={tab === 'experts' ? 'default' : 'outline'}
          aria-current={tab === 'experts' ? 'page' : undefined}
          onClick={() => setTab('experts')}
        >
          ผู้ทรงคุณวุฒิ ({submitted}/{experts.length})
        </Button>
        <Button
          size="sm"
          variant={tab === 'summary' ? 'default' : 'outline'}
          aria-current={tab === 'summary' ? 'page' : undefined}
          onClick={() => setTab('summary')}
        >
          สรุปผล
        </Button>
      </nav>

      {tab === 'experts' ? (
        <IocFormDashboard
          formId={formId}
          examTitle={examTitle}
          authorName={authorName}
          itemCount={itemCount}
          experts={experts}
          freshLinks={[]}
        />
      ) : (
        <IocSummaryPanel
          formId={formId}
          summary={summary}
          rows={rows}
          percentRuleLabel={percentRuleLabel}
          invitedCount={experts.length}
          generatedParagraph={generatedParagraph}
          savedParagraph={savedParagraph}
          paragraphStale={paragraphStale}
        />
      )}
    </div>
  )
}
