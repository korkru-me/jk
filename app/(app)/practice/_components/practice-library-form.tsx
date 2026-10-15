'use client'

import { AssignmentReuseDetails } from '@/components/assignments/assignment-reuse-details'
import { WorkTypeBadge } from '@/components/assignments/work-type'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Archive,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Eye,
  Save,
  Send,
  Trash2,
  X,
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { IconButton } from '@/components/ui/icon-button'
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
import { questionExcerpt } from '@/lib/question-display'
import { cn } from '@/lib/utils'
import { ClassroomWorkHeader } from '@/components/assignments/classroom-work-header'
import { classroomNavigationPath } from '@/lib/classroom-navigation'
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
import { usePracticeManagementFormState } from '@/components/practice/practice-management-shell'

const CREATE_STEPS = ['รายละเอียดและโจทย์', 'ตั้งค่า', 'ตรวจสอบและสร้าง']

const NEW_PRACTICE_LIBRARY_DEFAULTS = {
  revealAnswerKey: true,
  calculatorEnabled: true,
  scratchpadEnabled: true,
  shuffleQuestions: true,
  shuffleOptions: true,
} as const

interface InitialPracticeLibrary {
  id: string
  title: string
  description: string | null
  classroomId: string
  questionIds: string[]
  status: PracticeLibraryStatus
  revealAnswerKey: boolean
  accessCode: string | null
  calculatorEnabled: boolean
  scratchpadEnabled: boolean
  shuffleQuestions: boolean
  shuffleOptions: boolean
}

export type PracticeLibraryCopyPreset = Pick<InitialPracticeLibrary,
  'title' | 'description' | 'questionIds' | 'revealAnswerKey' | 'accessCode'
  | 'calculatorEnabled' | 'scratchpadEnabled' | 'shuffleQuestions' | 'shuffleOptions'
> & { sourceTitle: string }

interface PracticeLibraryFormProps {
  classrooms: PracticeClassroomOption[]
  questions: BankQuestion[]
  questionSets?: AssignmentQuestionSetOption[]
  initialClassroomId?: string
  initialLibrary?: InitialPracticeLibrary
  copyPreset?: PracticeLibraryCopyPreset
  missingQuestionIds?: string[]
  unsupportedQuestionIds?: string[]
  loadingWarning?: string | null
  editableQuestionIds?: string[]
  embedded?: boolean
  /** Guarded local previews can capture creation without external writes. */
  actions?: { createPracticeLibrary: typeof createPracticeLibrary; updatePracticeLibrary?: typeof updatePracticeLibrary; deletePracticeLibrary?: typeof deletePracticeLibrary; onSaved?: (id: string) => void }
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
  copyPreset,
  missingQuestionIds = [],
  unsupportedQuestionIds = [],
  loadingWarning,
  editableQuestionIds = [],
  embedded = false,
  actions,
}: PracticeLibraryFormProps) {
  const initialValues = initialLibrary ?? copyPreset
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
  const [title, setTitle] = useState(initialValues?.title ?? '')
  const [description, setDescription] = useState(initialValues?.description ?? '')
  const contextualPrimaryClassroomId = !initialLibrary
    && classrooms.some(classroom => classroom.id === initialClassroomId)
    ? initialClassroomId
    : undefined
  const [classroomIds, setClassroomIds] = useState<string[]>(() => {
    if (initialLibrary) return [initialLibrary.classroomId]
    if (contextualPrimaryClassroomId) return [contextualPrimaryClassroomId]
    return classrooms[0] ? [classrooms[0].id] : []
  })
  const [selectedIds, setSelectedIds] = useState<string[]>(initialValues?.questionIds ?? [])
  const [revealAnswerKey, setRevealAnswerKey] = useState(
    initialValues?.revealAnswerKey ?? NEW_PRACTICE_LIBRARY_DEFAULTS.revealAnswerKey,
  )
  const [accessCodeEnabled, setAccessCodeEnabled] = useState(Boolean(initialValues?.accessCode))
  const [accessCode, setAccessCode] = useState(initialValues?.accessCode ?? '')
  const [calculatorEnabled, setCalculatorEnabled] = useState(
    initialValues?.calculatorEnabled ?? NEW_PRACTICE_LIBRARY_DEFAULTS.calculatorEnabled,
  )
  const [scratchpadEnabled, setScratchpadEnabled] = useState(
    initialValues?.scratchpadEnabled ?? NEW_PRACTICE_LIBRARY_DEFAULTS.scratchpadEnabled,
  )
  const [shuffleQuestions, setShuffleQuestions] = useState(
    initialValues?.shuffleQuestions ?? NEW_PRACTICE_LIBRARY_DEFAULTS.shuffleQuestions,
  )
  const [shuffleOptions, setShuffleOptions] = useState(
    initialValues?.shuffleOptions ?? NEW_PRACTICE_LIBRARY_DEFAULTS.shuffleOptions,
  )
  const [search, setSearch] = useState('')
  const [difficulty, setDifficulty] = useState('all')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify({
    title: initialValues?.title ?? '',
    description: initialValues?.description ?? '',
    classroomIds: initialLibrary ? [initialLibrary.classroomId] : classroomIds,
    selectedIds: initialValues?.questionIds ?? [],
    revealAnswerKey: initialValues?.revealAnswerKey
      ?? NEW_PRACTICE_LIBRARY_DEFAULTS.revealAnswerKey,
    accessCodeEnabled: Boolean(initialValues?.accessCode),
    accessCode: initialValues?.accessCode ?? '',
    calculatorEnabled: initialValues?.calculatorEnabled
      ?? NEW_PRACTICE_LIBRARY_DEFAULTS.calculatorEnabled,
    scratchpadEnabled: initialValues?.scratchpadEnabled
      ?? NEW_PRACTICE_LIBRARY_DEFAULTS.scratchpadEnabled,
    shuffleQuestions: initialValues?.shuffleQuestions
      ?? NEW_PRACTICE_LIBRARY_DEFAULTS.shuffleQuestions,
    shuffleOptions: initialValues?.shuffleOptions
      ?? NEW_PRACTICE_LIBRARY_DEFAULTS.shuffleOptions,
  }))
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [step, setStep] = useState(0)
  const [questionPickerOpen, setQuestionPickerOpen] = useState(false)
  const questionPickerRef = useRef<HTMLDivElement>(null)
  const [listPreview, setListPreview] = useState<{
    ids: string[]
    title: string
  } | null>(null)
  const allowNavigationRef = useRef(false)

  const currentSnapshot = JSON.stringify({
    title,
    description,
    classroomIds,
    selectedIds,
    revealAnswerKey,
    accessCodeEnabled,
    accessCode,
    calculatorEnabled,
    scratchpadEnabled,
    shuffleQuestions,
    shuffleOptions,
  })
  const isDirty = currentSnapshot !== savedSnapshot
  const setManagementDirty = usePracticeManagementFormState()
  useEffect(() => {
    if (!embedded || !setManagementDirty) return
    setManagementDirty(isDirty || isPending)
    return () => setManagementDirty(false)
  }, [embedded, isDirty, isPending, setManagementDirty])
  const membershipFrozen = initialLibrary?.status !== undefined && initialLibrary.status !== 'draft'
  const initialQuestionIds = initialValues?.questionIds ?? []
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

  const confirmDiscardChanges = useCallback(async () => {
    if (!isDirty) return true
    return confirm({
      title: 'ออกโดยไม่บันทึก?',
      description: 'ข้อมูลคลังฝึกที่ยังไม่ได้บันทึกจะหายไป',
      confirmLabel: 'ออกโดยไม่บันทึก',
      cancelLabel: 'กลับไปแก้ไข',
      variant: 'destructive',
    })
  }, [confirm, isDirty])

  useEffect(() => {
    if (!isDirty) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (allowNavigationRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [isDirty])

  useEffect(() => {
    if (!isDirty) return

    function guardLinkNavigation(event: MouseEvent) {
      if (
        allowNavigationRef.current
        || event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) return
      const target = event.target
      const anchor = target instanceof Element
        ? target.closest<HTMLAnchorElement>('a[href]')
        : null
      if (
        !anchor
        || anchor.hasAttribute('download')
        || (anchor.target && anchor.target.toLowerCase() !== '_self')
      ) return

      const destination = new URL(anchor.href, window.location.href)
      const current = new URL(window.location.href)
      if (!['http:', 'https:'].includes(destination.protocol)) return
      if (
        destination.origin === current.origin
        && destination.pathname === current.pathname
        && destination.search === current.search
      ) return

      event.preventDefault()
      event.stopPropagation()
      void confirmDiscardChanges().then(shouldLeave => {
        if (!shouldLeave || !anchor.isConnected) return
        // Replaying the original link lets Next.js and the app shell run their
        // normal navigation/close callbacks. The bypass lasts only for that
        // replay, and also prevents a second native prompt for full reloads.
        allowNavigationRef.current = true
        anchor.click()
        window.setTimeout(() => { allowNavigationRef.current = false }, 0)
      })
    }

    document.addEventListener('click', guardLinkNavigation, true)
    return () => document.removeEventListener('click', guardLinkNavigation, true)
  }, [confirmDiscardChanges, isDirty])

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

  function runSave(intent: 'draft' | 'publish' = 'draft') {
    setFieldErrors({})
    startTransition(async () => {
      const result = initialLibrary
        ? await (actions?.updatePracticeLibrary ?? updatePracticeLibrary)({
            libraryId: initialLibrary.id,
            title,
            description,
            questionIds: selectedIds,
            revealAnswerKey,
            accessCode: accessCodeEnabled ? accessCode : null,
            calculatorEnabled,
            scratchpadEnabled,
            shuffleQuestions,
            shuffleOptions,
          })
        : await (actions?.createPracticeLibrary ?? createPracticeLibrary)({
            title,
            description,
            classroomIds,
            questionIds: selectedIds,
            revealAnswerKey,
            accessCode: accessCodeEnabled ? accessCode : null,
            calculatorEnabled,
            scratchpadEnabled,
            shuffleQuestions,
            shuffleOptions,
            intent,
          })

      if (!result.ok) {
        setFieldErrors(result.fields ?? {})
        toast.error(result.error)
        return
      }

      setSavedSnapshot(currentSnapshot)
      toast.success(initialLibrary ? 'บันทึกคลังฝึกแล้ว'
        : intent === 'publish' ? 'สร้างและเผยแพร่คลังฝึกแล้ว' : 'บันทึกร่างคลังฝึกแล้ว')
      if (actions?.onSaved) { actions.onSaved(result.id); return }
      if (embedded) { router.refresh(); return }
      allowNavigationRef.current = true
      const returnClassroomId = initialLibrary?.classroomId ?? contextualPrimaryClassroomId ?? classroomIds[0]
      router.push(returnClassroomId ? classroomNavigationPath(returnClassroomId, 'assignments') : '/practice')
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
    if (!await confirmDiscardChanges()) return
    router.push(embedded && initialLibrary ? `/practice/${initialLibrary.id}/edit` : '/practice')
  }

  function runDelete() {
    if (!initialLibrary) return
    startTransition(async () => {
      const result = await (actions?.deletePracticeLibrary ?? deletePracticeLibrary)({ libraryId: initialLibrary.id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('ลบคลังฝึกแล้ว โจทย์ต้นฉบับยังอยู่ในคลังโจทย์')
      router.push('/practice')
    })
  }

  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-3', !embedded && 'mx-auto max-w-6xl')}>
      {!embedded && <ClassroomWorkHeader
        kind="practice"
        title={initialLibrary ? title || 'คลังฝึก' : copyPreset ? 'ทำสำเนาคลังฝึก' : 'สร้างคลังฝึก'}
        classroom={classrooms.find(room => room.id === (initialLibrary?.classroomId ?? contextualPrimaryClassroomId ?? classroomIds[0]))}
        badges={<>
          {initialLibrary && <span className="font-medium">ตั้งค่าคลังฝึก</span>}
          <WorkTypeBadge type="practice" /><Badge variant="outline">ไม่มีคะแนน</Badge>
          {initialLibrary && <Badge variant={statusBadgeVariant(initialLibrary.status)}>{PRACTICE_LIBRARY_STATUS_LABELS[initialLibrary.status]}</Badge>}
        </>}
        actions={initialLibrary && (
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
        details={initialLibrary ? [{ label: 'โจทย์', value: `${selectedIds.length} ข้อ` }] : []}
        note="ครูเห็นเฉพาะข้อที่เคยตอบและจำนวนครั้ง ไม่เห็นคำตอบหรือผลถูกผิด"
      />}

      {copyPreset && <Card padding="md" className="flex flex-col gap-2">
        <p className="text-sm font-semibold">นำข้อมูลจาก “{copyPreset.sourceTitle}” มาเตรียมสร้างคลังฝึกใหม่</p>
        <AssignmentReuseDetails kind="practice" />
      </Card>}

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
                      : 'bg-muted text-foreground'
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
              <FieldLabel htmlFor="practice-title">
                ชื่อคลังฝึก <span aria-hidden="true" className="text-destructive">*</span>
                <span className="sr-only"> จำเป็น</span>
              </FieldLabel>
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
                    ? copyPreset
                      ? `มีโจทย์ ${selectedMissingIds.length} ข้อที่ไม่พบหรือคุณไม่มีสิทธิ์นำไปใช้ในคลังใหม่`
                      : `แสดงรายละเอียดโจทย์เดิมไม่ได้ ${selectedMissingIds.length} ข้อ`
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
          {!membershipFrozen && (
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
                        baselineIds={initialValues?.questionIds ?? []}
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
          <Separator />
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">โจทย์ที่เลือก</h3>
              <p className="text-xs text-muted-foreground">
                แสดงครบทุกข้อโดยไม่มีคะแนน และนักเรียนเลือกฝึกข้อใดก่อนก็ได้
              </p>
            </div>
            {selectedIds.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={() => setListPreview({ ids: selectedIds, title: 'โจทย์ทั้งหมดในคลังฝึก' })}
              >
                <Eye data-icon="inline-start" />
                ดูโจทย์ทั้งหมด
              </Button>
            )}
          </div>
          <div
            className="max-h-[28rem] overflow-y-auto rounded-xl border border-border"
            role={selectedIds.length > 0 ? 'list' : undefined}
          >
            {selectedIds.map((id, index) => {
              const question = questionById.get(id)
              const title = question?.title ?? 'โจทย์ที่ไม่สามารถแสดงรายละเอียดได้'
              return (
                <div
                  key={id}
                  role="listitem"
                  className="flex min-h-16 items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-sm font-semibold tabular-nums">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground" title={title}>{title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {question ? questionExcerpt(question.question_text) || question.question_type : 'ไม่พร้อมใช้'}
                    </p>
                  </div>
                  <IconButton
                    type="button"
                    label={`ดูตัวอย่าง ${title}`}
                    size="sm"
                    onClick={() => setListPreview({ ids: [id], title: `ตัวอย่างข้อ ${index + 1}` })}
                  >
                    <Eye />
                  </IconButton>
                  {!membershipFrozen && (
                    <IconButton
                      type="button"
                      label={`เอา ${title} ออกจากคลังฝึก`}
                      size="sm"
                      onClick={() => toggleQuestion(id)}
                    >
                      <X />
                    </IconButton>
                  )}
                </div>
              )
            })}
            {selectedIds.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">ยังไม่ได้เลือกโจทย์</p>
            )}
          </div>
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
            <AssignmentSettingToggle
              label="กำหนดรหัสผ่านเข้าทำ"
              description="ให้นักเรียนกรอกรหัสผ่านที่ครูตั้งไว้ก่อนเข้าคลังฝึก"
              checked={accessCodeEnabled}
              onCheckedChange={checked => {
                setAccessCodeEnabled(checked)
                if (!checked) setAccessCode('')
              }}
              footer={accessCodeEnabled ? (
                <Field data-invalid={Boolean(fieldErrors.accessCode)} className="pl-3">
                  <FieldLabel htmlFor="practice-access-code">รหัสผ่าน</FieldLabel>
                  <Input
                    id="practice-access-code"
                    value={accessCode}
                    onChange={event => setAccessCode(event.target.value)}
                    maxLength={100}
                    autoComplete="off"
                    required
                  />
                  <FieldDescription>นักเรียนต้องกรอกรหัสนี้ในหน้ารอก่อนเห็นรายการโจทย์</FieldDescription>
                  <FieldError>{fieldErrors.accessCode?.[0]}</FieldError>
                </Field>
              ) : undefined}
            />
            <AssignmentSettingToggle
              label="เครื่องคิดเลขวิทยาศาสตร์"
              description="เปิดให้นักเรียนใช้เครื่องคิดเลขวิทยาศาสตร์ระหว่างฝึกทำโจทย์"
              checked={calculatorEnabled}
              onCheckedChange={setCalculatorEnabled}
            />
            <AssignmentSettingToggle
              label="กระดาษทด"
              description="เปิดกระดาษทดที่เก็บเฉพาะในเครื่อง ไม่ใช้แนบส่งวิธีทำ"
              checked={scratchpadEnabled}
              onCheckedChange={setScratchpadEnabled}
            />
            <AssignmentSettingToggle
              label="สับลำดับข้อ"
              description="นักเรียนทุกคนเห็นโจทย์ชุดเดียวกัน แต่ระบบสับลำดับข้อให้แต่ละคนแตกต่างกัน"
              checked={shuffleQuestions}
              onCheckedChange={setShuffleQuestions}
            />
            <AssignmentSettingToggle
              label="สลับลำดับตัวเลือก"
              description="สลับลำดับตัวเลือกของโจทย์ปรนัยให้นักเรียนแต่ละคนแตกต่างกัน"
              checked={shuffleOptions}
              onCheckedChange={setShuffleOptions}
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
                { label: 'รหัสผ่านเข้าทำ', value: accessCodeEnabled ? 'กำหนดแล้ว' : 'ไม่ได้กำหนด' },
                { label: 'เครื่องคิดเลขวิทยาศาสตร์', value: calculatorEnabled ? 'เปิด' : 'ปิด' },
                { label: 'กระดาษทด', value: scratchpadEnabled ? 'เปิด' : 'ปิด' },
                { label: 'ลำดับโจทย์', value: shuffleQuestions ? 'สับต่างกันในแต่ละคน' : 'ตามลำดับที่เลือก' },
                { label: 'ลำดับตัวเลือก', value: shuffleOptions ? 'สลับ' : 'ตามโจทย์ต้นฉบับ' },
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
                key={`practice-next-${step}`}
                variant="workPractice"
                type="button"
                className="min-h-11"
                onClick={event => {
                  // Prevent the native default action before this DOM node can
                  // become the submit button rendered by the review step.
                  event.preventDefault()
                  setStep(current => current + 1)
                }}
                disabled={isPending || (step === 0 && !canAdvanceDetails)}
              >
                ถัดไป
                <ChevronRight data-icon="inline-end" aria-hidden="true" />
              </Button>
            ) : (
              <>
                <Button
                  key="practice-save-draft"
                  className="min-h-11"
                  type="submit"
                  variant={initialLibrary ? 'workPractice' : 'outline'}
                  disabled={isPending || (!isDirty && !copyPreset) || !title.trim() || classroomIds.length === 0 || hasDraftQuestionBlock}
                >
                  <Save data-icon="inline-start" />
                  {isPending ? 'กำลังบันทึก...' : initialLibrary ? 'บันทึก' : 'บันทึกร่าง'}
                </Button>
                {!initialLibrary && (
                  <Button
                    type="button"
                    className="min-h-11"
                    variant="workPractice"
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
