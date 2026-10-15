'use client'

import { useRouter } from 'next/navigation'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { isUuid } from '@/lib/practice-library-contracts'
import { cn } from '@/lib/utils'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import Form from 'next/form'
import {
  ArrowLeft,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Plus,
  Layers,
  Bookmark,
  Minus,
  CircleHelp,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { RichText } from '@/components/ui/rich-text'
import { PracticeQuestionCard } from './practice-question-card'
import { SolutionLoaderProvider } from '@/components/questions/solution-loader'
import { PracticeExerciseCard } from './practice-exercise-card'
import { ClassroomCoverThemePicker } from '@/components/classrooms/classroom-cover-theme-picker'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/ui/native-select'
import { defaultPracticeExerciseSettings, readPracticeExerciseSettings, writePracticeExerciseSettings, randomPracticeExerciseTheme, PRACTICE_EXERCISE_PAGE_SIZES, type PracticeExerciseSettings, type PracticeExerciseSettingsMap } from '@/lib/practice-exercise-settings'
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { createPracticeExercise, updatePracticeExercise, setPracticeReviewPin, getPracticeAttachedSolution } from '@/lib/actions/practice-exercises'
import { PRACTICE_EXERCISE_MAX_QUESTIONS, type PracticeExercise } from '@/lib/practice-exercises'
import type {
  PracticeQuestionListItem,
  StudentPracticeLibrary,
} from '@/lib/practice-question-access.server'
import {
  buildPracticeQuestionHref,
  buildPracticeSearchHref,
  PRACTICE_MAX_TAGS,
  type PracticeSearchState,
} from '@/lib/practice-search'

interface PracticeLibraryViewProps {
  library: StudentPracticeLibrary
  items: PracticeQuestionListItem[]
  total: number
  totalPages: number
  state: PracticeSearchState
  storageOwnerId: string
  exercises: PracticeExercise[]
  exercisesReady: boolean
  pinnedQuestionIds: string[]
  pinsReady: boolean
  searchHiddenFields?: Record<string, string>
  updateExerciseAction?: typeof updatePracticeExercise
  pinAction?: typeof setPracticeReviewPin
  libraryHrefBuilder?: typeof buildPracticeSearchHref
  questionHrefBuilder?: typeof buildPracticeQuestionHref
  createExerciseAction?: typeof createPracticeExercise
  exerciseHrefBuilder?: (libraryId: string, exerciseId: string) => string
  solutionLoader?: (questionId: string) => ReturnType<typeof getPracticeAttachedSolution>
}

export function PracticeLibraryView({
  library,
  items,
  totalPages,
  state,
  storageOwnerId,
  exercises,
  exercisesReady,
  pinnedQuestionIds,
  pinsReady,
  searchHiddenFields = {},
  updateExerciseAction = updatePracticeExercise,
  pinAction = setPracticeReviewPin,
  libraryHrefBuilder = buildPracticeSearchHref,
  questionHrefBuilder = buildPracticeQuestionHref,
  createExerciseAction = createPracticeExercise,
  solutionLoader,
  exerciseHrefBuilder = (libraryId, exerciseId) => `/practice/${libraryId}/exercises/${exerciseId}/take`,
}: PracticeLibraryViewProps) {
  const router = useRouter()
  const [confirm, confirmation] = useConfirm()
  const [editing, setEditing] = useState<PracticeExercise | null>(null)
  const [conflict, setConflict] = useState(false)
  const [pins, setPins] = useState(new Set(pinnedQuestionIds))
  const [pinPending, startPinTransition] = useTransition()
  const editorRef = useRef<HTMLInputElement>(null)
  const storageKey = `practice-selection:${storageOwnerId}:${library.id}`
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [naming, setNaming] = useState(false)
  const [exerciseHelpOpen, setExerciseHelpOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [questionsPerPage, setQuestionsPerPage] = useState<PracticeExerciseSettings['questionsPerPage']>(1)
  const [theme, setTheme] = useState('')
  const [exerciseSettings, setExerciseSettings] = useState<PracticeExerciseSettingsMap>({})
  const namingTriggerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    function hydrate() {
      try { setExerciseSettings(readPracticeExerciseSettings(localStorage, storageOwnerId, library.id)) } catch { /* Existing groups use stable default presentation. */ }
    }
    hydrate()
    window.addEventListener('storage', hydrate)
    return () => window.removeEventListener('storage', hydrate)
  }, [storageOwnerId, library.id])
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const requestId = useRef<string | null>(null)
  const draftKey = `${storageKey}:editing`
  useEffect(() => { setPins(new Set(pinnedQuestionIds)) }, [pinnedQuestionIds])
  useEffect(() => { if (editing) editorRef.current?.focus() }, [editing?.id])
  const selectedIds = Object.keys(selected)
  const activeExercise = exercises.find(exercise => exercise.id === state.exerciseId)
  const loadSolution = useCallback((questionId: string) => getPracticeAttachedSolution(library.id, questionId), [library.id])
  useEffect(() => {
    if (!exercisesReady) return
    setSelected({})
    try {
      const raw: unknown = JSON.parse(sessionStorage.getItem(storageKey) || '{}')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const entries = Object.entries(raw).filter(([id, value]) => isUuid(id) && typeof value === 'string')
        setSelected(Object.fromEntries(entries.slice(0, PRACTICE_EXERCISE_MAX_QUESTIONS)))
      }
      const draft: unknown = JSON.parse(sessionStorage.getItem(draftKey) || 'null')
      if (draft && typeof draft === 'object' && 'id' in draft && 'title' in draft && 'expectedRevision' in draft) {
        const found = exercises.find(group => group.id === draft.id)
        if (found && typeof draft.title === 'string' && draft.title.length <= 120
          && typeof draft.expectedRevision === 'number' && Number.isSafeInteger(draft.expectedRevision) && draft.expectedRevision > 0) {
          setEditing({ ...found, revision: draft.expectedRevision })
          setTitle(draft.title)
          setNaming(false)
        }
      }
    } catch { /* Selection remains usable when browser storage is unavailable. */ }
  }, [storageKey, exercisesReady])
  function updateSelection(next: Record<string, string>) {
    setSelected(next)
    requestId.current = null
    setError('')
    setConflict(false)
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* In-memory selection still works. */ }
  }
  function choose(item: PracticeQuestionListItem, checked: boolean) {
    if (checked && selectedIds.length >= PRACTICE_EXERCISE_MAX_QUESTIONS) return
    const next = { ...selected }
    if (checked) next[item.id] = item.title
    else delete next[item.id]
    updateSelection(next)
  }
  function rememberEdit(group: PracticeExercise | null, name: string) {
    try {
      if (group) sessionStorage.setItem(draftKey, JSON.stringify({ id: group.id, title: name, expectedRevision: group.revision }))
      else sessionStorage.removeItem(draftKey)
    } catch { /* The editor remains usable without browser storage. */ }
  }
  function clearEditor() {
    updateSelection({})
    rememberEdit(null, '')
    setEditing(null)
    setTitle('')
    setQuestionsPerPage(1)
    setTheme('')
    setNaming(false)
  }
  async function beginEdit(group: PracticeExercise) {
    if (selectedIds.length > 0 || naming) {
      const accepted = await confirm({ title: 'เปิดแก้ไขแบบฝึกหัดนี้?', description: 'รายการที่เลือกและชื่อที่ยังไม่บันทึกจะถูกแทนด้วยข้อมูลของแบบฝึกหัดนี้', confirmLabel: 'เปิดแก้ไข', cancelLabel: 'กลับไปเลือกต่อ' })
      if (!accepted) return
    }
    updateSelection(Object.fromEntries(group.questionIds.map(id => [id, group.questionTitles[id] ?? 'โจทย์ในแบบฝึกหัด'])))
    setEditing(group)
    setTitle(group.title)
    const settings = exerciseSettings[group.id] ?? defaultPracticeExerciseSettings(group.id)
    setQuestionsPerPage(settings.questionsPerPage)
    setTheme(settings.theme)
    setNaming(true)
    rememberEdit(group, group.title)
  }
  async function cancelEdit() {
    const changed = editing && (title.trim() !== editing.title || JSON.stringify(selectedIds) !== JSON.stringify(editing.questionIds))
    if (changed && !await confirm({ title: 'ยกเลิกการแก้ไข?', description: 'ชื่อและรายการโจทย์ที่เปลี่ยนไว้จะไม่ถูกบันทึก แบบฝึกหัดเดิมและประวัติการตอบยังอยู่', confirmLabel: 'ยกเลิกการแก้ไข', cancelLabel: 'แก้ไขต่อ' })) return
    clearEditor()
  }
  function saveExercise(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim() || selectedIds.length === 0 || pending) return
    requestId.current ??= crypto.randomUUID()
    const id = editing?.id ?? requestId.current
    startTransition(async () => {
      try {
        const payload = { id, libraryId: library.id, title, questionIds: selectedIds }
        const result = editing
          ? await updateExerciseAction({ ...payload, expectedRevision: editing.revision })
          : await createExerciseAction(payload)
        if (!result.ok) { setError(result.error); setConflict('conflict' in result && result.conflict === true); return }
        const savedTheme = theme || randomPracticeExerciseTheme()
        try {
          setExerciseSettings(writePracticeExerciseSettings(localStorage, storageOwnerId, library.id, id, { questionsPerPage, theme: savedTheme as PracticeExerciseSettings['theme'] }))
        } catch {
          setError('บันทึกชุดแล้ว แต่ยังเก็บธีมและจำนวนข้อต่อหน้าไม่ได้ กรุณาตรวจพื้นที่จัดเก็บแล้วกดบันทึกอีกครั้ง')
          return
        }
        const edited = Boolean(editing)
        clearEditor()
        toast.success(edited ? 'บันทึกการแก้ไขแล้ว' : 'สร้างแบบฝึกหัดแล้ว')
      } catch { setError('ยังบันทึกแบบฝึกหัดไม่ได้ กรุณาลองอีกครั้ง') }
    })
  }
  function togglePin(questionId: string) {
    const pinned = !pins.has(questionId)
    startPinTransition(async () => {
      try {
        const result = await pinAction({ libraryId: library.id, questionId, pinned })
        if (!result.ok) { toast.error(result.error); return }
        setPins(previous => {
          const next = new Set(previous)
          if (pinned) next.add(questionId)
          else next.delete(questionId)
          return next
        })
        toast.success(pinned ? 'ปักโจทย์ไว้ทบทวนแล้ว' : 'เอาปักหมุดออกแล้ว')
      } catch { toast.error('ยังบันทึกการปักโจทย์ไม่ได้ กรุณาลองอีกครั้ง') }
    })
  }
  const hasFilters = Boolean(state.q || state.tags.length > 0)
  const tagLimitReached = state.tags.length >= PRACTICE_MAX_TAGS || state.ignoredTagCount > 0

  return (
    <div className="@container flex min-w-0 w-full flex-col gap-2">
      <header className="flex min-h-7 items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="pointer-coarse:size-11"
          render={<Link href={`/practice/${library.id}`} />}
          aria-label="กลับไปหน้ารอเข้าคลังฝึก"
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-foreground">{library.title}</h1>
            <Badge role="status" variant="secondary" aria-label="แบบฝึกเอง ไม่มีคะแนน">
              <BookOpenCheck data-icon="inline-start" aria-hidden="true" />
              <span className="sm:hidden">ไม่มีคะแนน</span>
              <span className="hidden sm:inline">ฝึกเอง · ไม่มีคะแนน</span>
            </Badge>
          </div>
          {library.description && (
            <RichText text={library.description} className="line-clamp-1 text-sm text-muted-foreground" />
          )}
        </div>
      </header>

      {!activeExercise && <Card
        edge="none"
        padding="none"
        radius="md"
        className="flex flex-col gap-2 bg-transparent sm:border sm:border-border sm:bg-card sm:px-3 sm:py-2"
      >
        <Form
          action=""
          scroll={false}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 @min-[44rem]:grid-cols-[minmax(0,1fr)_minmax(12rem,0.55fr)_auto]"
        >
          {Object.entries(searchHiddenFields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
          {state.reviewOnly && <input type="hidden" name="review" value="1" />}
          {state.tags.map(tag => <input key={tag} type="hidden" name="tag" value={tag} />)}
          <div className="col-span-2 min-w-0 @min-[44rem]:col-span-1">
            <Input
              key={state.q}
              name="q"
              defaultValue={state.q}
              placeholder="ค้นหาชื่อหรือเนื้อหาโจทย์"
              aria-label="ค้นหาชื่อหรือเนื้อหาโจทย์"
            />
          </div>
          <div className="min-w-0">
            <Input
              key={state.tags.join('\u0000')}
              name="tag"
              placeholder={tagLimitReached ? 'ลบแท็กก่อนเพิ่มแท็กใหม่' : 'ค้นหาแท็ก'}
              aria-label="ค้นหาแท็ก"
              maxLength={80}
              disabled={tagLimitReached}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            className="pointer-coarse:min-h-11"
          >
            <Search data-icon="inline-start" aria-hidden="true" />
            <span className="sr-only @min-[44rem]:not-sr-only">ค้นหา</span>
          </Button>
        </Form>

        {state.tags.length > 0 && (
          <div
            role="group"
            className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-1"
            aria-label="แท็กที่ต้องมีทั้งหมด เลื่อนไปด้านข้างเพื่อดูเพิ่มเติม"
          >
            <span className="text-xs text-muted-foreground">ต้องมีทุกแท็ก:</span>
            {state.tags.map(tag => (
              <Badge
                key={tag}
                variant="outline"
                className="shrink-0 pointer-coarse:min-h-11"
                render={<Link href={libraryHrefBuilder(library.id, state, {
                  tags: state.tags.filter(value => value !== tag),
                  page: 1,
                })} />}
                aria-label={`เอาแท็ก ${tag} ออก`}
              >
                {tag}
                <X data-icon="inline-end" aria-hidden="true" />
              </Badge>
            ))}
          </div>
        )}
      </Card>}

      <section aria-labelledby="my-practice-exercises" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="my-practice-exercises" className="min-w-0 text-sm font-semibold sm:text-base">
            <Tooltip open={exerciseHelpOpen} onOpenChange={setExerciseHelpOpen}>
              <TooltipTrigger aria-describedby={exerciseHelpOpen ? 'practice-exercise-help' : undefined} className="flex items-center gap-1.5 rounded-lg py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11">
                <Layers className="size-4 shrink-0 text-primary" aria-hidden="true" />
                แบบฝึกหัดของฉัน
                <CircleHelp className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent id="practice-exercise-help" role="tooltip" side="bottom" align="start" className="flex-col items-start">
                <p>ติ๊กเลือกโจทย์ด้านล่าง แล้วตั้งชื่อเพื่อสร้างแบบฝึกหัดของตัวเอง</p>
                {exercises.length > 0 && <p>นับข้อที่กดตรวจคำตอบอย่างน้อยหนึ่งครั้ง รวมการตอบก่อนสร้างแบบฝึกหัด</p>}
              </TooltipContent>
            </Tooltip>
          </h2>
          <div role="group" className="flex flex-wrap items-center gap-1.5" aria-label="โจทย์ที่ปักไว้ทบทวน">
            <Button variant={state.reviewOnly ? 'navigation' : 'outline'} size="sm" className="pointer-coarse:min-h-11" disabled={!pinsReady}
              aria-label={state.reviewOnly ? 'กลับไปดูทุกข้อ' : `ดูข้อที่ปักไว้ (${pins.size})`}
              title={state.reviewOnly ? 'กลับไปดูทุกข้อ' : `ดูข้อที่ปักไว้ (${pins.size})`}
              render={<Link href={libraryHrefBuilder(library.id, state, { exerciseId: '', reviewOnly: !state.reviewOnly, page: 1 })} />}>
              <Bookmark data-icon="inline-start" aria-hidden="true" />
              <span className="sm:hidden">{state.reviewOnly ? 'ทุกข้อ' : `ปักไว้ (${pins.size})`}</span>
              <span className="hidden sm:inline">{state.reviewOnly ? 'กลับไปดูทุกข้อ' : `ดูข้อที่ปักไว้ (${pins.size})`}</span>
            </Button>
            {!pinsReady && <span className="text-xs text-muted-foreground">ยังโหลดข้อที่ปักไว้ไม่ได้</span>}
          </div>
        </div>
        {!exercisesReady && <Alert><AlertDescription>ยังโหลดแบบฝึกหัดไม่ได้ กรุณาลองโหลดหน้าอีกครั้ง</AlertDescription></Alert>}
        {exercises.length > 0 && <div className="grid gap-2 @min-[32rem]:grid-cols-2 @min-[44rem]:grid-cols-3">
          {exercises.map(exercise => <PracticeExerciseCard key={exercise.id} exercise={exercise}
            settings={exerciseSettings[exercise.id] ?? defaultPracticeExerciseSettings(exercise.id)}
            selected={exercise.questionIds.every(id => selected[id] !== undefined)} disabled={pending || !exercisesReady}
            onSelect={checked => {
              const next = { ...selected }
              for (const id of exercise.questionIds) {
                if (!checked) delete next[id]
                else if (Object.keys(next).length < PRACTICE_EXERCISE_MAX_QUESTIONS) next[id] = exercise.questionTitles[id]
              }
              updateSelection(next)
            }}
            onEdit={() => { namingTriggerRef.current = document.activeElement as HTMLElement; void beginEdit(exercise) }}
            startHref={exerciseHrefBuilder(library.id, exercise.id)} />)}
        </div>}
      </section>

      <Card radius="md" padding="none" className="flex flex-col gap-2 px-3 py-1.5">
        {editing && <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="min-w-0 break-words text-sm font-semibold">กำลังแก้ไข: {editing.title}</h3>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" className="pointer-coarse:min-h-11" render={<Link href={libraryHrefBuilder(library.id, state, { exerciseId: '', reviewOnly: false, page: 1 })} />}>เพิ่มโจทย์จากคลัง</Button>
            <Button size="sm" onClick={event => { namingTriggerRef.current = event.currentTarget; setNaming(true) }}>ตั้งค่าและบันทึก</Button>
          </div>
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex min-h-7 cursor-pointer items-center gap-2 text-sm pointer-coarse:min-h-11">
            <input type="checkbox" className="shrink-0 accent-primary" aria-label="เลือกทุกข้อในหน้านี้" disabled={!exercisesReady || pending || items.length === 0}
              checked={items.length > 0 && items.every(item => selected[item.id] !== undefined)}
              onChange={event => {
                const next = { ...selected }
                for (const item of items) {
                  if (!event.target.checked) delete next[item.id]
                  else if (Object.keys(next).length < PRACTICE_EXERCISE_MAX_QUESTIONS) next[item.id] = item.title
                }
                updateSelection(next)
              }} /><span><span className="sm:hidden">ทั้งหน้า</span><span className="hidden sm:inline">เลือกทุกข้อในหน้านี้</span>
                {selectedIds.length > 0 && <span className="block text-xs text-muted-foreground"><span className="hidden sm:inline">เลือกข้ามหน้าและตัวกรองได้ </span>สูงสุด {PRACTICE_EXERCISE_MAX_QUESTIONS} ข้อ</span>}
              </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span role="status" aria-label={`เลือกแล้ว ${selectedIds.length} ข้อ`} className="text-xs text-muted-foreground"><span className="hidden sm:inline">เลือกแล้ว </span>{selectedIds.length} ข้อ</span>
            {selectedIds.length > 0 && <Button variant="ghost" size="sm" className="pointer-coarse:min-h-11" disabled={pending} aria-label="ล้างที่เลือก" title="ล้างที่เลือก" onClick={() => updateSelection({})}>
              <X data-icon="inline-start" className="sm:hidden" aria-hidden="true" /><span className="hidden sm:inline">ล้างที่เลือก</span>
            </Button>}
            {!editing && <Button size="sm" className="pointer-coarse:min-h-11" aria-label="สร้างแบบฝึกหัด" title="สร้างแบบฝึกหัด" disabled={!exercisesReady || selectedIds.length === 0 || pending} onClick={event => { namingTriggerRef.current = event.currentTarget; setNaming(true) }}>
              <Plus data-icon="inline-start" aria-hidden="true" /><span className="hidden sm:inline">สร้างแบบฝึกหัด</span>
            </Button>}
          </div>
        </div>

      </Card>

      {(activeExercise || hasFilters) && <div className="flex items-center justify-end gap-2 text-xs">
        {activeExercise && <Button variant="link" size="sm" className="min-h-11 shrink-0" render={<Link href={libraryHrefBuilder(library.id, state, { exerciseId: '', page: 1 })} />}>ดูโจทย์ทั้งหมด</Button>}
        {hasFilters && !activeExercise && (
          <Button
            variant="link"
            size="sm"
            className="min-h-[44px]"
            render={<Link href={libraryHrefBuilder(library.id, state, { q: '', tags: [], page: 1 })} />}
          >
            ล้างตัวกรอง
          </Button>
        )}
      </div>}

      <SolutionLoaderProvider loader={solutionLoader ?? loadSolution}>
        {items.length === 0 ? (
          <Empty className="min-h-56 border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Search aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>{state.reviewOnly ? 'ยังไม่มีโจทย์ที่ปักไว้ตามตัวกรองนี้' : hasFilters ? 'ไม่พบโจทย์ตามตัวกรองนี้' : 'คลังนี้ยังไม่มีโจทย์'}</EmptyTitle>
              <EmptyDescription>
                {state.reviewOnly ? 'กดปักไว้ทบทวนบนการ์ดโจทย์ แล้วกลับมาดูได้ที่นี่' : hasFilters
                  ? 'ลองลดจำนวนแท็กหรือเปลี่ยนคำค้น แล้วค้นหาอีกครั้ง'
                  : 'เมื่อครูเพิ่มโจทย์และเผยแพร่แล้ว รายการจะปรากฏตรงนี้'}
              </EmptyDescription>
            </EmptyHeader>
            {hasFilters && (
              <EmptyContent>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  render={<Link href={libraryHrefBuilder(library.id, state, { q: '', tags: [], page: 1 })} />}
                >
                  ล้างตัวกรอง
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <ol className="grid grid-cols-1 gap-3 @min-[44rem]:grid-cols-2" aria-label="รายการโจทย์ในคลังฝึก">
            {items.map(item => <li key={item.id} id={`practice-question-${item.id}`} className="min-w-0 scroll-mt-20">
              <PracticeQuestionCard item={item} href={questionHrefBuilder(library.id, item.id, state)}
                selected={selected[item.id] !== undefined} onSelect={checked => choose(item, checked)}
                pinned={pins.has(item.id)} onTogglePin={() => togglePin(item.id)} pinDisabled={!pinsReady || pinPending}
                selectionDisabled={!exercisesReady || pending || (selectedIds.length >= PRACTICE_EXERCISE_MAX_QUESTIONS && selected[item.id] === undefined)} />
            </li>)}
          </ol>
        )}
      </SolutionLoaderProvider>

      <Dialog open={naming} onOpenChange={(open, details) => {
        if (open) { setNaming(true); return }
        details.cancel()
        if (pending) return
        if (details.reason === 'outside-press' || details.reason === 'escape-key') {
          void confirm({ title: 'ปิดการตั้งชื่อแบบฝึกหัด?', description: 'ชื่อและการตั้งค่าที่ยังไม่บันทึกจะถูกยกเลิก รายการโจทย์ที่เลือกยังอยู่', confirmLabel: 'ยืนยันปิด', cancelLabel: 'กลับไปดำเนินการต่อ' }).then(accepted => {
            if (accepted) { setNaming(false); setEditing(null); setTitle(''); rememberEdit(null, '') }
          })
        } else if (editing) void cancelEdit()
        else { setNaming(false); setTitle('') }
      }}>
        <DialogContent className="sm:max-w-md" initialFocus={editorRef} finalFocus={namingTriggerRef}>
          <DialogHeader>
            <DialogTitle>{editing ? 'แก้ไขแบบฝึกหัดของฉัน' : 'สร้างแบบฝึกหัดของฉัน'}</DialogTitle>
            <DialogDescription>{selectedIds.length} ข้อที่เลือก · ไม่เลือกสี ระบบจะสุ่มให้</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveExercise} className="flex flex-col gap-3">
          <FieldGroup className="min-w-0"><Field className="gap-1" data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="practice-exercise-name">ชื่อแบบฝึกหัด</FieldLabel>
            <Input ref={editorRef} id="practice-exercise-name" value={title} maxLength={120} required autoFocus disabled={pending}
              placeholder="เช่น ทบทวนกฎของนิวตัน" aria-invalid={Boolean(error)}
              onChange={event => { setTitle(event.target.value); rememberEdit(editing, event.target.value); requestId.current = null; setError('') }} />
          </Field></FieldGroup>
          <FieldGroup className="gap-3"><Field className="gap-1">
            <FieldLabel htmlFor="practice-exercise-page-size">โจทย์ต่อหน้า</FieldLabel>
            <NativeSelect id="practice-exercise-page-size" value={questionsPerPage} disabled={pending} onChange={event => setQuestionsPerPage(Number(event.target.value) as PracticeExerciseSettings['questionsPerPage'])}>
              {PRACTICE_EXERCISE_PAGE_SIZES.map(size => <option key={size} value={size}>{size} ข้อต่อหน้า</option>)}
            </NativeSelect>
          </Field></FieldGroup>
          <ClassroomCoverThemePicker value={theme} onValueChange={setTheme} disabled={pending} allowAuto />
          {editing && <div className="flex flex-col gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { rememberEdit(editing, title); setNaming(false) }}>เลือกโจทย์เพิ่มจากคลัง</Button>
            <ol className="flex max-h-60 flex-col gap-1 overflow-y-auto" aria-label="โจทย์ที่เลือกในแบบฝึกหัด">
              {selectedIds.map(id => <li key={id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm">{selected[id]}</span>
                <Button type="button" variant="ghost" className="min-h-11 shrink-0" disabled={pending}
                  aria-label={`เอา ${selected[id]} ออกจากแบบฝึกหัด`}
                  onClick={() => { const next = { ...selected }; delete next[id]; updateSelection(next) }}>
                  <Minus data-icon="inline-start" aria-hidden="true" />เอาออก
                </Button>
              </li>)}
            </ol>
          </div>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" className="pointer-coarse:min-h-11" disabled={pending || !title.trim() || selectedIds.length === 0}>{pending ? 'กำลังบันทึก…' : `${editing ? 'บันทึกการแก้ไข' : 'บันทึกแบบฝึกหัด'} ${selectedIds.length} ข้อ`}</Button>
            <Button type="button" variant="outline" size="sm" className="pointer-coarse:min-h-11" disabled={pending} onClick={() => { if (editing) void cancelEdit(); else { setNaming(false); setTitle('') } }}>{editing ? 'ยกเลิกการแก้ไข' : 'ยกเลิก'}</Button>
          </div>
          {error && <p role="alert" className="text-sm text-destructive @min-[44rem]:col-span-2">{error}</p>}
          {conflict && <Button type="button" variant="outline" className="min-h-11" onClick={async () => {
            if (await confirm({ title: 'โหลดข้อมูลล่าสุด?', description: 'การแก้ไขที่ยังไม่บันทึกจะถูกยกเลิก จากนั้นเปิดแก้ไขแบบฝึกหัดอีกครั้งได้', confirmLabel: 'โหลดข้อมูลล่าสุด', cancelLabel: 'กลับไปแก้ไข' })) {
              clearEditor(); router.refresh()
            }
          }}>โหลดข้อมูลล่าสุด</Button>}
          </form>
        </DialogContent>
      </Dialog>

      {confirmation}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1 sm:gap-2" aria-label="หน้ารายการโจทย์">
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            disabled={state.page <= 1}
            render={state.page > 1
              ? <Link href={libraryHrefBuilder(library.id, state, { page: state.page - 1 })} />
              : undefined}
          >
            <ChevronLeft data-icon="inline-start" aria-hidden="true" />
            ก่อนหน้า
          </Button>
          <span className="w-20 shrink-0 truncate text-center text-sm text-muted-foreground sm:w-24">
            หน้า {state.page.toLocaleString('th-TH')} / {totalPages.toLocaleString('th-TH')}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            disabled={state.page >= totalPages}
            render={state.page < totalPages
              ? <Link href={libraryHrefBuilder(library.id, state, { page: state.page + 1 })} />
              : undefined}
          >
            ถัดไป
            <ChevronRight data-icon="inline-end" aria-hidden="true" />
          </Button>
        </nav>
      )}
    </div>
  )
}
