'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type {
  QuestionSearchGroup,
  QuestionSearchGroupCounts,
  QuestionSearchScope,
} from '@/lib/question-search'

/**
 * How a grouped question search presents itself.
 *
 * Two pages run the same search now — คลังโจทย์ and the โจทย์ browser under
 * คลังแฟ้มโจทย์ — and the grouping is a promise about *what was matched*, not
 * decoration: "พบจากแท็ก" has to mean the same thing in both places, or the
 * same query would appear to give two different answers.
 */
export const SEARCH_GROUP_META: Record<QuestionSearchGroup, { label: string; heading: string; description: string }> = {
  tag: {
    label: 'แท็ก',
    heading: 'พบจากแท็ก',
    description: 'คำค้นตรงกับแท็กที่ใช้จัดหมวดหมู่โจทย์',
  },
  title: {
    label: 'ชื่อโจทย์',
    heading: 'พบจากชื่อโจทย์',
    description: 'คำค้นตรงกับชื่อโจทย์',
  },
  content: {
    label: 'เนื้อหาโจทย์',
    heading: 'พบจากเนื้อหาโจทย์',
    description: 'คำค้นตรงกับข้อความภายในโจทย์',
  },
}


export function SearchGroupHeading({ id, group, count }: {
  id: string
  group: QuestionSearchGroup
  count: number
}) {
  const meta = SEARCH_GROUP_META[group]
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border pb-2">
      <div>
        <h3 id={id} className="text-sm font-semibold text-foreground">{meta.heading}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
      </div>
      <Badge variant="outline">{count} ข้อ</Badge>
    </div>
  )
}


export function SearchGroupSelector({ value, counts, onChange, label }: {
  value: QuestionSearchScope
  counts: QuestionSearchGroupCounts
  onChange: (value: QuestionSearchScope) => void
  label: string
}) {
  const options: { value: QuestionSearchScope; label: string; count: number }[] = [
    {
      value: 'all',
      label: 'ทั้งหมด',
      count: counts.tag + counts.title + counts.content,
    },
    ...(['tag', 'title', 'content'] as const).map(group => ({
      value: group,
      label: SEARCH_GROUP_META[group].label,
      count: counts[group],
    })),
  ]

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        เรียงผลจากแท็ก → ชื่อโจทย์ → เนื้อหาโจทย์ และแสดงแต่ละข้อเพียงกลุ่มเดียว
      </p>
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
        <span className="mr-1 text-xs font-medium text-muted-foreground">แสดง:</span>
        {options.map(option => (
          <Button
            key={option.value}
            type="button"
            size="xs"
            variant={value === option.value ? 'default' : 'outline'}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            <span aria-hidden="true">{option.count}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}
