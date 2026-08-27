'use client'

import { ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import {
  LIBRARY_QUESTION_SORT_KEYS,
  QUESTION_SORTS,
  QUESTION_SORT_KEYS,
  TEAM_QUESTION_SORT_KEYS,
  type QuestionSort,
  type QuestionSortDir,
  type QuestionSortKey,
  type QuestionSortScope,
} from '@/lib/question-sort'

/**
 * Picking how a list of questions is ordered — the key, and which end it
 * starts from.
 *
 * Shared by every list that offers an order, so the same key means the same
 * thing everywhere and a direction label never has to be reinvented. Which
 * keys are on offer is the scope's business (`lib/question-sort.ts`), not this
 * component's.
 */
export function QuestionSortControl({ sort, onChange, label, scope = '', omitKeys }: {
  sort: QuestionSort
  onChange: (sort: QuestionSort) => void
  label: string
  /** Which list this belongs to — the team list offers two more keys. */
  scope?: QuestionSortScope
  /** Keys to leave out of the menu for this particular list. */
  omitKeys?: QuestionSortKey[]
}) {
  const spec = QUESTION_SORTS[sort.key]
  const flipped: QuestionSortDir = sort.dir === 'asc' ? 'desc' : 'asc'
  const offered = (scope === 't' ? TEAM_QUESTION_SORT_KEYS
    : scope === 'u' ? LIBRARY_QUESTION_SORT_KEYS
      : QUESTION_SORT_KEYS)
    .filter(key => !omitKeys?.includes(key))
  // A key can arrive from a URL that the menu no longer offers — a link shared
  // by a teacher in several teams, opened by one in a single team. Show it
  // rather than leave the menu pointing at something the list is not doing.
  const keys = offered.includes(sort.key) ? offered : [...offered, sort.key]

  return (
    <div className="flex items-center gap-1.5">
      <ArrowUpDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <NativeSelect
        aria-label={label}
        className="w-auto"
        value={sort.key}
        onChange={e => {
          // A newly chosen key starts at the end that makes sense for it —
          // "แก้ไขล่าสุด" means what was touched today, not the oldest edit
          // in the bank.
          const key = e.target.value as QuestionSortKey
          onChange({ key, dir: QUESTION_SORTS[key].defaultDir })
        }}
      >
        {keys.map(key => (
          <option key={key} value={key}>{QUESTION_SORTS[key].label}</option>
        ))}
      </NativeSelect>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        aria-label={`ลำดับ ${spec.dirLabel[sort.dir]} — กดเพื่อสลับเป็น ${spec.dirLabel[flipped]}`}
        onClick={() => onChange({ key: sort.key, dir: flipped })}
      >
        {spec.dirLabel[sort.dir]}
      </Button>
    </div>
  )
}
