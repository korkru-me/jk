import { CircleCheck, Copy, FileText } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'

export interface AssignmentReviewRow {
  label: string
  value: ReactNode
}

interface AssignmentReviewSummaryProps {
  mode: 'create' | 'copy'
  rows: AssignmentReviewRow[]
}

/**
 * Final review card for an assignment. It uses the same neutral card and text
 * hierarchy as the rest of the form, independent of classroom cover colours.
 */
export function AssignmentReviewSummary({ mode, rows }: AssignmentReviewSummaryProps) {
  const isCopy = mode === 'copy'
  const Icon = isCopy ? Copy : FileText

  return (
    <Card
      padding="xl"
      className="flex flex-col gap-5 overflow-hidden"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-foreground">
            {isCopy ? 'สรุปก่อนทำสำเนา' : 'สรุปก่อนสร้าง'}
          </h3>
          <p data-assignment-description className="text-xs leading-5 text-muted-foreground">
            ตรวจรายละเอียดทั้งหมดอีกครั้งก่อนบันทึกงาน
          </p>
        </div>
      </div>

      <dl className="rounded-xl border border-border px-4">
        {rows.map(row => (
          <div
            key={row.label}
            className="grid grid-cols-[minmax(6.5rem,0.8fr)_minmax(0,1.2fr)] items-start gap-4 border-b border-border py-2.5 last:border-b-0"
          >
            <dt className="text-sm text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 break-words text-right text-sm font-semibold text-foreground">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div data-assignment-description className="flex items-start gap-2 border-t border-border pt-4 text-muted-foreground">
        <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p className="text-xs leading-5">
          {isCopy
            ? 'เลือกได้ว่าจะเผยแพร่สำเนาทันที ตั้งเวลา หรือเก็บสำเนาเป็นแบบร่างไว้ตรวจต่อ'
            : 'เลือกได้ว่าจะเผยแพร่ทันที ตั้งเวลา หรือกดบันทึกแบบร่างไว้ทำต่อภายหลัง'}
        </p>
      </div>
    </Card>
  )
}
