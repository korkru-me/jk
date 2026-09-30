import { CircleCheck, Copy, FileText } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface AssignmentReviewTheme {
  surface: string
  text: string
  textMuted: string
}

export interface AssignmentReviewRow {
  label: string
  value: ReactNode
}

interface AssignmentReviewSummaryProps {
  mode: 'create' | 'copy'
  rows: AssignmentReviewRow[]
  theme?: AssignmentReviewTheme | null
}

/**
 * Final review card for an assignment. Its tint follows the first (contextual)
 * classroom, while the inner surface keeps dense settings readable in both
 * light and dark mode.
 */
export function AssignmentReviewSummary({ mode, rows, theme }: AssignmentReviewSummaryProps) {
  const isCopy = mode === 'copy'
  const Icon = isCopy ? Copy : FileText
  const mutedText = theme?.textMuted ?? 'text-muted-foreground'

  return (
    <Card
      padding="xl"
      className={cn(
        'flex flex-col gap-5 overflow-hidden',
        theme
          ? cn(theme.surface, theme.text)
          : 'border-primary/20 bg-primary/5 text-foreground',
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-current/10 bg-background/60">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="font-bold text-base">
            {isCopy ? 'สรุปก่อนทำสำเนา' : 'สรุปก่อนสร้าง'}
          </h3>
          <p className={cn('text-xs leading-5', mutedText)}>
            ตรวจรายละเอียดทั้งหมดอีกครั้งก่อนบันทึกงาน
          </p>
        </div>
      </div>

      <dl className="rounded-xl border border-current/10 bg-background/60 px-4">
        {rows.map(row => (
          <div
            key={row.label}
            className="grid grid-cols-[minmax(6.5rem,0.8fr)_minmax(0,1.2fr)] items-start gap-4 border-b border-current/10 py-2.5 last:border-b-0"
          >
            <dt className={cn('text-sm', mutedText)}>{row.label}</dt>
            <dd className="min-w-0 break-words text-right text-sm font-semibold">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex items-start gap-2 border-t border-current/10 pt-4">
        <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p className={cn('text-xs leading-5', mutedText)}>
          {isCopy
            ? 'เลือกได้ว่าจะเผยแพร่สำเนาทันที ตั้งเวลา หรือเก็บสำเนาเป็นแบบร่างไว้ตรวจต่อ'
            : 'เลือกได้ว่าจะเผยแพร่ทันที ตั้งเวลา หรือกดบันทึกแบบร่างไว้ทำต่อภายหลัง'}
        </p>
      </div>
    </Card>
  )
}
