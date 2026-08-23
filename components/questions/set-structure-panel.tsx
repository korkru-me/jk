'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Plus, ChevronUp, ChevronDown, MoreVertical, Folder, FolderOpen, X, Layers, Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { questionExcerpt } from '@/lib/question-display'
import {
  moveQuestionInSet, moveSection, newSectionId, normalizeSetSections,
  removeQuestionsFromSet, sectionsByQuestionId, ungroupedQuestionIds,
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
  onChange: (next: { questionIds: string[]; sections: QuestionSetSection[] }) => void
  /** Opens the คลังโจทย์ picker. It only ever adds to the แฟ้ม itself. */
  onAddQuestions: () => void
}

const UNNAMED = 'แฟ้มย่อยที่ยังไม่ตั้งชื่อ'
/** Sentinel for the แฟ้มย่อย dialog opened to create one, not edit one. */
const NEW_SECTION = 'new'

/** The title shown for a question, or a marker when the bank no longer has it. */
function questionLabel(q: PanelQuestion | undefined): string {
  if (!q) return 'โจทย์นี้ถูกลบไปแล้ว'
  return q.title || questionExcerpt(q.question_text) || 'ไม่มีชื่อ'
}

/** "ก, ข และอีก 3 ข้อ" — enough to recognise what is about to go. */
function namesPreview(ids: readonly string[], byId: Map<string, PanelQuestion>): string {
  const shown = ids.slice(0, 2).map(id => `“${questionLabel(byId.get(id))}”`)
  const rest = ids.length - shown.length
  return rest > 0 ? `${shown.join(' · ')} และอีก ${rest} ข้อ` : shown.join(' · ')
}

/**
 * The แฟ้มโจทย์ editor's structure, split so each surface does one job:
 *
 * - the แฟ้มย่อย cards open a dialog that manages *membership* of that
 *   แฟ้มย่อย, choosing only from questions the แฟ้ม already holds
 * - the list underneath is the whole แฟ้ม: add from the bank, take out, reorder
 *
 * Both dialogs stage their changes and apply them on an explicit ยืนยัน, and
 * every removal asks first. A แฟ้ม can hold thousands of questions, and a
 * stray click used to drop one instantly — leaving the teacher to work out
 * which one vanished and hunt it down in the bank again.
 *
 * Reordering is buttons, not drag-and-drop: teachers arrange sets on phones
 * too, and a drag target that small is unusable there.
 */
export function SetStructurePanel({ questions, questionIds, sections, onChange, onAddQuestions }: Props) {
  // The แฟ้มย่อย whose dialog is open — an id, or NEW_SECTION while creating.
  const [dialogSectionId, setDialogSectionId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  // Pending confirmations.
  const [removeIds, setRemoveIds] = useState<string[] | null>(null)
  const [deleteSectionId, setDeleteSectionId] = useState<string | null>(null)

  const byId = useMemo(() => new Map(questions.map(q => [q.id, q])), [questions])
  const owners = useMemo(() => sectionsByQuestionId(sections), [sections])
  const loose = ungroupedQuestionIds(sections, questionIds)
  const grouped = questionIds.length - loose.length
  const isNewSection = dialogSectionId === NEW_SECTION
  const dialogSection = isNewSection ? null : sections.find(s => s.id === dialogSectionId) ?? null
  const sectionToDelete = sections.find(s => s.id === deleteSectionId) ?? null

  function apply(next: { sections: QuestionSetSection[]; question_ids: string[] }) {
    onChange({ sections: next.sections, questionIds: next.question_ids })
  }

  /** Nothing exists until the dialog is confirmed — cancelling leaves no
   *  half-made แฟ้มย่อย behind. */
  function applySectionDraft(title: string, memberIds: string[]) {
    const ordered = questionIds.filter(id => memberIds.includes(id))
    if (isNewSection) {
      const section = { id: newSectionId(), title, question_ids: ordered }
      apply(normalizeSetSections([...sections, section], questionIds))
      toast.success(`สร้างแฟ้มย่อย “${title || UNNAMED}” แล้ว — อย่าลืมกดบันทึกการแก้ไข`)
    } else if (dialogSectionId) {
      apply(normalizeSetSections(
        sections.map(s => (s.id === dialogSectionId ? { ...s, title, question_ids: ordered } : s)),
        questionIds
      ))
      toast.success('บันทึกแฟ้มย่อยแล้ว — อย่าลืมกดบันทึกการแก้ไข')
    }
    setDialogSectionId(null)
  }

  /** Questions survive — they fall back to the แฟ้ม itself. Deleting a
   *  แฟ้มย่อย should never quietly delete a teacher's work. */
  function deleteSection(id: string) {
    const name = sections.find(s => s.id === id)?.title || UNNAMED
    apply(normalizeSetSections(sections.filter(s => s.id !== id), questionIds))
    if (dialogSectionId === id) setDialogSectionId(null)
    toast.success(`ลบแฟ้มย่อย “${name}” แล้ว โจทย์ยังอยู่ในแฟ้ม`)
  }

  function toggleSelected(id: string) {
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  function removeQuestions(ids: string[]) {
    apply(removeQuestionsFromSet(sections, questionIds, ids))
    setSelected(prev => prev.filter(id => !ids.includes(id)))
    toast.success(`เอาออกจากแฟ้ม ${ids.length} ข้อแล้ว — อย่าลืมกดบันทึกการแก้ไข`)
  }

  const allSelected = questionIds.length > 0 && questionIds.every(id => selected.includes(id))

  return (
    <div className="space-y-4">
      {/* ── แฟ้มย่อย ─────────────────────────────────────────────── */}
      <Card padding="xl" className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <Folder className="w-4 h-4 text-primary shrink-0" />
            <h2 className="font-semibold text-foreground whitespace-nowrap">แฟ้มย่อย</h2>
            {sections.length > 0 && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {sections.length} แฟ้มย่อย · {grouped} ข้อ
              </span>
            )}
          </div>
          {sections.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDialogSectionId(NEW_SECTION)}
              className="gap-1.5 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> สร้างแฟ้มย่อย
            </Button>
          )}
        </div>

        {sections.length === 0 ? (
          <Card edge="dashed" padding="lg" className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              ยังไม่มีแฟ้มย่อย — ถ้าแฟ้มนี้มีหลายเรื่อง แบ่งโจทย์เป็นแฟ้มย่อยได้ (ไม่บังคับ)
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDialogSectionId(NEW_SECTION)}
              className="gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> สร้างแฟ้มย่อย
            </Button>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {sections.map((section, index) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  index={index}
                  total={sections.length}
                  byId={byId}
                  onOpen={() => setDialogSectionId(section.id)}
                  onMove={delta => apply(moveSection(sections, section.id, delta, questionIds))}
                  onDelete={() => setDeleteSectionId(section.id)}
                />
              ))}

              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialogSectionId(NEW_SECTION)}
                className="h-auto min-h-[168px] flex-col gap-2 rounded-2xl border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/[0.03]"
              >
                <Plus className="w-5 h-5" />
                <span className="text-sm font-medium">สร้างแฟ้มย่อย</span>
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              โจทย์ข้อเดียวอยู่ได้หลายแฟ้มย่อย · ลำดับเลขข้อที่นักเรียนเห็นมาจากรายการโจทย์ด้านล่าง ไม่ใช่ลำดับแฟ้มย่อย
            </p>
          </>
        )}
      </Card>

      {/* ── โจทย์ทั้งหมดในแฟ้ม ───────────────────────────────────── */}
      <Card padding="xl" className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <Layers className="w-4 h-4 text-primary shrink-0" />
            <h2 className="font-semibold text-foreground whitespace-nowrap">โจทย์ในแฟ้มนี้</h2>
            <span className="text-xs text-muted-foreground whitespace-nowrap">{questionIds.length} ข้อ</span>
          </div>
          <Button type="button" size="sm" onClick={onAddQuestions} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> เพิ่มโจทย์จากคลัง
          </Button>
        </div>

        {questionIds.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            ยังไม่มีโจทย์ในแฟ้มนี้ — กด “เพิ่มโจทย์จากคลัง” เพื่อเลือกโจทย์เข้ามา
          </p>
        ) : (
          <>
            <label className="flex items-center gap-2 text-xs text-muted-foreground px-1">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? [] : [...questionIds])}
                className="accent-primary"
              />
              เลือกทั้งหมด
            </label>

            <ul className="space-y-0.5">
              {questionIds.map((id, index) => {
                const inSections = owners.get(id) ?? []
                const label = questionLabel(byId.get(id))
                const isSelected = selected.includes(id)

                return (
                  <li
                    key={id}
                    className={cn(
                      'group flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-lg transition-colors',
                      isSelected ? 'bg-primary/[0.06]' : 'hover:bg-muted/50'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelected(id)}
                      aria-label={`เลือก ${label}`}
                      className="accent-primary shrink-0"
                    />
                    <span className="text-xs text-muted-foreground w-6 shrink-0 tabular-nums">{index + 1}.</span>
                    <span className={cn('flex-1 min-w-0 text-sm truncate', byId.has(id) ? 'text-foreground' : 'text-destructive')}>
                      {label}
                    </span>

                    {inSections.length > 0 && (
                      <span className="hidden sm:flex items-center gap-1 shrink-0">
                        {inSections.slice(0, 2).map(sec => (
                          <span
                            key={sec.id}
                            className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary whitespace-nowrap max-w-[8rem] truncate"
                          >
                            {sec.title || UNNAMED}
                          </span>
                        ))}
                        {inSections.length > 2 && (
                          <span className="text-[11px] text-muted-foreground">+{inSections.length - 2}</span>
                        )}
                      </span>
                    )}

                    {/* Hover-to-reveal only from sm up: on a phone there is no
                        hover, so controls that hide would be unreachable. */}
                    <div className="flex items-center shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                      <IconButton
                        label="ย้ายขึ้น"
                        size="2xs"
                        disabled={index === 0}
                        onClick={() => apply(moveQuestionInSet(sections, questionIds, id, -1))}
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </IconButton>
                      <IconButton
                        label="ย้ายลง"
                        size="2xs"
                        disabled={index === questionIds.length - 1}
                        onClick={() => apply(moveQuestionInSet(sections, questionIds, id, 1))}
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </IconButton>
                      <IconButton
                        label="เอาออกจากแฟ้ม"
                        size="2xs"
                        className="hover:text-destructive"
                        onClick={() => setRemoveIds([id])}
                      >
                        <X className="w-3.5 h-3.5" />
                      </IconButton>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {selected.length > 0 && (
          <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-3 border-t border-border bg-muted/80 backdrop-blur-sm rounded-b-2xl flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">เลือก {selected.length} ข้อ</span>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <Button type="button" variant="destructive" size="sm" onClick={() => setRemoveIds(selected)}>
                เอาออกจากแฟ้ม
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>
                ยกเลิก
              </Button>
            </div>
          </div>
        )}
      </Card>

      <SectionDialog
        open={dialogSectionId !== null}
        isNew={isNewSection}
        section={dialogSection}
        sections={sections}
        questionIds={questionIds}
        byId={byId}
        onCancel={() => setDialogSectionId(null)}
        onConfirm={applySectionDraft}
      />

      <ConfirmDialog
        open={removeIds !== null}
        onOpenChange={open => { if (!open) setRemoveIds(null) }}
        title={removeIds && removeIds.length > 1 ? `เอาโจทย์ ${removeIds.length} ข้อออกจากแฟ้ม?` : 'เอาโจทย์ออกจากแฟ้ม?'}
        description={
          <span className="space-y-2 block">
            <span className="block">{removeIds ? namesPreview(removeIds, byId) : ''}</span>
            <span className="block">จะหายจากแฟ้มนี้และจากแฟ้มย่อยที่เคยอยู่ — โจทย์ยังอยู่ในคลังโจทย์ ไม่ได้ถูกลบถาวร</span>
          </span>
        }
        confirmLabel={removeIds && removeIds.length > 1 ? `เอาออก ${removeIds.length} ข้อ` : 'เอาออกจากแฟ้ม'}
        variant="destructive"
        onConfirm={() => removeIds && removeQuestions(removeIds)}
      />

      <ConfirmDialog
        open={deleteSectionId !== null}
        onOpenChange={open => { if (!open) setDeleteSectionId(null) }}
        title={`ลบแฟ้มย่อย “${sectionToDelete?.title || UNNAMED}”?`}
        description={
          sectionToDelete?.question_ids.length
            ? `โจทย์ ${sectionToDelete.question_ids.length} ข้อในแฟ้มย่อยนี้จะกลับไปอยู่ในแฟ้มหลัก ไม่ได้ถูกเอาออกจากแฟ้ม`
            : 'แฟ้มย่อยนี้ยังไม่มีโจทย์อยู่'
        }
        confirmLabel="ลบแฟ้มย่อย"
        variant="destructive"
        onConfirm={() => deleteSectionId && deleteSection(deleteSectionId)}
      />
    </div>
  )
}

function SectionCard({
  section, index, total, byId, onOpen, onMove, onDelete,
}: {
  section: QuestionSetSection
  index: number
  total: number
  byId: Map<string, PanelQuestion>
  onOpen: () => void
  onMove: (delta: number) => void
  onDelete: () => void
}) {
  const preview = section.question_ids.slice(0, 2).map(id => questionLabel(byId.get(id)))

  return (
    <Card
      edge="ring"
      padding="md"
      className="group relative flex flex-col gap-3 min-h-[168px] transition-colors hover:ring-primary/30"
    >
      {/* The whole card opens the แฟ้มย่อย. It is laid over the content, not
          wrapped around it, so the ⋮ menu keeps its own clicks (z-10). */}
      <Button
        type="button"
        variant="ghost"
        onClick={onOpen}
        aria-label={`เปิดแฟ้มย่อย ${section.title || UNNAMED}`}
        className="absolute inset-0 h-auto rounded-2xl hover:bg-transparent"
      />

      <div className="flex items-start justify-between gap-2">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Folder className="w-4 h-4 text-primary" />
        </div>
        <div className="relative z-10">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="ตัวเลือกแฟ้มย่อย" />}>
              <MoreVertical className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={index === 0} onClick={() => onMove(-1)}>ย้ายไปก่อนหน้า</DropdownMenuItem>
              <DropdownMenuItem disabled={index === total - 1} onClick={() => onMove(1)}>ย้ายไปถัดไป</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                ลบแฟ้มย่อย (โจทย์ยังอยู่ในแฟ้ม)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground text-sm truncate transition-colors group-hover:text-primary">
          {section.title || <span className="text-muted-foreground font-medium">{UNNAMED}</span>}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{section.question_ids.length} ข้อ</p>

        {preview.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {preview.map((text, i) => (
              <li key={i} className="text-[11px] text-muted-foreground truncate">• {text}</li>
            ))}
            {section.question_ids.length > preview.length && (
              <li className="text-[11px] text-muted-foreground">
                + อีก {section.question_ids.length - preview.length} ข้อ
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="relative z-10 pt-2 border-t border-border">
        <Button type="button" variant="outline" size="sm" onClick={onOpen} className="w-full gap-1.5">
          <FolderOpen className="w-3.5 h-3.5" /> เปิดแฟ้มย่อย
        </Button>
      </div>
    </Card>
  )
}

/**
 * Managing one แฟ้มย่อย: its name, and which of the แฟ้ม's questions belong to
 * it. Deliberately cannot reach the คลัง — a question has to be in the แฟ้ม
 * before it can be filed, which keeps "อยู่ในแฟ้ม" and "อยู่ในแฟ้มย่อย" from
 * being two ways of adding the same thing.
 *
 * Everything here is a draft until ยืนยัน, including the name and, when
 * creating, the แฟ้มย่อย itself.
 */
function SectionDialog({
  open, isNew, section, sections, questionIds, byId, onCancel, onConfirm,
}: {
  open: boolean
  isNew: boolean
  section: QuestionSetSection | null
  sections: QuestionSetSection[]
  questionIds: string[]
  byId: Map<string, PanelQuestion>
  onCancel: () => void
  onConfirm: (title: string, memberIds: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftIds, setDraftIds] = useState<string[]>([])

  const baselineTitle = section?.title ?? ''
  const baselineIds = useMemo(() => section?.question_ids ?? [], [section])

  // Reset the draft each time the dialog opens on a different แฟ้มย่อย.
  useEffect(() => {
    if (!open) return
    setDraftTitle(section?.title ?? '')
    setDraftIds(section?.question_ids ?? [])
    setSearch('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, section?.id])

  const owners = useMemo(() => sectionsByQuestionId(sections), [sections])

  const added = draftIds.filter(id => !baselineIds.includes(id))
  const removed = baselineIds.filter(id => !draftIds.includes(id))
  const titleChanged = draftTitle.trim() !== baselineTitle
  const canConfirm = isNew || added.length > 0 || removed.length > 0 || titleChanged

  const term = search.trim().toLowerCase()
  const visibleIds = term
    ? questionIds.filter(id => questionLabel(byId.get(id)).toLowerCase().includes(term))
    : questionIds

  function toggle(id: string) {
    setDraftIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-primary" /> {isNew ? 'สร้างแฟ้มย่อย' : 'แก้ไขแฟ้มย่อย'}
          </DialogTitle>
          <DialogDescription>
            ติ๊กโจทย์ที่ต้องการให้อยู่ในแฟ้มย่อยนี้ — เลือกได้เฉพาะโจทย์ที่อยู่ในแฟ้มนี้แล้ว และยังไม่มีอะไรเปลี่ยนจนกว่าจะกดยืนยัน
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="section-title">ชื่อแฟ้มย่อย</Label>
          <Input
            id="section-title"
            autoFocus={isNew}
            value={draftTitle}
            onChange={e => setDraftTitle(e.target.value)}
            placeholder="เช่น โปรเจกไทล์"
          />
        </div>

        <div className="space-y-2 min-w-0">
          <p className="text-sm font-medium text-foreground">
            โจทย์ในแฟ้มย่อยนี้{' '}
            <span className="text-xs font-normal text-muted-foreground">
              {draftIds.length} จาก {questionIds.length} ข้อในแฟ้ม
            </span>
          </p>

          {questionIds.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              ยังไม่มีโจทย์ในแฟ้มนี้ — ปิดหน้าต่างนี้แล้วกด “เพิ่มโจทย์จากคลัง” ก่อน
            </p>
          ) : (
            <>
              {questionIds.length > 8 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="ค้นหาโจทย์ในแฟ้มนี้..."
                    className="pl-9"
                  />
                </div>
              )}

              {visibleIds.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">ไม่พบโจทย์ที่ตรงกัน</p>
              ) : (
                <ul className="max-h-72 overflow-y-auto space-y-1 pr-1 min-w-0">
                  {visibleIds.map(id => {
                    const isMember = draftIds.includes(id)
                    const wasMember = baselineIds.includes(id)
                    const pending = isMember && !wasMember ? 'add' : !isMember && wasMember ? 'remove' : null
                    const elsewhere = (owners.get(id) ?? []).filter(s => s.id !== section?.id)

                    return (
                      <li key={id} className="min-w-0">
                        <label
                          className={cn(
                            'flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors min-w-0',
                            pending === 'add' ? 'bg-success/10 border-success/30'
                              : pending === 'remove' ? 'bg-destructive/10 border-destructive/30'
                              : isMember ? 'bg-primary/10 border-primary/20'
                              : 'border-transparent hover:bg-muted'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isMember}
                            onChange={() => toggle(id)}
                            className="mt-0.5 accent-primary shrink-0"
                          />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm text-foreground truncate">
                              {questionLabel(byId.get(id))}
                            </span>
                            {pending ? (
                              <span className={cn(
                                'block text-[11px] font-medium mt-0.5',
                                pending === 'add' ? 'text-success' : 'text-destructive'
                              )}>
                                {pending === 'add' ? '+ จะเพิ่มเข้าแฟ้มย่อยนี้' : '− จะเอาออกจากแฟ้มย่อยนี้'}
                              </span>
                            ) : elsewhere.length > 0 ? (
                              <span className="block text-[11px] text-muted-foreground mt-0.5 truncate">
                                อยู่ใน {elsewhere.map(s => `“${s.title || UNNAMED}”`).join(' · ')} ด้วย
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        <DialogFooter className="min-w-0 sm:items-center sm:justify-between">
          <span className="text-sm min-w-0">
            {added.length === 0 && removed.length === 0 ? (
              <span className="text-muted-foreground">
                {isNew ? 'ตั้งชื่อแล้วติ๊กโจทย์ที่ต้องการ' : 'โจทย์ที่เอาออกจากแฟ้มย่อยจะยังอยู่ในแฟ้ม'}
              </span>
            ) : (
              <span className="flex items-center gap-2 flex-wrap">
                {added.length > 0 && <span className="text-success font-medium">+ เพิ่ม {added.length} ข้อ</span>}
                {removed.length > 0 && <span className="text-destructive font-medium">− เอาออก {removed.length} ข้อ</span>}
              </span>
            )}
          </span>
          <span className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>ยกเลิก</Button>
            <Button
              type="button"
              disabled={!canConfirm}
              onClick={() => onConfirm(draftTitle.trim(), draftIds)}
            >
              {isNew ? 'สร้างแฟ้มย่อย' : 'ยืนยันการเปลี่ยนแปลง'}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
