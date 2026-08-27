'use client'

import { Eye, FolderMinus, FolderPlus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DIFF_META, TYPE_LABEL, questionExcerpt } from '@/lib/question-display'
import { QuestionTagsEditor } from '../../_components/question-tags-editor'
import { SubQuestionCountBadge } from '../../_components/sub-question-count-badge'
import { QuestionSetBadges, type QuestionSetRef } from '@/components/questions/question-set-badges'
import type { UnfiledQuestion } from '../page'

/**
 * One โจทย์ in the browser, drawn as the คลังโจทย์ card it is.
 *
 * Deliberately a **reader's** copy of that card, not the card itself. The
 * คลังโจทย์ version carries the whole toolbox — แก้ไข, ลบ, ทำสำเนา, แชร์,
 * รายงานปัญหา, สวิตช์บังคับแนบรูปวิธีทำ — and a strip of item analysis under a
 * divider. None of that is what this page is for: here a teacher is deciding
 * which แฟ้ม a โจทย์ belongs in, and every other control is a way to lose that
 * train of thought (or the โจทย์). So the card keeps what identifies a โจทย์ —
 * the badges, the title, a line of its wording — and offers only the actions
 * that decision needs: look at it, file it, and (while reading one แฟ้ม) take
 * it back out.
 *
 * แท็ก stay editable. They are how a คลัง this size stays findable, and the
 * moment a teacher is reading through their โจทย์ one by one is exactly when a
 * missing แท็ก is obvious.
 */
export function LibraryQuestionCard({
  question: q, selected, onSelect, onPreview, onFile, onRemove, sets, showSetBadges,
  allTags, subQuestionCount, disabled,
}: {
  question: UnfiledQuestion
  selected: boolean
  onSelect: (selected: boolean) => void
  onPreview: () => void
  /** Opens the แฟ้ม picker for this one โจทย์. */
  onFile: () => void
  /** Takes it out of the แฟ้ม being browsed. Absent unless one is. */
  onRemove?: () => void
  /** Every แฟ้ม holding this question. */
  sets?: QuestionSetRef[]
  /** Off in the unfiled list, where the answer is always "none". */
  showSetBadges?: boolean
  /** Tags already in the คลัง, offered when adding one from this card. */
  allTags: string[]
  /** How many ข้อย่อย it holds; absent when the count could not be read. */
  subQuestionCount?: number
  disabled?: boolean
}) {
  const diff = DIFF_META[q.difficulty]
  // A โจทย์หลายขั้นตอน is listed by its parent row, which is the one at
  // position 0 of its group.
  const isGroup = q.order_in_group === 0 && !!q.group_id

  return (
    <Card
      edge="ring"
      className={cn(
        'group transition-all hover:shadow-sm',
        selected ? 'ring-primary/50' : 'hover:ring-primary/30',
      )}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Ticking is the whole reason several โจทย์ can be filed at once, so it
            sits where the eye starts rather than behind a menu. */}
        <input
          type="checkbox"
          checked={selected}
          onChange={event => onSelect(event.target.checked)}
          disabled={disabled}
          aria-label={`เลือก ${q.title}`}
          className="mt-1 accent-primary shrink-0"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            {isGroup && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">📚 หลายขั้นตอน</span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${diff?.badge}`}>
              {diff?.label}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {TYPE_LABEL[q.question_type] ?? q.question_type}
            </span>
            <SubQuestionCountBadge questionType={q.question_type} count={subQuestionCount} />
            {q.subject && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-tint-4/10 text-tint-4">
                {q.subject}
              </span>
            )}
            {q.question_categories?.name && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {q.question_categories.name}
              </span>
            )}
            {showSetBadges && <QuestionSetBadges sets={sets} />}
            <QuestionTagsEditor questionId={q.id} tags={q.tags ?? []} allTags={allTags} />
          </div>

          <button
            onClick={onPreview}
            className="text-sm font-semibold text-foreground hover:text-primary transition-colors text-left line-clamp-1 w-full"
          >
            {q.title}
          </button>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{questionExcerpt(q.question_text)}</p>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Button onClick={onPreview} size="sm" className="bg-primary/10 text-primary hover:bg-primary/20">
            <Eye /> ดูตัวอย่าง
          </Button>
          <Button onClick={onFile} size="sm" variant="outline" disabled={disabled} className="gap-1.5">
            <FolderPlus className="w-3.5 h-3.5" /> เพิ่มเข้าแฟ้ม
          </Button>
          {/* Only while reading one แฟ้ม: "ออกจากแฟ้มไหน" has no answer
              anywhere else, and this is where a misfiled โจทย์ is noticed. */}
          {onRemove && (
            <Button
              onClick={onRemove}
              size="sm"
              variant="ghost"
              disabled={disabled}
              className="gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <FolderMinus className="w-3.5 h-3.5" /> เอาออกจากแฟ้ม
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
