'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Archive,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Save,
  Send,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { BankQuestion } from '@/lib/question-bank'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ConfirmDialog, useConfirm } from '@/components/ui/confirm-dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { AssignmentAnnouncementEditor } from '@/components/assignments/assignment-announcement-editor'
import { AssignmentSettingToggle } from '@/components/assignments/assignment-setting-toggle'
import { ClassroomPicker } from '@/components/assignments/classroom-picker'
import { QuestionListPreviewDialog } from '@/components/assignments/question-list-preview-dialog'
import { QuestionPicker } from '@/components/assignments/question-picker'
import {
  QuestionSetImport,
  type QuestionSetImportChoice,
} from '@/components/assignments/question-set-import'
import type { AssignmentQuestionSetOption } from '@/components/assignments/create-assignment-form'
import { toggleQuestionSetSelection } from '@/lib/question-set-selection'
import { cn } from '@/lib/utils'
import {
  closePracticeLibrary,
  createPracticeLibrary,
  deletePracticeLibrary,
  getPracticeQuestionPreviewDetails,
  publishPracticeLibrary,
  updatePracticeLibrary,
} from '../_actions'
import {
  PRACTICE_LIBRARY_STATUS_LABELS,
  type PracticeClassroomOption,
  type PracticeLibraryStatus,
} from '../_lib/teacher-contract'
import { PracticeBulkTagEditor } from './practice-bulk-tag-editor'

const CREATE_STEPS = ['รายละเอียดและโจทย์', 'ตั้งค่า', 'ตรวจสอบและสร้าง']

interface InitialPracticeLibrary {
  id: string
  title: string
  description: string | null
  classroomId: string
  questionIds: string[]
  status: PracticeLibraryStatus
  revealAnswerKey: boolean
}

interface PracticeLibraryFormProps {
  classrooms: PracticeClassroomOption[]
  questions: BankQuestion[]
  questionSets?: AssignmentQuestionSetOption[]
  initialClassroomId?: string
  initialLibrary?: InitialPracticeLibrary
  missingQuestionIds?: string[]
  unsupportedQuestionIds?: string[]
  loadingWarning?: string | null
  editableQuestionIds?: string[]
}

function statusBadgeVariant(status: PracticeLibraryStatus) {
  if (status === 'published') return 'statusSuccess' as const
  if (status === 'closed') return 'outline' as const
  return 'secondary' as const
}

export function PracticeLibraryForm({
  classrooms,
  questions,
  questionSets = [],
  initialClassroomId,
  initialLibrary,
  missingQuestionIds = [],
  unsupportedQuestionIds = [],
  loadingWarning,
  editableQuestionIds = [],
}: PracticeLibraryFormProps) {
  const previewLibraryId = initialLibrary?.id
  const loadPracticePreview = useCallback(
    (ids: readonly string[]) => previewLibraryId
      ? getPracticeQuestionPreviewDetails(previewLibraryId, ids)
      : Promise.resolve({ data: [] }),
    [previewLibraryId],
  )
  const router = useRouter()
  const [confirm, confirmDialog] = useConfirm()
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState(initialLibrary?.title ?? '')
  const [description, setDescription] = useState(initialLibrary?.description ?? '')
  const contextualPrimaryClassroomId = !initialLibrary
    && classrooms.some(classroom => classroom.id === initialClassroomId)
    ? initialClassroomId
    : undefined
  const [classroomIds, setClassroomIds] = useState<string[]>(() => {
    if (initialLibrary) return [initialLibrary.classroomId]
    if (contextualPrimaryClassroomId) return [contextualPrimaryClassroomId]
    return classrooms[0] ? [classrooms[0].id] : []
  })
  const [selectedIds, setSelectedIds] = useState<string[]>(initialLibrary?.questionIds ?? [])
  const [revealAnswerKey, setRevealAnswerKey] = useState(initialLibrary?.revealAnswerKey ?? false)
  const [search, setSearch] = useState('')
  const [difficulty, setDifficulty] = useState('all')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify({
    title: initialLibrary?.title ?? '',
    description: initialLibrary?.description ?? '',
    classroomIds: initialLibrary ? [initialLibrary.classroomId] : classroomIds,
    selectedIds: initialLibrary?.questionIds ?? [],
    revealAnswerKey: initialLibrary?.revealAnswerKey ?? false,
  }))
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [step, setStep] = useState(0)
  const [questionPickerOpen, setQuestionPickerOpen] = useState(false)
  const questionPickerRef = useRef<HTMLDivElement>(null)
  const [listPreview, setListPreview] = useState<{
    ids: string[]
    title: string
  } | null>(null)

  const currentSnapshot = JSON.stringify({
    title,
    description,
    classroomIds,
    selectedIds,
    revealAnswerKey,
  })
  const isDirty = currentSnapshot !== savedSnapshot
  const membershipFrozen = initialLibrary?.status !== undefined && initialLibrary.status !== 'draft'
  const initialQuestionIds = initialLibrary?.questionIds ?? []
  const membershipDirty = Boolean(initialLibrary) && (
    selectedIds.length !== initialQuestionIds.length
    || selectedIds.some((id, index) => id !== initialQuestionIds[index])
  )
  const editableQuestionIdSet = useMemo(
    () => new Set(editableQuestionIds),
    [editableQuestionIds],
  )
  const bulkEditableIds = selectedIds.filter(id => editableQuestionIdSet.has(id))
  const questionById = useMemo(
    () => new Map(questions.map(question => [question.id, question])),
    [questions],
  )
  const bankIds = useMemo(() => new Set(questions.map(question => question.id)), [questions])
  const selectedMissingIds = missingQuestionIds.filter(id => selectedIds.includes(id))
  const selectedUnsupportedIds = unsupportedQuestionIds.filter(id => selectedIds.includes(id))
  const blockedQuestionIds = [...new Set([...selectedMissingIds, ...selectedUnsupportedIds])]
  const hasDraftQuestionBlock = !membershipFrozen
    && (blockedQuestionIds.length > 0 || Boolean(loadingWarning))
  const selectedClassrooms = classroomIds.flatMap(id => {
    const classroom = classrooms.find(candidate => candidate.id === id)
    return classroom ? [classroom] : []
  })
  const classroomSummary = selectedClassrooms.length <= 1
    ? (selectedClassrooms[0]?.name ?? '—')
    : `${selectedClassrooms[0]?.name ?? ''} และอีก ${selectedClassrooms.length - 1} ห้อง`
  const canAdvanceDetails = title.trim().length > 0
    && classroomIds.length > 0
    && selectedIds.length > 0
    && !hasDraftQuestionBlock

  useEffect(() => {
    if (!isDirty) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = true
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [isDirty])

  useEffect(() => {
    if (!questionPickerOpen) return

    function closeQuestionPickerOnOutsideClick(event: MouseEvent) {
      const container = questionPickerRef.current
      const target = event.target
      if (!container || !(target instanceof Node)) return
      if (container.contains(target) || event.composedPath().includes(container)) return
      if (target instanceof Element && target.closest('[role="dialog"]')) return
      setQuestionPickerOpen(false)
    }

    document.addEventListener('click', closeQuestionPickerOnOutsideClick)
    return () => document.removeEventListener('click', closeQuestionPickerOnOutsideClick)
  }, [questionPickerOpen])

  function toggleQuestion(id: string) {
    if (membershipFrozen) return
    setSelectedIds(current => (
      current.includes(id) ? current.filter(questionId => questionId !== id) : [...current, id]
    ))
  }

  function toggleClassroom(id: string) {
    if (initialLibrary || id === contextualPrimaryClassroomId) return
    setClassroomIds(current => (
      current.includes(id)
        ? current.filter(classroomId => classroomId !== id)
        : [...current, id]
    ))
  }

  function importQuestionSet(choice: QuestionSetImportChoice) {
    if (membershipFrozen) return
    const usableIds = [...new Set(choice.questionIds)].filter(id => bankIds.has(id))
    const removing = usableIds.length > 0 && usableIds.every(id => selectedIds.includes(id))
    const changedCount = removing
      ? usableIds.length
      : usableIds.filter(id => !selectedIds.includes(id)).length
    const missingCount = new Set(choice.questionIds).size - usableIds.length

    setSelectedIds(current => toggleQuestionSetSelection(current, choice.questionIds, bankIds))
    if (removing) {
      toast.success(`เอา ${changedCount} ข้อจาก${choice.toastLabel} ออกจากคลังฝึกแล้ว`)
      return
    }
    toast.success(
      missingCount > 0
        ? `เพิ่ม ${changedCount} ข้อจาก${choice.toastLabel} (ข้าม ${missingCount} ข้อที่ถูกลบไปแล้ว)`
        : `เพิ่ม ${changedCount} ข้อจาก${choice.toastLabel}`,
    )
  }

  function removeBlockedQuestions() {
    if (membershipFrozen) return
    const blocked = new Set(blockedQuestionIds)
    setSelectedIds(current => current.filter(id => !blocked.has(id)))
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    if (membershipFrozen) return
    setSelectedIds(current => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function runSave(intent: 'draft' | 'publish' = 'draft') {
    setFieldErrors({})
    startTransition(async () => {
      const result = initialLibrary
        ? await updatePracticeLibrary({
            libraryId: initialLibrary.id,
            title,
            description,
            questionIds: selectedIds,
            revealAnswerKey,
          })
        : await createPracticeLibrary({
            title,
            description,
            classroomIds,
            questionIds: selectedIds,
            revealAnswerKey,
            intent,
          })

      if (!result.ok) {
        setFieldErrors(result.fields ?? {})
        toast.error(result.error)
        return
      }

      setSavedSnapshot(currentSnapshot)
      if (initialLibrary) {
        toast.success('บันทึกคลังฝึกแล้ว')
        router.refresh()
      } else {
        toast.success(intent === 'publish' ? 'สร้างและเผยแพร่คลังฝึกแล้ว' : 'บันทึกร่างคลังฝึกแล้ว')
        router.push(`/practice/${result.id}/edit`)
      }
    })
  }

  function runLifecycle(action: 'publish' | 'close') {
    if (!initialLibrary) return
    startTransition(async () => {
      const result = action === 'publish'
        ? await publishPracticeLibrary({ libraryId: initialLibrary.id })
        : await closePracticeLibrary({ libraryId: initialLibrary.id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(action === 'publish' ? 'เผยแพร่คลังฝึกแล้ว' : 'ปิดคลังฝึกแล้ว')
      router.refresh()
    })
  }

  async function leaveForm() {
    if (isDirty) {
      const shouldLeave = await confirm({
        title: 'ออกโดยไม่บันทึก?',
        description: 'ชื่อ คำชี้แจง หรือรายการโจทย์ที่ยังไม่ได้บันทึกจะหายไป',
        confirmLabel: 'ออกโดยไม่บันทึก',
        cancelLabel: 'กลับไปแก้ไข',
        variant: 'destructive',
      })
      if (!shouldLeave) return
    }
    router.push('/practice')
  }

  function runDelete() {
    if (!initialLibrary) return
    startTransition(async () => {
      const result = await deletePracticeLibrary({ libraryId: initialLibrary.id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('ลบคลังฝึกแล้ว โจทย์ต้นฉบับยังอยู่ในคลังโจทย์')
      router.push('/practice')
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <header className="flex min-h-16 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">
              {initialLibrary ? 'ตั้งค่าคลังฝึก' : 'สร้างคลังฝึก'}
            </h1>
            <Badge variant="outline">ไม่มีคะแนน</Badge>
            {initialLibrary && (
              <Badge variant={statusBadgeVariant(initialLibrary.status)}>
                {PRACTICE_LIBRARY_STATUS_LABELS[initialLibrary.status]}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            ครูเห็นเพียงข้อที่นักเรียนเคยตอบและจำนวนครั้ง ไม่เห็นคำตอบหรือผลถูกผิด
          </p>
        </div>
        {initialLibrary && (
          <div className="flex min-h-11 flex-wrap items-center justify-end gap-2">
            {initialLibrary.status === 'draft' && (
              <Button
                type="button"
                size="sm"
                className="min-h-11"
                onClick={() => runLifecycle('publish')}
                disabled={isPending || isDirty || selectedIds.length === 0 || hasDraftQuestionBlock}
              >
                <Send data-icon="inline-start" />
                เผยแพร่
              </Button>
            )}
            {initialLibrary.status === 'published' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={() => runLifecycle('close')}
                disabled={isPending || isDirty}
              >
                <Archive data-icon="inline-start" />
                ปิดคลังฝึก
              </Button>
            )}
          </div>
        )}
      </header>

      {!initialLibrary && (
        <nav className="flex items-start" aria-label="ขั้นตอนการสร้างคลังฝึก">
          {CREATE_STEPS.map((label, index) => (
            <div key={label} className="flex flex-1 items-start last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`flex size-8 items-center justify-center rounded-full text-sm font-bold transition-all ${
                  index < step
                    ? 'bg-primary text-primary-foreground'
                    : index === step
                      ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                      : 'bg-muted text-muted-foreground'
                }`}>
                  {index < step ? <Check className="size-4" aria-hidden="true" /> : index + 1}
                </div>
                <p className={`mt-1 max-w-24 text-center text-xs sm:max-w-none sm:whitespace-nowrap ${
                  index === step ? 'font-medium text-primary' : 'text-muted-foreground'
                }`}>
                  {label}
                </p>
              </div>
              {index < CREATE_STEPS.length - 1 && (
                <div className={`mx-2 mt-4 h-0.5 flex-1 transition-all ${index < step ? 'bg-primary' : 'bg-muted'}`} />
              )}
            </div>
          ))}
        </nav>
      )}

      <form
        className="flex flex-col gap-4"
        onSubmit={event => {
          event.preventDefault()
          if (!initialLibrary && step < CREATE_STEPS.length - 1) {
            if (step !== 0 || canAdvanceDetails) setStep(current => current + 1)
            return
          }
          runSave('draft')
        }}
      >
        {(!initialLibrary ? step === 0 : true) && (
          <div className="flex flex-col gap-3">
        <Card padding="md">
        <section aria-labelledby="practice-basic-heading" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="practice-basic-heading" className="text-sm font-semibold text-foreground">ข้อมูลพื้นฐาน</h2>
            {isDirty && <span className="text-xs text-muted-foreground" role="status">มีการแก้ไขที่ยังไม่ได้บันทึก</span>}
          </div>
          <FieldGroup className="grid gap-3 md:grid-cols-2">
            <Field
              className={cn(contextualPrimaryClassroomId && 'md:col-span-2')}
              data-invalid={Boolean(fieldErrors.title)}
            >
              <FieldLabel htmlFor="practice-title">ชื่อคลังฝึก</FieldLabel>
              <Input
                id="practice-title"
                className="min-h-11"
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder="เช่น สอวน. ค่าย 1 · ไฟฟ้า"
                maxLength={160}
                required
                aria-invalid={Boolean(fieldErrors.title)}
              />
              <FieldError>{fieldErrors.title?.[0]}</FieldError>
            </Field>
            {initialLibrary && (
              <Field>
                <FieldLabel htmlFor="practice-classroom">ห้องเรียน</FieldLabel>
                <Input
                  id="practice-classroom"
                  value={selectedClassrooms[0]?.name ?? ''}
                  disabled
                  readOnly
                />
              </Field>
            )}
            {!initialLibrary && !contextualPrimaryClassroomId && (
              <Field data-invalid={Boolean(fieldErrors.classroomIds)}>
                <FieldLabel>
                  ห้องเรียน <span aria-hidden="true" className="text-destructive">*</span>
                  {classroomIds.length > 1 && (
                    <span className="font-normal text-muted-foreground"> ({classroomIds.length} ห้อง)</span>
                  )}
                </FieldLabel>
                <ClassroomPicker
                  classrooms={classrooms}
                  selectedIds={classroomIds}
                  onToggle={toggleClassroom}
                />
                <FieldError>{fieldErrors.classroomIds?.[0]}</FieldError>
              </Field>
            )}
            <Field className="md:col-span-2" data-invalid={Boolean(fieldErrors.description)}>
              <FieldLabel>ชี้แจงรายละเอียดเพิ่มเติม</FieldLabel>
              <p className="text-xs text-muted-foreground">
                นักเรียนจะเห็นข้อความและรูปนี้ในหน้ารอก่อนเข้าคลังฝึก
              </p>
              <AssignmentAnnouncementEditor
                value={description}
                onChange={setDescription}
                rows={3}
              />
              <FieldError>{fieldErrors.description?.[0]}</FieldError>
            </Field>
          </FieldGroup>
        </section>
        </Card>

        <Card padding="md">
        <section aria-labelledby="practice-questions-heading" className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="practice-questions-heading" className="text-sm font-semibold text-foreground">โจทย์</h2>
            <span className="text-sm font-semibold text-primary">{selectedIds.length} ข้อ</span>
            {membershipFrozen && (
              <span className="text-xs text-muted-foreground">รายการโจทย์ถูกตรึงหลังเผยแพร่ครั้งแรก</span>
            )}
          </div>
          {(loadingWarning || blockedQuestionIds.length > 0) && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm"
            >
              <CircleAlert className="shrink-0 text-warning-foreground" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-warning-foreground">
                {loadingWarning
                  ?? (selectedMissingIds.length > 0
                    ? `แสดงรายละเอียดโจทย์เดิมไม่ได้ ${selectedMissingIds.length} ข้อ`
                    : `มีโจทย์เดิมที่ตรวจอัตโนมัติไม่ได้ ${selectedUnsupportedIds.length} ข้อ`)}
                {membershipFrozen
                  ? ' รายการถูกตรึงแล้ว กรุณาตรวจโจทย์ต้นฉบับก่อนเปิดให้นักเรียนใช้ต่อ'
                  : ' เอาโจทย์เหล่านี้ออกก่อนบันทึกหรือเผยแพร่'}
              </p>
              {!membershipFrozen && blockedQuestionIds.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  onClick={removeBlockedQuestions}
                >
                  เอาข้อที่มีปัญหาออก
                </Button>
              )}
            </div>
          )}
          {membershipFrozen ? (
            <div className="max-h-80 overflow-y-auto rounded-lg border border-border" role="list">
              {selectedIds.map((id, index) => {
                const question = questionById.get(id)
                return (
                  <div
                    key={id}
                    role="listitem"
                    className="flex min-h-11 items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
                  >
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium" title={question?.title}>
                      {question?.title ?? 'โจทย์ที่ไม่สามารถแสดงรายละเอียดได้'}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {question?.question_type ?? 'ไม่พร้อมใช้'}
                    </span>
                  </div>
                )
              })}
              {selectedIds.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">ไม่พบโจทย์ในคลังนี้</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground">
                เลือกโจทย์ <span aria-hidden="true" className="text-destructive">*</span>
                <span className="sr-only"> จำเป็น</span>
              </h3>

              <QuestionSetImport
                sets={questionSets}
                bankIds={bankIds}
                selectedIds={selectedIds}
                onToggle={importQuestionSet}
                onPreview={choice => setListPreview({
                  ids: choice.questionIds.filter(id => bankIds.has(id)),
                  title: `โจทย์ใน${choice.toastLabel}`,
                })}
              />

              <div ref={questionPickerRef}>
                <Collapsible open={questionPickerOpen} onOpenChange={setQuestionPickerOpen}>
                  <CollapsibleTrigger
                    className={cn(
                      buttonVariants({ variant: 'outline' }),
                      'group h-auto w-full justify-start gap-2 rounded-xl px-3 py-2.5 text-left',
                    )}
                  >
                    <span className="text-foreground">เลือกโจทย์รายข้อ</span>
                    <span className="text-xs font-normal text-foreground">
                      {questions.length.toLocaleString('th-TH')} ข้อในคลัง
                    </span>
                    <ChevronDown className="ml-auto text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height] duration-150 ease-out data-ending-style:h-0 data-starting-style:h-0">
                    <div className="pt-4">
                      <QuestionPicker
                        questions={questions}
                        selectedIds={selectedIds}
                        baselineIds={initialLibrary?.questionIds ?? []}
                        onToggle={toggleQuestion}
                        search={search}
                        onSearchChange={setSearch}
                        diffFilter={difficulty}
                        onDiffFilterChange={setDifficulty}
                        showHeader={false}
                        showSelectedFooter={false}
                        surface="plain"
                        collectionNoun="คลังฝึก"
                        loadPreviewQuestions={previewLibraryId ? loadPracticePreview : undefined}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          )}
          {!membershipFrozen && selectedIds.length > 1 && (
            <Collapsible>
              <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-y border-border py-1.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">ลำดับโจทย์</p>
                  <p className="text-xs text-muted-foreground">นักเรียนเห็นเลขข้อตามลำดับนี้</p>
                </div>
                <CollapsibleTrigger
                  render={<Button type="button" size="sm" variant="outline" className="min-h-11" />}
                >
                  จัดลำดับ
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="max-h-72 overflow-y-auto py-1">
                {selectedIds.map((id, index) => {
                  const question = questionById.get(id)
                  return (
                    <div
                      key={id}
                      className="flex min-h-11 items-center gap-2 border-b border-border px-1 py-1 last:border-b-0"
                    >
                      <span className="w-7 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm" title={question?.title}>
                        {question?.title ?? 'โจทย์ที่ไม่สามารถแสดงรายละเอียดได้'}
                      </span>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="size-11"
                        aria-label={`เลื่อน ${question?.title ?? `ข้อ ${index + 1}`} ขึ้น`}
                        disabled={index === 0}
                        onClick={() => moveQuestion(index, -1)}
                      >
                        <ChevronUp />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="size-11"
                        aria-label={`เลื่อน ${question?.title ?? `ข้อ ${index + 1}`} ลง`}
                        disabled={index === selectedIds.length - 1}
                        onClick={() => moveQuestion(index, 1)}
                      >
                        <ChevronDown />
                      </Button>
                    </div>
                  )
                })}
              </CollapsibleContent>
            </Collapsible>
          )}
          <FieldError>{fieldErrors.questionIds?.[0]}</FieldError>
          {initialLibrary && selectedIds.length > 0 && (
            <PracticeBulkTagEditor
              libraryId={initialLibrary.id}
              questionIds={bulkEditableIds}
              disabled={membershipDirty || bulkEditableIds.length === 0}
              disabledReason={membershipDirty
                ? 'บันทึกรายการโจทย์ก่อนใช้เครื่องมือนี้'
                : 'บัญชีนี้ไม่มีโจทย์ในคลังที่แก้แท็กได้'}
              questions={bulkEditableIds.map(id => {
                const question = questionById.get(id)
                return { id, title: question?.title ?? 'โจทย์ที่ไม่สามารถแสดงรายละเอียดได้' }
              })}
            />
          )}
        </section>
        </Card>
          </div>
        )}

        {(!initialLibrary ? step === 1 : true) && (
          <Card padding="md" className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">ตั้งค่าคลังฝึก</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                การฝึกชนิดนี้ไม่กำหนดคะแนน เวลา ชุดสุ่ม หรือเงื่อนไขจบ
              </p>
            </div>
            <AssignmentSettingToggle
              label="ให้นักเรียนกดตรวจคำตอบได้ทีละข้อ"
              description="คลังฝึกใช้การตรวจรายข้อเสมอ เพื่อให้นักเรียนลองใหม่ได้ทันที"
              checked
              onCheckedChange={() => {}}
              disabled
              disabledMessage="เปิดไว้เสมอสำหรับคลังฝึก"
            />
            <AssignmentSettingToggle
              label="แสดงเฉลยหลังจากกดตรวจคำตอบ"
              description="หากปิด นักเรียนจะเห็นเพียงว่าคำตอบตรงหรือยังไม่ตรง"
              checked={revealAnswerKey}
              onCheckedChange={setRevealAnswerKey}
            />
            {!initialLibrary
              && contextualPrimaryClassroomId
              && classrooms.some(classroom => classroom.id !== contextualPrimaryClassroomId) && (
              <>
                <Separator />
                <ClassroomPicker
                  classrooms={classrooms}
                  selectedIds={classroomIds}
                  onToggle={toggleClassroom}
                  primaryClassroomId={contextualPrimaryClassroomId}
                  itemNoun="คลังฝึก"
                />
                <FieldError>{fieldErrors.classroomIds?.[0]}</FieldError>
                {classroomIds.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    แต่ละห้องจะมีคลังฝึกและความคืบหน้าของนักเรียนแยกจากกัน
                  </p>
                )}
              </>
            )}
          </Card>
        )}

        {!initialLibrary && step === 2 && (
          <Card padding="md" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-foreground">ตรวจสอบรายละเอียดก่อนสร้าง</h2>
            <div className="rounded-xl border border-border px-3">
              {[
                { label: 'ชื่อ', value: title.trim() },
                { label: 'ห้องเรียน', value: classroomSummary },
                { label: 'ประเภท', value: 'คลังฝึก · ไม่มีคะแนน' },
                { label: 'โจทย์', value: `${selectedIds.length.toLocaleString('th-TH')} ข้อ` },
                { label: 'การตรวจคำตอบ', value: 'ตรวจได้ทีละข้อ' },
                { label: 'เฉลยคำตอบ', value: revealAnswerKey ? 'แสดงหลังตรวจ' : 'ไม่แสดง' },
              ].map(item => (
                <div key={item.label} className="flex min-h-11 items-center justify-between gap-4 border-b border-border py-2 last:border-b-0">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className="text-right text-sm font-medium text-foreground">{item.value}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              นักเรียนจะเข้าหน้ารอก่อนเห็นรายการโจทย์ และครูดูได้เฉพาะข้อที่เคยตอบกับจำนวนครั้ง
            </p>
          </Card>
        )}

        <footer className="flex min-h-11 flex-wrap items-center justify-between gap-2 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="min-h-11"
              type="button"
              variant="outline"
              onClick={() => !initialLibrary && step > 0 ? setStep(current => current - 1) : leaveForm()}
              disabled={isPending}
            >
              {!initialLibrary && step > 0 && <ChevronLeft data-icon="inline-start" aria-hidden="true" />}
              {!initialLibrary && step > 0 ? 'ย้อนกลับ' : 'ยกเลิก'}
            </Button>
            {initialLibrary?.status === 'draft' && (
              <Button
                type="button"
                variant="destructive"
                className="min-h-11"
                onClick={() => setConfirmingDelete(true)}
                disabled={isPending}
              >
                <Trash2 data-icon="inline-start" />
                ลบคลังฝึก
              </Button>
            )}
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none">
            {!initialLibrary && step < CREATE_STEPS.length - 1 ? (
              <Button
                type="button"
                className="min-h-11"
                onClick={() => setStep(current => current + 1)}
                disabled={isPending || (step === 0 && !canAdvanceDetails)}
              >
                ถัดไป
                <ChevronRight data-icon="inline-end" aria-hidden="true" />
              </Button>
            ) : (
              <>
                <Button
                  className="min-h-11"
                  type="submit"
                  variant={initialLibrary ? 'default' : 'outline'}
                  disabled={isPending || !isDirty || !title.trim() || classroomIds.length === 0 || hasDraftQuestionBlock}
                >
                  <Save data-icon="inline-start" />
                  {isPending ? 'กำลังบันทึก...' : initialLibrary ? 'บันทึก' : 'บันทึกร่าง'}
                </Button>
                {!initialLibrary && (
                  <Button
                    type="button"
                    className="min-h-11"
                    onClick={() => runSave('publish')}
                    disabled={isPending || !canAdvanceDetails}
                  >
                    <Send data-icon="inline-start" />
                    สร้างและเผยแพร่
                  </Button>
                )}
              </>
            )}
          </div>
        </footer>
      </form>

      <QuestionListPreviewDialog
        ids={listPreview?.ids ?? []}
        title={listPreview?.title}
        open={listPreview !== null}
        onOpenChange={open => { if (!open) setListPreview(null) }}
        loadQuestions={previewLibraryId ? loadPracticePreview : undefined}
      />

      {confirmDialog}
      {initialLibrary?.status === 'draft' && (
        <ConfirmDialog
          open={confirmingDelete}
          onOpenChange={setConfirmingDelete}
          title={`ลบคลังฝึก “${initialLibrary.title}”?`}
          description="ร่างและรายการโจทย์ในคลังนี้จะถูกลบ แต่โจทย์ต้นฉบับยังอยู่ในคลังโจทย์"
          confirmLabel="ลบถาวร"
          variant="destructive"
          onConfirm={runDelete}
        />
      )}
    </div>
  )
}
