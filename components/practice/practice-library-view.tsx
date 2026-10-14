'use client'

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
import { createPracticeExercise, getPracticeAttachedSolution } from '@/lib/actions/practice-exercises'
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
  createExerciseAction = createPracticeExercise,
  solutionLoader,
}: PracticeLibraryViewProps) {
  const storageKey = `practice-selection:${storageOwnerId}:${library.id}`
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [naming, setNaming] = useState(false)
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const requestId = useRef<string | null>(null)
  const selectedIds = Object.keys(selected)
  const activeExercise = exercises.find(exercise => exercise.id === state.exerciseId)
  const loadSolution = useCallback((questionId: string) => getPracticeAttachedSolution(library.id, questionId), [library.id])
  useEffect(() => {
    setSelected({})
    try {
      const raw: unknown = JSON.parse(sessionStorage.getItem(storageKey) || '{}')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const entries = Object.entries(raw).filter(([id, value]) => /^[0-9a-f-]{36}$/i.test(id) && typeof value === 'string')
        setSelected(Object.fromEntries(entries.slice(0, PRACTICE_EXERCISE_MAX_QUESTIONS)))
      }
    } catch { /* Selection remains usable when browser storage is unavailable. */ }
  }, [storageKey])
  function updateSelection(next: Record<string, string>) {
    setSelected(next)
    requestId.current = null
    setError('')
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* In-memory selection still works. */ }
  }
  function choose(item: PracticeQuestionListItem, checked: boolean) {
    if (checked && selectedIds.length >= PRACTICE_EXERCISE_MAX_QUESTIONS) return
    const next = { ...selected }
    if (checked) next[item.id] = item.title
    else delete next[item.id]
    updateSelection(next)
  }
  function saveExercise(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim() || selectedIds.length === 0 || pending) return
    requestId.current ??= crypto.randomUUID()
    const id = requestId.current
    startTransition(async () => {
      try {
        const result = await createExerciseAction({ id, libraryId: library.id, title, questionIds: selectedIds })
        if (!result.ok) { setError(result.error); return }
        updateSelection({})
        setTitle('')
        setNaming(false)
        toast.success('สร้างแบบฝึกหัดแล้ว')
      } catch { setError('ยังบันทึกแบบฝึกหัดไม่ได้ กรุณาลองอีกครั้ง') }
    })
  }
  const hasFilters = Boolean(state.q || state.tags.length > 0)
  const tagLimitReached = state.tags.length >= PRACTICE_MAX_TAGS || state.ignoredTagCount > 0

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <header className="flex min-h-[64px] items-center gap-3">
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
        className="flex flex-col gap-2 bg-transparent sm:rounded-2xl sm:border sm:border-border sm:bg-card sm:p-4"
      >
        <form
          method="get"
          className="grid grid-cols-[minmax(0,1fr)_44px] gap-2 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.55fr)_auto]"
        >
          {state.tags.map(tag => <input key={tag} type="hidden" name="tag" value={tag} />)}
          <label className="col-span-2 flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground md:col-span-1">
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
            className="size-11 self-end md:w-auto md:px-4"
          >
            <Search data-icon="inline-start" aria-hidden="true" />
            <span className="sr-only md:not-sr-only">ค้นหา</span>
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
                render={<Link href={buildPracticeSearchHref(library.id, state, {
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

      <section aria-labelledby="my-practice-exercises" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="my-practice-exercises" className="flex items-center gap-2 text-base font-semibold">
            <Layers className="size-5 text-primary" aria-hidden="true" />แบบฝึกหัดของฉัน
          </h2>
          {activeExercise && <Button variant="outline" className="min-h-11" render={<Link href={buildPracticeSearchHref(library.id, state, { exerciseId: '', page: 1 })} />}>ดูโจทย์ทั้งหมด</Button>}
        </div>
        {!exercisesReady && <Alert><AlertDescription>ยังโหลดแบบฝึกหัดไม่ได้ กรุณาลองโหลดหน้าอีกครั้ง</AlertDescription></Alert>}
        {exercisesReady && exercises.length === 0 && <p className="text-sm text-muted-foreground">ติ๊กเลือกโจทย์ด้านล่าง แล้วตั้งชื่อเพื่อสร้างแบบฝึกหัดของตัวเอง</p>}
        {exercises.length > 0 && <div className="grid gap-3 sm:grid-cols-2">
          {exercises.map(exercise => <Link key={exercise.id}
            href={buildPracticeSearchHref(library.id, state, { exerciseId: exercise.id, q: '', tags: [], page: 1 })}
            aria-current={activeExercise?.id === exercise.id ? 'page' : undefined}
            className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card padding="md" interactive className={activeExercise?.id === exercise.id ? 'border-primary/50' : undefined}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-2 text-sm font-semibold">{exercise.title}</h3>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">ตอบแล้ว {exercise.attemptedCount} จาก {exercise.questionIds.length} ข้อ</p>
              <Progress className="mt-2" value={exercise.attemptedCount / exercise.questionIds.length * 100} aria-label={`ความคืบหน้า ${exercise.title}`} />
            </Card>
          </Link>)}
        </div>}
        {exercises.length > 0 && <p className="text-xs text-muted-foreground">นับข้อที่กดตรวจคำตอบอย่างน้อยหนึ่งครั้ง รวมการตอบก่อนสร้างแบบฝึกหัด</p>}
      </section>

      <Card padding="md" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="size-5 accent-primary" disabled={!exercisesReady || pending || items.length === 0}
              checked={items.length > 0 && items.every(item => selected[item.id] !== undefined)}
              onChange={event => {
                const next = { ...selected }
                for (const item of items) {
                  if (!event.target.checked) delete next[item.id]
                  else if (Object.keys(next).length < PRACTICE_EXERCISE_MAX_QUESTIONS) next[item.id] = item.title
                }
                updateSelection(next)
              }} />เลือกทุกข้อในหน้านี้
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span role="status" className="text-sm text-muted-foreground">เลือกแล้ว {selectedIds.length} ข้อ</span>
            {selectedIds.length > 0 && <Button variant="ghost" className="min-h-11" disabled={pending} onClick={() => updateSelection({})}>ล้างที่เลือก</Button>}
            <Button className="min-h-11" disabled={!exercisesReady || selectedIds.length === 0 || pending} onClick={() => setNaming(true)}>
              <Plus data-icon="inline-start" aria-hidden="true" />สร้างแบบฝึกหัด
            </Button>
          </div>
        </div>
        {selectedIds.length > 0 && <p className="text-xs text-muted-foreground">เลือกข้ามหน้าและตัวกรองได้ สูงสุด {PRACTICE_EXERCISE_MAX_QUESTIONS} ข้อ</p>}
        {naming && <form onSubmit={saveExercise} className="flex flex-col gap-3">
          <FieldGroup><Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="practice-exercise-name">ชื่อแบบฝึกหัด</FieldLabel>
            <Input id="practice-exercise-name" value={title} maxLength={120} required autoFocus disabled={pending}
              placeholder="เช่น ทบทวนกฎของนิวตัน" aria-invalid={Boolean(error)}
              onChange={event => { setTitle(event.target.value); requestId.current = null; setError('') }} />
          </Field></FieldGroup>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="min-h-11" disabled={pending || !title.trim() || selectedIds.length === 0}>{pending ? 'กำลังบันทึก…' : `บันทึกแบบฝึกหัด ${selectedIds.length} ข้อ`}</Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => setNaming(false)}>พักการตั้งชื่อ</Button>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </form>}
      </Card>

      <div className="flex min-h-8 items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">{activeExercise ? `${activeExercise.title} · ` : ''}พบ {total.toLocaleString('th-TH')} ข้อ</p>
        {hasFilters && !activeExercise && (
          <Button
            variant="link"
            size="sm"
            className="min-h-[44px]"
            render={<Link href={buildPracticeSearchHref(library.id, state, { q: '', tags: [], page: 1 })} />}
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
              <EmptyTitle>{hasFilters ? 'ไม่พบโจทย์ตามตัวกรองนี้' : 'คลังนี้ยังไม่มีโจทย์'}</EmptyTitle>
              <EmptyDescription>
                {hasFilters
                  ? 'ลองลดจำนวนแท็กหรือเปลี่ยนคำค้น แล้วค้นหาอีกครั้ง'
                  : 'เมื่อครูเพิ่มโจทย์และเผยแพร่แล้ว รายการจะปรากฏตรงนี้'}
              </EmptyDescription>
            </EmptyHeader>
            {hasFilters && (
              <EmptyContent>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  render={<Link href={buildPracticeSearchHref(library.id, state, { q: '', tags: [], page: 1 })} />}
                >
                  ล้างตัวกรอง
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <ol className="flex flex-col gap-3">
            {items.map(item => <li key={item.id} id={`practice-question-${item.id}`} className="scroll-mt-20">
              <PracticeQuestionCard item={item} href={buildPracticeQuestionHref(library.id, item.id, state)}
                selected={selected[item.id] !== undefined} onSelect={checked => choose(item, checked)}
                selectionDisabled={!exercisesReady || pending || (selectedIds.length >= PRACTICE_EXERCISE_MAX_QUESTIONS && selected[item.id] === undefined)} />
            </li>)}
          </ol>
        )}
      </SolutionLoaderProvider>

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1 sm:gap-2" aria-label="หน้ารายการโจทย์">
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            disabled={state.page <= 1}
            render={state.page > 1
              ? <Link href={buildPracticeSearchHref(library.id, state, { page: state.page - 1 })} />
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
              ? <Link href={buildPracticeSearchHref(library.id, state, { page: state.page + 1 })} />
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
