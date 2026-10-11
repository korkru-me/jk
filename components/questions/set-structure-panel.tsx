'use client'

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, ChevronUp, ChevronDown, MoreVertical, Folder, FolderOpen, FolderPlus,
  X, Layers, Search, Eye, Trash2, Check,
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
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { questionExcerpt } from '@/lib/question-display'
import {
  addQuestionsToSections, moveQuestionInSet, newSectionId, normalizeSetSections,
  removeQuestionsFromSet, sectionsByQuestionId, ungroupedQuestionIds,
  type QuestionSetSection,
} from '@/lib/question-set-sections'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import dynamic from 'next/dynamic'
import { getQuestionClientDetail } from '@/lib/actions/questions'
import { SetQuestionList, type SetListQuestion } from './set-question-list'
import { QuestionSectionBadges } from './question-section-badges'
import type { QuestionDetailWithCategory as PreviewQuestion } from './preview-modal'

const PreviewModal = dynamic(
  () => import('./preview-modal').then(mod => mod.PreviewModal),
  { ssr: false },
)
import type { QuestionCardData } from '@/lib/question-card-data'
import { DIFF_META, TYPE_LABEL } from '@/lib/question-display'

/**
 * A โจทย์ as this panel receives it.
 *
 * Wider than the titles the แฟ้มย่อย dialog used to need, because the list
 * below now draws the คลังโจทย์ card: ระดับ, ชนิด and แท็ก come straight from
 * the picker's own rows, and only what neither has — วิชา, หมวดหมู่, สถิติ —
 * is fetched per screenful. See SetQuestionList.
 */
export type PanelQuestion = SetListQuestion

interface Props {
  /** Every question the picker knows about. */
  questions: PanelQuestion[]
  questionIds: string[]
  sections: QuestionSetSection[]
  onChange: (next: { questionIds: string[]; sections: QuestionSetSection[] }) => void
  /** Opens the คลังโจทย์ picker. It only ever adds to the แฟ้ม itself. */
  onAddQuestions: () => void
  /** Tags across the คลัง, offered by the in-card tag editor. */
  allTags: string[]
  /** Teams a โจทย์ can be shared to from its card. */
  myTeams: { id: string; name: string }[]
  /** The แฟ้ม's id, absent while it is still being created. */
  setId?: string
  /** Flushes the แฟ้ม's newest autosave before leaving for the โจทย์ editor. */
  onSaveBeforeEdit?: () => Promise<boolean>
  /** Card data for the แฟ้ม's first page, fetched with the page. */
  initialCardData?: QuestionCardData
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
 * The whole แฟ้มย่อย card is sortable: mouse users drag after moving 8px,
 * touch users press briefly before dragging so a normal swipe still scrolls,
 * and keyboard users can use the sortable button's Space + arrow controls.
 */
export function SetStructurePanel({
  questions, questionIds, sections, onChange, onAddQuestions,
  allTags, myTeams, setId, onSaveBeforeEdit, initialCardData,
}: Props) {
  // The แฟ้มย่อย whose dialog is open — an id, or NEW_SECTION while creating.
  const [dialogSectionId, setDialogSectionId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [bulkSectionOpen, setBulkSectionOpen] = useState(false)
  // Pending confirmations.
  const [removeIds, setRemoveIds] = useState<string[] | null>(null)
  const [deleteSectionId, setDeleteSectionId] = useState<string | null>(null)
  const sectionDndId = useId()
  const sectionSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const byId = useMemo(() => new Map(questions.map(q => [q.id, q])), [questions])
  const owners = useMemo(() => sectionsByQuestionId(sections), [sections])
  const sectionTitlesById = useMemo(() => {
    const titles = new Map<string, string[]>()
    for (const [id, sectionsHere] of owners) {
      titles.set(id, sectionsHere.map(section => section.title || UNNAMED))
    }
    return titles
  }, [owners])
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
      toast.success(`สร้างแฟ้มย่อย “${title || UNNAMED}” และบันทึกแล้ว`)
    } else if (dialogSectionId) {
      apply(normalizeSetSections(
        sections.map(s => (s.id === dialogSectionId ? { ...s, title, question_ids: ordered } : s)),
        questionIds
      ))
      toast.success('บันทึกแฟ้มย่อยแล้ว')
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
    toast.success(`เอาออกจากแฟ้ม ${ids.length} ข้อและบันทึกแล้ว`)
  }

  function addSelectedToSections(sectionIds: string[]) {
    apply(addQuestionsToSections(sections, questionIds, selected, sectionIds))
    toast.success(`เพิ่มโจทย์ ${selected.length} ข้อเข้าแฟ้มย่อย ${sectionIds.length} แฟ้มและบันทึกแล้ว`)
    setSelected([])
    setBulkSectionOpen(false)
  }

  function reorderSections(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sections.findIndex(section => section.id === active.id)
    const newIndex = sections.findIndex(section => section.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    apply(normalizeSetSections(arrayMove(sections, oldIndex, newIndex), questionIds))
  }

  const allSelected = questionIds.length > 0 && questionIds.every(id => selected.includes(id))

  return (
    <div className="space-y-4">
      {/* ── แฟ้มย่อย ─────────────────────────────────────────────── */}
      <Card padding="lg" className="flex flex-col gap-2.5">
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
          <DndContext
            id={`question-set-sections-${sectionDndId}`}
            sensors={sectionSensors}
            collisionDetection={closestCenter}
            onDragEnd={reorderSections}
          >
            <SortableContext items={sections.map(section => section.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {sections.map(section => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    onOpen={() => setDialogSectionId(section.id)}
                    onDelete={() => setDeleteSectionId(section.id)}
                  />
                ))}

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDialogSectionId(NEW_SECTION)}
                  className="h-auto min-h-[62px] gap-2 rounded-2xl border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:bg-primary/[0.03] hover:text-primary"
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-sm font-medium">สร้างแฟ้มย่อย</span>
                </Button>
              </div>
            </SortableContext>
          </DndContext>
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
          <SetQuestionList
            byId={byId}
            questionIds={questionIds}
            sectionTitlesById={sectionTitlesById}
            selected={selected}
            onToggleSelected={toggleSelected}
            onSelectAll={all => setSelected(all ? [...questionIds] : [])}
            onMove={(id, delta) => apply(moveQuestionInSet(sections, questionIds, id, delta))}
            onRemove={ids => setRemoveIds(ids)}
            allTags={allTags}
            myTeams={myTeams}
            setId={setId}
            onSaveBeforeEdit={onSaveBeforeEdit}
            initialCardData={initialCardData}
          />
        )}

        {selected.length > 0 && (
          <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-3 border-t border-border bg-muted/80 backdrop-blur-sm rounded-b-2xl flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">เลือก {selected.length} ข้อ</span>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={sections.length === 0}
                title={sections.length === 0 ? 'สร้างแฟ้มย่อยก่อนจึงจะเพิ่มโจทย์ได้' : undefined}
                onClick={() => setBulkSectionOpen(true)}
              >
                <FolderPlus data-icon="inline-start" aria-hidden="true" />
                เพิ่มเข้าแฟ้มย่อย
              </Button>
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
        onDelete={dialogSection ? () => setDeleteSectionId(dialogSection.id) : undefined}
      />

      <BulkAddToSectionsDialog
        open={bulkSectionOpen}
        sections={sections}
        selectedQuestionIds={selected}
        onCancel={() => setBulkSectionOpen(false)}
        onConfirm={addSelectedToSections}
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

/**
 * Adds one bulk selection to one or more แฟ้มย่อย. This is intentionally an
 * add-only dialog: choosing another destination must not erase any labels the
 * selected questions already carry.
 */
function BulkAddToSectionsDialog({
  open, sections, selectedQuestionIds, onCancel, onConfirm,
}: {
  open: boolean
  sections: QuestionSetSection[]
  selectedQuestionIds: string[]
  onCancel: () => void
  onConfirm: (sectionIds: string[]) => void
}) {
  const [targetSectionIds, setTargetSectionIds] = useState<string[]>([])
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const selectedKey = selectedQuestionIds.join(',')

  useEffect(() => {
    if (!open) return
    setTargetSectionIds([])
    setConfirmingDiscard(false)
  }, [open, selectedKey])

  function requestClose() {
    if (targetSectionIds.length > 0) {
      setConfirmingDiscard(true)
      return
    }
    onCancel()
  }

  function discardDraft() {
    setConfirmingDiscard(false)
    setTargetSectionIds([])
    onCancel()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={nextOpen => { if (!nextOpen) requestClose() }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus aria-hidden="true" />
              เพิ่มโจทย์เข้าแฟ้มย่อย
            </DialogTitle>
            <DialogDescription>
              เลือกแฟ้มย่อยสำหรับโจทย์ {selectedQuestionIds.length} ข้อ เลือกได้มากกว่าหนึ่งแฟ้ม และโจทย์จะยังอยู่ในแฟ้มย่อยเดิม
            </DialogDescription>
          </DialogHeader>

          <ToggleGroup
            value={targetSectionIds}
            onValueChange={setTargetSectionIds}
            orientation="vertical"
            spacing={2}
            variant="outline"
            aria-label="เลือกแฟ้มย่อยที่จะเพิ่มโจทย์เข้าไป"
            className="w-full items-stretch"
          >
            {sections.map(section => {
              const alreadyCount = selectedQuestionIds.filter(id => section.question_ids.includes(id)).length
              const allAlreadyMembers = alreadyCount === selectedQuestionIds.length
              const remainingCount = selectedQuestionIds.length - alreadyCount
              const status = allAlreadyMembers
                ? 'อยู่ในแฟ้มย่อยนี้ครบแล้ว'
                : alreadyCount > 0
                  ? `อยู่แล้ว ${alreadyCount} ข้อ · จะเพิ่มอีก ${remainingCount} ข้อ`
                  : `จะเพิ่ม ${selectedQuestionIds.length} ข้อ`
              const active = targetSectionIds.includes(section.id)

              return (
                <ToggleGroupItem
                  key={section.id}
                  value={section.id}
                  disabled={allAlreadyMembers}
                  aria-label={`${section.title || UNNAMED} — ${status}`}
                  className="h-auto min-h-11 w-full min-w-0 justify-start whitespace-normal rounded-xl border border-border px-3 py-2.5 text-left aria-pressed:border-primary/30 aria-pressed:bg-primary/10 aria-pressed:text-foreground data-[state=on]:border-primary/30 data-[state=on]:bg-primary/10 data-[state=on]:text-foreground"
                >
                  <span className="flex w-full min-w-0 items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Folder aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {section.title || UNNAMED}
                      </span>
                      <span className="text-xs text-muted-foreground">{status}</span>
                    </span>
                    {active && <Check className="shrink-0 text-primary" aria-hidden="true" />}
                  </span>
                </ToggleGroupItem>
              )
            })}
          </ToggleGroup>

          <DialogFooter className="sm:items-center sm:justify-between">
            <span className="text-sm text-muted-foreground">
              {targetSectionIds.length > 0
                ? `เลือก ${targetSectionIds.length} แฟ้มย่อย`
                : 'เลือกอย่างน้อย 1 แฟ้มย่อย'}
            </span>
            <span className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={requestClose}>ยกเลิก</Button>
              <Button
                type="button"
                disabled={targetSectionIds.length === 0}
                onClick={() => onConfirm(targetSectionIds)}
              >
                ยืนยัน
              </Button>
            </span>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmingDiscard}
        onOpenChange={setConfirmingDiscard}
        title="ออกโดยไม่เพิ่มเข้าแฟ้มย่อย?"
        description="แฟ้มย่อยที่เลือกไว้ยังไม่ได้กด “ยืนยัน” หากออกตอนนี้ รายการที่เลือกครั้งนี้จะหายไป"
        confirmLabel="ออกโดยไม่บันทึก"
        cancelLabel="กลับไปเลือกต่อ"
        variant="destructive"
        onConfirm={discardDraft}
      />
    </>
  )
}

/**
 * One แฟ้มย่อย, as small as it can be and still be recognised.
 *
 * It used to print the first two โจทย์ inside it, which read well with three
 * แฟ้มย่อย and turned the page into a scroll with twenty. What a teacher needs
 * from this grid is "which แฟ้มย่อย exist and how big is each" — the โจทย์
 * themselves are one click away, in the dialog that can actually change them.
 */
function SectionCard({
  section, onOpen, onDelete,
}: {
  section: QuestionSetSection
  onOpen: () => void
  onDelete: () => void
}) {
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: section.id })

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      edge="ring"
      padding="sm"
      className={cn(
        'group relative flex items-center gap-2.5 transition-colors hover:ring-primary/30',
        isDragging && 'z-10 opacity-70 ring-primary/40',
      )}
    >
      {/* This transparent button is both the click target and the sortable
          activator, so every non-menu part of the card can be held and dragged. */}
      <Button
        ref={setActivatorNodeRef}
        type="button"
        variant="ghost"
        onClick={onOpen}
        aria-label={`เปิดแฟ้มย่อย ${section.title || UNNAMED}`}
        title="กดเพื่อเปิด หรือกดค้างแล้วลากเพื่อสลับตำแหน่ง"
        className="absolute inset-0 h-auto cursor-grab touch-manipulation rounded-2xl hover:bg-transparent active:cursor-grabbing"
        {...attributes}
        {...listeners}
      />

      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Folder className="w-4 h-4 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground text-sm truncate transition-colors group-hover:text-primary">
          {section.title || <span className="text-muted-foreground font-medium">{UNNAMED}</span>}
        </p>
        <p className="text-xs text-muted-foreground">{section.question_ids.length} ข้อ</p>
      </div>

      <div className="relative z-10 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="ตัวเลือกแฟ้มย่อย" />}>
            <MoreVertical className="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              ลบแฟ้มย่อย
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
  open, isNew, section, sections, questionIds, byId, onCancel, onConfirm, onDelete,
}: {
  open: boolean
  isNew: boolean
  section: QuestionSetSection | null
  sections: QuestionSetSection[]
  questionIds: string[]
  byId: Map<string, PanelQuestion>
  onCancel: () => void
  onConfirm: (title: string, memberIds: string[]) => void
  /** Existing แฟ้มย่อย only; deletion is confirmed by the parent dialog. */
  onDelete?: () => void
}) {
  const titleInputRef = useRef<HTMLInputElement>(null)
  const questionListRef = useRef<HTMLDivElement>(null)
  const bankRowRefs = useRef(new Map<string, HTMLLIElement>())
  const pendingAnchorRef = useRef<{ id: string; top: number } | null>(null)
  const [search, setSearch] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftIds, setDraftIds] = useState<string[]>([])
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [previewQ, setPreviewQ] = useState<PreviewQuestion | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null)

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
  // Closing a dialog should protect everything the teacher can see disappear,
  // including title whitespace that cannot be confirmed but may still be an
  // unfinished thought. Membership has no order of its own, so added/removed
  // is the exact dirty check for the ticks.
  const draftDirty = draftTitle !== baselineTitle || added.length > 0 || removed.length > 0
  const canConfirm = isNew || added.length > 0 || removed.length > 0 || titleChanged

  function requestClose() {
    if (draftDirty) {
      setConfirmingDiscard(true)
      return
    }
    onCancel()
  }

  function discardDraft() {
    setConfirmingDiscard(false)
    onCancel()
  }

  async function openPreview(id: string) {
    setPreviewLoadingId(id)
    const result = await getQuestionClientDetail(id)
    setPreviewLoadingId(null)
    if ('error' in result) return
    setPreviewQ(result.data as unknown as PreviewQuestion)
  }

  const term = search.trim().toLowerCase()
  const visibleIds = term
    ? questionIds.filter(id => questionLabel(byId.get(id)).toLowerCase().includes(term))
    : questionIds

  // Adding a review copy above the bank must not move the original row under
  // the teacher's pointer. Keep the bank row at the same visual Y position,
  // matching the behaviour of the shared คลังโจทย์ picker.
  useLayoutEffect(() => {
    const pendingAnchor = pendingAnchorRef.current
    const list = questionListRef.current
    const row = pendingAnchor ? bankRowRefs.current.get(pendingAnchor.id) : null
    if (pendingAnchor && list && row) {
      list.scrollTop += row.getBoundingClientRect().top - pendingAnchor.top
    }
    pendingAnchorRef.current = null
  }, [draftIds])

  function toggle(id: string) {
    setDraftIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  function toggleFromBank(id: string) {
    const row = bankRowRefs.current.get(id)
    if (row) pendingAnchorRef.current = { id, top: row.getBoundingClientRect().top }
    toggle(id)
  }

  function questionRow(id: string, location: 'selected' | 'bank') {
    const isMember = draftIds.includes(id)
    const wasMember = baselineIds.includes(id)
    const pending = isMember && !wasMember ? 'add' : !isMember && wasMember ? 'remove' : null
    const ownerTitles = (owners.get(id) ?? []).map(owner => owner.title || UNNAMED)
    const q = byId.get(id)

    return (
      <div
        className={cn(
          'flex items-start gap-3 p-2.5 rounded-xl border transition-colors min-w-0',
          pending === 'add' ? 'bg-success/10 border-success/30'
            : pending === 'remove' ? 'bg-destructive/10 border-destructive/30'
            : isMember ? 'bg-primary/10 border-primary/20'
            : 'border-transparent hover:bg-muted'
        )}
      >
        {/* Ticking is still the whole row, so the target stays large. The
            preview control sits outside the label and never toggles it. */}
        <label className="flex flex-1 items-start gap-3 min-w-0 cursor-pointer">
          <input
            type="checkbox"
            checked={isMember}
            onChange={() => location === 'bank' ? toggleFromBank(id) : toggle(id)}
            aria-label={`${isMember ? 'เอาออกจาก' : 'เพิ่มเข้า'}แฟ้มย่อย ${questionLabel(q)}${location === 'selected' ? ' จากกลุ่มโจทย์ในแฟ้มย่อยนี้' : ''}`}
            className="mt-0.5 accent-primary shrink-0"
          />
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-1.5 flex-wrap mb-0.5">
              {q && (
                <>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${DIFF_META[q.difficulty]?.badge}`}>
                    {DIFF_META[q.difficulty]?.label}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {TYPE_LABEL[q.question_type] ?? q.question_type}
                  </span>
                </>
              )}
            </span>
            <span className="block text-sm text-foreground truncate">
              {questionLabel(q)}
            </span>
            {pending === 'remove' && (
              <span className="block text-[11px] font-medium mt-0.5 text-destructive">
                − จะเอาออกจากแฟ้มย่อยนี้
              </span>
            )}
            <QuestionSectionBadges
              titles={ownerTitles}
              showEmpty
              className="mt-1"
            />
          </span>
        </label>

        <IconButton
          label={`ดูตัวอย่างโจทย์ ${questionLabel(q)}`}
          size="2xs"
          disabled={!q}
          onClick={() => void openPreview(id)}
          className="shrink-0"
        >
          <Eye className="w-3.5 h-3.5" />
        </IconButton>
      </div>
    )
  }

  return (
    <>
    <Dialog open={open} onOpenChange={o => { if (!o) requestClose() }}>
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
            ref={titleInputRef}
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
            <div ref={questionListRef} className="max-h-72 overflow-y-auto space-y-2 pr-1 min-w-0">
              {draftIds.length > 0 && (
                <div className="space-y-1 min-w-0">
                  <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    อยู่ในแฟ้มย่อยนี้ ({draftIds.length} ข้อ)
                  </p>
                  <ul className="space-y-1 min-w-0">
                    {draftIds.map(id => (
                      <li key={`selected-${id}`} className="min-w-0">
                        {questionRow(id, 'selected')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {questionIds.length > 8 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="ค้นหาโจทย์ในแฟ้มนี้..."
                    aria-label="ค้นหาโจทย์ทั้งหมดในแฟ้มนี้"
                    className="pl-9"
                  />
                </div>
              )}

              <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                โจทย์ทั้งหมด{term ? ` (${visibleIds.length} ข้อที่พบ)` : ''}
              </p>
              {visibleIds.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">ไม่พบโจทย์ที่ตรงกัน</p>
              ) : (
                <ul className="space-y-1 min-w-0">
                  {visibleIds.map(id => (
                    <li
                      key={`bank-${id}`}
                      ref={node => {
                        if (node) bankRowRefs.current.set(id, node)
                        else bankRowRefs.current.delete(id)
                      }}
                      className="min-w-0"
                    >
                      {questionRow(id, 'bank')}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="min-w-0 sm:items-center sm:justify-between">
          <span className="flex items-center gap-2 text-sm min-w-0 flex-wrap">
            {!isNew && onDelete && (
              <Button type="button" variant="destructive" onClick={onDelete}>
                <Trash2 data-icon="inline-start" aria-hidden="true" />
                ลบแฟ้มย่อย
              </Button>
            )}
            {added.length === 0 && removed.length === 0 ? (
              isNew && <span className="text-muted-foreground">ตั้งชื่อแล้วติ๊กโจทย์ที่ต้องการ</span>
            ) : (
              <span className="flex items-center gap-2 flex-wrap">
                {added.length > 0 && <span className="text-success font-medium">+ เพิ่ม {added.length} ข้อ</span>}
                {removed.length > 0 && <span className="text-destructive font-medium">− เอาออก {removed.length} ข้อ</span>}
              </span>
            )}
          </span>
          <span className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={requestClose}>ยกเลิก</Button>
            <Button
              type="button"
              disabled={!canConfirm}
              onClick={() => onConfirm(draftTitle.trim(), draftIds)}
            >
              {isNew ? 'สร้างแฟ้มย่อย' : 'ยืนยัน'}
            </Button>
          </span>
        </DialogFooter>

        {previewLoadingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" aria-label="กำลังโหลดตัวอย่างโจทย์">
            <div className="h-80 w-full max-w-2xl animate-pulse rounded-2xl bg-card" />
          </div>
        )}
        {previewQ && (
          <PreviewModal
            question={previewQ}
            isFlagged={false}
            onClose={() => setPreviewQ(null)}
            onToggleFlag={() => {}}
          />
        )}
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={confirmingDiscard}
      onOpenChange={setConfirmingDiscard}
      title="ออกโดยไม่ยืนยันการเปลี่ยนแปลง?"
      description={isNew
        ? 'ชื่อแฟ้มย่อยหรือโจทย์ที่เลือกไว้ยังไม่ได้กด “สร้างแฟ้มย่อย” หากออกตอนนี้ ข้อมูลที่กรอกและเลือกไว้จะหายไป'
        : 'การแก้ชื่อหรือรายการโจทย์ยังไม่ได้กด “ยืนยัน” หากออกตอนนี้ การเปลี่ยนแปลงครั้งนี้จะหายไป'}
      confirmLabel="ออกโดยไม่บันทึก"
      cancelLabel={isNew ? 'กลับไปสร้างต่อ' : 'กลับไปแก้ไขต่อ'}
      variant="destructive"
      onConfirm={discardDraft}
      finalFocus={titleInputRef}
    />
    </>
  )
}
