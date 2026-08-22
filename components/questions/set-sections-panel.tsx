'use client'

import { useState } from 'react'
import {
  Plus, ChevronDown, ChevronRight, ChevronUp, MoreVertical,
  FolderOpen, X, Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { questionExcerpt } from '@/lib/question-display'
import {
  moveQuestionToSection, moveQuestionWithinGroup, moveSection,
  newSectionId, normalizeSetSections, ungroupedQuestionIds,
  type QuestionSetSection,
} from '@/lib/question-set-sections'

export interface PanelQuestion {
  id: string
  title: string
  question_text?: string | null
}

interface Props {
  /** Every question the picker knows about — used for titles only. */
  questions: PanelQuestion[]
  questionIds: string[]
  sections: QuestionSetSection[]
  /** The section new picks land in. null = ยังไม่ได้จัดหัวข้อ. */
  activeSectionId: string | null
  onActiveSectionChange: (id: string | null) => void
  onChange: (next: { questionIds: string[]; sections: QuestionSetSection[] }) => void
}

/**
 * The right-hand "แฟ้มนี้" panel of the set editor: what's in the แฟ้ม, in
 * what order, under which หัวข้อ. Picking questions still happens in the
 * QuestionPicker on the left — this panel only arranges what was picked.
 *
 * Reordering is buttons, not drag-and-drop: teachers arrange sets on phones
 * too, and a drag target that small is unusable there.
 */
export function SetSectionsPanel({
  questions, questionIds, sections, activeSectionId, onActiveSectionChange, onChange,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [renamingId, setRenamingId] = useState<string | null>(null)

  const byId = new Map(questions.map(q => [q.id, q]))
  const loose = ungroupedQuestionIds(sections, questionIds)
  const hasSections = sections.length > 0

  function apply(next: { sections: QuestionSetSection[]; question_ids: string[] }) {
    onChange({ sections: next.sections, questionIds: next.question_ids })
  }

  function addSection() {
    const section = { id: newSectionId(), title: '', question_ids: [] }
    apply(normalizeSetSections([...sections, section], questionIds))
    onActiveSectionChange(section.id)
    setRenamingId(section.id)
  }

  function renameSection(id: string, title: string) {
    apply(normalizeSetSections(sections.map(s => (s.id === id ? { ...s, title } : s)), questionIds))
  }

  /** Questions survive — they fall back to ยังไม่ได้จัดหัวข้อ. Deleting a
   *  heading should never quietly delete a teacher's work. */
  function deleteSection(id: string) {
    apply(normalizeSetSections(sections.filter(s => s.id !== id), questionIds))
    if (activeSectionId === id) onActiveSectionChange(null)
  }

  function removeQuestion(id: string) {
    const nextIds = questionIds.filter(qid => qid !== id)
    apply(normalizeSetSections(sections, nextIds))
  }

  const totalLabel = hasSections
    ? `${sections.length} หัวข้อ · ${questionIds.length} ข้อ`
    : `${questionIds.length} ข้อ`

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-primary shrink-0" />
          <h2 className="font-semibold text-foreground truncate">โจทย์ในแฟ้มนี้</h2>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{totalLabel}</span>
        </div>
        <Button type="button" variant="ghost" size="xs" onClick={addSection} className="gap-1 shrink-0">
          <Plus className="w-3.5 h-3.5" /> เพิ่มหัวข้อ
        </Button>
      </div>

      {questionIds.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          ยังไม่ได้เลือกโจทย์ — เลือกจากคลังทางซ้าย
        </p>
      ) : (
        <div className="space-y-2">
          {sections.map((section, index) => {
            const isCollapsed = collapsed[section.id]
            const isActive = activeSectionId === section.id
            return (
              <div
                key={section.id}
                className={cn(
                  'rounded-xl border transition-colors',
                  isActive ? 'border-primary/40 bg-primary/[0.04]' : 'border-border'
                )}
              >
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <IconButton
                    label={isCollapsed ? 'ขยายหัวข้อ' : 'ยุบหัวข้อ'}
                    size="2xs"
                    onClick={() => setCollapsed(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                  >
                    {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </IconButton>

                  {renamingId === section.id ? (
                    <Input
                      autoFocus
                      value={section.title}
                      onChange={e => renameSection(section.id, e.target.value)}
                      onBlur={() => setRenamingId(null)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === 'Escape') setRenamingId(null)
                      }}
                      placeholder="ชื่อหัวข้อ เช่น โปรเจกไทล์"
                      className="h-7 text-sm"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onActiveSectionChange(isActive ? null : section.id)}
                      onDoubleClick={() => setRenamingId(section.id)}
                      className="flex-1 min-w-0 text-left text-sm font-medium text-foreground truncate"
                      title="คลิกเพื่อเพิ่มโจทย์ที่เลือกเข้าหัวข้อนี้ · ดับเบิลคลิกเพื่อเปลี่ยนชื่อ"
                    >
                      {section.title || <span className="text-muted-foreground">หัวข้อที่ยังไม่ตั้งชื่อ</span>}
                    </button>
                  )}

                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {section.question_ids.length} ข้อ
                  </span>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-2xs" aria-label="ตัวเลือกหัวข้อ" />}
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setRenamingId(section.id)}>เปลี่ยนชื่อหัวข้อ</DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={index === 0}
                        onClick={() => apply(moveSection(sections, section.id, -1, questionIds))}
                      >
                        ย้ายหัวข้อขึ้น
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={index === sections.length - 1}
                        onClick={() => apply(moveSection(sections, section.id, 1, questionIds))}
                      >
                        ย้ายหัวข้อลง
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => deleteSection(section.id)}>
                        ลบหัวข้อ (โจทย์ยังอยู่ในแฟ้ม)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {!isCollapsed && (
                  <QuestionRows
                    ids={section.question_ids}
                    byId={byId}
                    sections={sections}
                    questionIds={questionIds}
                    currentSectionId={section.id}
                    onApply={apply}
                    onRemove={removeQuestion}
                    emptyText={isActive
                      ? 'ติ๊กโจทย์จากคลังทางซ้าย แล้วโจทย์จะเข้าหัวข้อนี้'
                      : 'ยังไม่มีโจทย์ในหัวข้อนี้'}
                  />
                )}
              </div>
            )
          })}

          {(loose.length > 0 || !hasSections) && (
            <div className={cn('rounded-xl', hasSections && 'border border-dashed border-border')}>
              {hasSections && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => onActiveSectionChange(null)}
                  className={cn(
                    'w-full justify-start gap-1.5 font-medium',
                    activeSectionId === null ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  ยังไม่ได้จัดหัวข้อ
                  <span className="text-[11px] font-normal ml-auto">{loose.length} ข้อ</span>
                </Button>
              )}
              <QuestionRows
                ids={loose}
                byId={byId}
                sections={sections}
                questionIds={questionIds}
                currentSectionId={null}
                onApply={apply}
                onRemove={removeQuestion}
                emptyText="ทุกข้อถูกจัดเข้าหัวข้อแล้ว"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function QuestionRows({
  ids, byId, sections, questionIds, currentSectionId, onApply, onRemove, emptyText,
}: {
  ids: string[]
  byId: Map<string, PanelQuestion>
  sections: QuestionSetSection[]
  questionIds: string[]
  currentSectionId: string | null
  onApply: (next: { sections: QuestionSetSection[]; question_ids: string[] }) => void
  onRemove: (id: string) => void
  emptyText: string
}) {
  if (ids.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">{emptyText}</p>
  }

  return (
    <ul className="pb-1">
      {ids.map((id, index) => {
        const question = byId.get(id)
        // A question deleted from the bank after the set was saved: shown
        // rather than hidden, so the teacher can see why the count differs.
        const label = question
          ? (question.title || questionExcerpt(question.question_text) || 'ไม่มีชื่อ')
          : 'โจทย์นี้ถูกลบไปแล้ว'
        // Position within the whole แฟ้ม — the number the student will see.
        const displayNumber = questionIds.indexOf(id) + 1

        return (
          <li key={id} className="group flex items-center gap-1 pl-3 pr-1.5 py-1 hover:bg-muted/50 rounded-lg">
            <span className="text-[11px] text-muted-foreground w-5 shrink-0 tabular-nums">{displayNumber}.</span>
            <span className={cn('flex-1 min-w-0 text-xs truncate', question ? 'text-foreground' : 'text-destructive')}>
              {label}
            </span>

            <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <IconButton
                label="ย้ายขึ้น"
                size="2xs"
                disabled={index === 0}
                onClick={() => onApply(moveQuestionWithinGroup(sections, questionIds, id, -1))}
              >
                <ChevronUp className="w-3 h-3" />
              </IconButton>
              <IconButton
                label="ย้ายลง"
                size="2xs"
                disabled={index === ids.length - 1}
                onClick={() => onApply(moveQuestionWithinGroup(sections, questionIds, id, 1))}
              >
                <ChevronDown className="w-3 h-3" />
              </IconButton>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon-2xs" aria-label="ตัวเลือกโจทย์" />}
                >
                  <MoreVertical className="w-3 h-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>ย้ายไปหัวข้อ</DropdownMenuLabel>
                    {sections.map(s => (
                      <DropdownMenuItem
                        key={s.id}
                        disabled={s.id === currentSectionId}
                        onClick={() => onApply(moveQuestionToSection(sections, questionIds, id, s.id))}
                      >
                        {s.title || 'หัวข้อที่ยังไม่ตั้งชื่อ'}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem
                      disabled={currentSectionId === null}
                      onClick={() => onApply(moveQuestionToSection(sections, questionIds, id, null))}
                    >
                      ยังไม่ได้จัดหัวข้อ
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => onRemove(id)}>
                    เอาออกจากแฟ้ม
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <IconButton
              label="เอาออกจากแฟ้ม"
              size="2xs"
              className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
              onClick={() => onRemove(id)}
            >
              <X className="w-3 h-3" />
            </IconButton>
          </li>
        )
      })}
    </ul>
  )
}
