'use client'

import { useRouter } from 'next/navigation'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { isUuid } from '@/lib/practice-library-contracts'
import { cn } from '@/lib/utils'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  ArrowLeft,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Plus,
  Layers,
  Pencil,
  Bookmark,
  Minus,
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
import { Progress } from '@/components/ui/progress'
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  solutionLoader?: (questionId: string) => ReturnType<typeof getPracticeAttachedSolution>
}

export function PracticeLibraryView({
  library,
  items,
  total,
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
  const [title, setTitle] = useState('')
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
          setNaming(true)
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
    <div className="@container flex min-w-0 w-full flex-col gap-3">
      <header className="flex min-h-11 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-[44px]"
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
        <form
          method="get"
          className="grid grid-cols-[minmax(0,1fr)_44px] gap-2 @min-[44rem]:grid-cols-[minmax(0,1fr)_minmax(12rem,0.55fr)_auto]"
        >
          {Object.entries(searchHiddenFields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
          {state.reviewOnly && <input type="hidden" name="review" value="1" />}
          {state.tags.map(tag => <input key={tag} type="hidden" name="tag" value={tag} />)}
          <label className="col-span-2 flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground @min-[44rem]:col-span-1">
            ค้นหาชื่อหรือเนื้อหาโจทย์
            <Input
              name="q"
              defaultValue={state.q}
              placeholder="เช่น กฎของนิวตัน"
              aria-label="ค้นหาชื่อหรือเนื้อหาโจทย์"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
            เพิ่มแท็กที่ต้องมี
            <Input
              name="tag"
              placeholder={tagLimitReached ? 'ลบแท็กก่อนเพิ่มแท็กใหม่' : 'เช่น สอวน.ค่าย 1'}
              aria-label="เพิ่มแท็กที่ต้องมี"
              aria-describedby="practice-tag-limit"
              maxLength={80}
              disabled={tagLimitReached}
            />
          </label>
          <Button
            type="submit"
            size="icon"
            className="size-11 self-end @min-[44rem]:w-auto @min-[44rem]:px-4"
          >
            <Search data-icon="inline-start" aria-hidden="true" />
            <span className="sr-only @min-[44rem]:not-sr-only">ค้นหา</span>
          </Button>
        </form>

        <p id="practice-tag-limit" className="text-xs text-muted-foreground">
          เลือกได้สูงสุด {PRACTICE_MAX_TAGS} แท็กต่อการค้นหา
          {state.ignoredTagCount > 0
            ? ` · ระบบไม่ได้ใช้ ${state.ignoredTagCount.toLocaleString('th-TH')} แท็กที่เกินขีดจำกัด URL`
            : ''}
        </p>

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
                className="min-h-11 shrink-0"
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
          <h2 id="my-practice-exercises" className="flex items-center gap-2 text-base font-semibold">
            <Layers className="size-5 text-primary" aria-hidden="true" />แบบฝึกหัดของฉัน
          </h2>
          <div className="flex flex-wrap items-center gap-1.5" aria-label="โจทย์ที่ปักไว้ทบทวน">
            <Button variant={state.reviewOnly ? 'navigation' : 'outline'} size="sm" className="min-h-11 px-3" disabled={!pinsReady}
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
        {exercisesReady && exercises.length === 0 && <p className="text-xs text-muted-foreground">ติ๊กเลือกโจทย์ด้านล่าง แล้วตั้งชื่อเพื่อสร้างแบบฝึกหัดของตัวเอง</p>}
        {exercises.length > 0 && <div className="grid gap-2 @min-[38rem]:grid-cols-2 @min-[62rem]:grid-cols-3">
          {exercises.map(exercise => <Card key={exercise.id} radius="md" padding="none" className={cn('flex items-center gap-2 px-3 py-2', activeExercise?.id === exercise.id && 'border-primary/50')}>
            <Link href={libraryHrefBuilder(library.id, state, { exerciseId: exercise.id, reviewOnly: false, q: '', tags: [], page: 1 })}
              aria-current={activeExercise?.id === exercise.id ? 'page' : undefined}
              className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-1 text-sm font-semibold" title={exercise.title}>{exercise.title}</h3>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </div>
              <div className="flex items-center gap-2">
                <p className="shrink-0 text-xs text-muted-foreground">ตอบแล้ว {exercise.attemptedCount} จาก {exercise.questionIds.length} ข้อ</p>
                <Progress className="min-w-8 flex-1" value={exercise.attemptedCount / exercise.questionIds.length * 100} aria-label={`ความคืบหน้า ${exercise.title}`} />
              </div>
            </Link>
            <Button variant="ghost" size="icon" className="size-11 shrink-0" disabled={pending} onClick={() => void beginEdit(exercise)} aria-label={`แก้ไข ${exercise.title}`} title="แก้ชื่อและโจทย์">
              <Pencil aria-hidden="true" />
            </Button>
          </Card>)}
        </div>}
        {exercises.length > 0 && <p className="text-xs text-muted-foreground">นับข้อที่กดตรวจคำตอบอย่างน้อยหนึ่งครั้ง รวมการตอบก่อนสร้างแบบฝึกหัด</p>}
      </section>

      <Card radius="md" padding="none" className="flex flex-col gap-2 px-3 py-1.5">
        {editing && <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="min-w-0 break-words text-sm font-semibold">กำลังแก้ไข: {editing.title}</h3>
          <Button variant="outline" className="min-h-11" render={<Link href={libraryHrefBuilder(library.id, state, { exerciseId: '', reviewOnly: false, page: 1 })} />}>เพิ่มโจทย์จากคลัง</Button>
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
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
            {selectedIds.length > 0 && <Button variant="ghost" className="min-h-11 px-3" disabled={pending} aria-label="ล้างที่เลือก" title="ล้างที่เลือก" onClick={() => updateSelection({})}>
              <X data-icon="inline-start" className="sm:hidden" aria-hidden="true" /><span className="hidden sm:inline">ล้างที่เลือก</span>
            </Button>}
            {!editing && <Button className="min-h-11 px-3" aria-label="สร้างแบบฝึกหัด" title="สร้างแบบฝึกหัด" disabled={!exercisesReady || selectedIds.length === 0 || pending} onClick={() => setNaming(true)}>
              <Plus data-icon="inline-start" aria-hidden="true" /><span className="hidden sm:inline">สร้างแบบฝึกหัด</span>
            </Button>}
          </div>
        </div>
        {naming && <form onSubmit={saveExercise} className={cn('gap-2', editing ? 'flex flex-col' : 'grid @min-[44rem]:grid-cols-[minmax(0,1fr)_auto] @min-[44rem]:items-end')}>
          <FieldGroup className="min-w-0"><Field className="gap-1" data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="practice-exercise-name">ชื่อแบบฝึกหัด</FieldLabel>
            <Input ref={editorRef} id="practice-exercise-name" value={title} maxLength={120} required autoFocus disabled={pending}
              placeholder="เช่น ทบทวนกฎของนิวตัน" aria-invalid={Boolean(error)}
              onChange={event => { setTitle(event.target.value); rememberEdit(editing, event.target.value); requestId.current = null; setError('') }} />
          </Field></FieldGroup>
          {editing && <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">ติ๊กเลือกเพื่อเพิ่มโจทย์ หรือเอาข้อออกด้านล่าง ต้องเหลืออย่างน้อย 1 ข้อ</p>
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
            <Button type="submit" className="min-h-11" disabled={pending || !title.trim() || selectedIds.length === 0}>{pending ? 'กำลังบันทึก…' : `${editing ? 'บันทึกการแก้ไข' : 'บันทึกแบบฝึกหัด'} ${selectedIds.length} ข้อ`}</Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => editing ? void cancelEdit() : setNaming(false)}>{editing ? 'ยกเลิกการแก้ไข' : 'พักการตั้งชื่อ'}</Button>
          </div>
          {error && <p role="alert" className="text-sm text-destructive @min-[44rem]:col-span-2">{error}</p>}
          {conflict && <Button type="button" variant="outline" className="min-h-11" onClick={async () => {
            if (await confirm({ title: 'โหลดข้อมูลล่าสุด?', description: 'การแก้ไขที่ยังไม่บันทึกจะถูกยกเลิก จากนั้นเปิดแก้ไขแบบฝึกหัดอีกครั้งได้', confirmLabel: 'โหลดข้อมูลล่าสุด', cancelLabel: 'กลับไปแก้ไข' })) {
              clearEditor(); router.refresh()
            }
          }}>โหลดข้อมูลล่าสุด</Button>}
        </form>}
      </Card>

      <div className="flex min-h-6 items-center justify-between gap-2 text-xs">
        <p className="text-muted-foreground">{activeExercise ? `${activeExercise.title} · ` : ''}พบ {total.toLocaleString('th-TH')} ข้อ</p>
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
      </div>

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
