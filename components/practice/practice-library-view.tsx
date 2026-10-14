import Link from 'next/link'
import {
  ArrowLeft,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
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
import { TYPE_LABEL } from '@/lib/question-display'
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
import { cn } from '@/lib/utils'

interface PracticeLibraryViewProps {
  library: StudentPracticeLibrary
  items: PracticeQuestionListItem[]
  total: number
  totalPages: number
  state: PracticeSearchState
}

export function PracticeLibraryView({
  library,
  items,
  total,
  totalPages,
  state,
}: PracticeLibraryViewProps) {
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

      <Card
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
      </Card>

      <div className="flex min-h-8 items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">พบ {total.toLocaleString('th-TH')} ข้อ</p>
        {hasFilters && (
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

      <Card className="overflow-hidden">
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
          <ol className="divide-y divide-border">
            {items.map(item => {
              const questionHref = buildPracticeQuestionHref(library.id, item.id, state)
              return (
                <li
                  key={item.id}
                  id={`practice-question-${item.id}`}
                  className="scroll-mt-20"
                >
                  <Link
                    href={questionHref}
                    className="group flex min-h-[64px] items-center gap-2 overflow-hidden px-2 py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:gap-3 sm:px-3"
                  >
                    <span className="w-7 shrink-0 text-center text-sm tabular-nums text-muted-foreground sm:w-9">
                      {item.position + 1}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                          {item.title}
                        </span>
                        <Badge variant="outline" className="hidden sm:inline-flex">
                          {TYPE_LABEL[item.questionType] ?? item.questionType}
                        </Badge>
                      </span>
                      <span className="flex min-w-0 items-center gap-1 overflow-hidden">
                        {item.tags.slice(0, 3).map((tag, index) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className={cn(
                              'min-w-0 max-w-full',
                              index === 0 && 'shrink',
                              index > 0 && 'hidden sm:inline-flex',
                            )}
                          >
                            <span className="truncate">{tag}</span>
                          </Badge>
                        ))}
                        {item.tags.length > 1 && (
                          <span className="shrink-0 text-xs text-muted-foreground sm:hidden">
                            +{item.tags.length - 1}
                          </span>
                        )}
                        {item.tags.length > 3 && (
                          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                            +{item.tags.length - 3}
                          </span>
                        )}
                      </span>
                    </span>
                    <Badge
                      variant={item.attemptCount > 0 ? 'statusSuccess' : 'outline'}
                      className="max-w-[64px] sm:hidden"
                      aria-label={item.attemptCount > 0
                        ? `ตอบแล้ว ${item.attemptCount.toLocaleString('th-TH')} ครั้ง`
                        : 'ยังไม่เคยตอบ'}
                    >
                      <span className="truncate">
                        {item.attemptCount > 0
                          ? `×${item.attemptCount.toLocaleString('th-TH')}`
                          : 'ใหม่'}
                      </span>
                    </Badge>
                    <Badge
                      variant={item.attemptCount > 0 ? 'statusSuccess' : 'outline'}
                      className="hidden sm:inline-flex"
                    >
                      {item.attemptCount > 0 ? `ตอบแล้ว ${item.attemptCount} ครั้ง` : 'ยังไม่เคยตอบ'}
                    </Badge>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </Card>

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
