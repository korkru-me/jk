'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Lightbulb, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { getAttemptSolutions } from '@/lib/actions/attempt-solutions'
import { submitSubmission } from '@/lib/actions/submissions'
import { attemptItemHasSolution, type AttemptSolutionItem } from '@/lib/attempt-solutions'
import { cn } from '@/lib/utils'

/**
 * The เฉลยวิธีทำ viewer on a student's summary page: one ข้อ at a time, with
 * ข้อก่อนหน้า / ข้อถัดไป, a strip to jump to any ข้อ, and ←/→ on the keyboard.
 *
 * The page renders this only once the server has decided the เฉลย is open
 * (lib/solution-release.ts); the เฉลย itself is fetched on the first press,
 * through a Server Action that decides it again, so nothing reaches the
 * browser before then. Fetched once per visit and kept — a student paging
 * back and forth, or jumping in from a ข้อ in the list below, reads it again
 * from memory.
 */

type BodyModule = typeof import('./attempt-solution-body')

let bodyModule: Promise<BodyModule> | null = null

/** The viewer's body — KaTeX among it — fetched once per page and forgotten
 *  on failure, so the next press tries again. */
function loadBody(): Promise<BodyModule> {
  bodyModule ??= import('./attempt-solution-body').catch(error => {
    bodyModule = null
    throw error
  })
  return bodyModule
}

/** Starts that fetch on hover or focus, so it is usually done by the click. */
function preloadBody() {
  loadBody().catch(() => {
    // The press that needs it will say so.
  })
}

export type AttemptSolutionsLoader = (submissionId: string) => ReturnType<typeof getAttemptSolutions>

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; items: AttemptSolutionItem[]; Body: BodyModule['AttemptSolutionBody'] }
  | { status: 'error'; message: string }

const CONNECTION_FAILED = 'โหลดเฉลยไม่สำเร็จ — ตรวจการเชื่อมต่อแล้วลองอีกครั้ง'

interface Viewer {
  /** Opens on that ข้อ, or where the student last left off. */
  openAt: (answerId?: string) => void
}

const ViewerContext = createContext<Viewer | null>(null)

function useViewer(): Viewer {
  const viewer = useContext(ViewerContext)
  if (!viewer) throw new Error('AttemptSolutionsProvider is missing')
  return viewer
}

export function AttemptSolutionsProvider({ submissionId, loader = getAttemptSolutions, children }: {
  submissionId: string
  /** Where the เฉลย comes from — the Server Action, unless a QA lab swaps in
   *  synthetic ones. */
  loader?: AttemptSolutionsLoader
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  // Kept mounted after the first open, so closing can animate out.
  const [mounted, setMounted] = useState(false)
  const [load, setLoad] = useState<LoadState>({ status: 'idle' })
  const [index, setIndex] = useState(0)
  const target = useRef<string | null>(null)

  const fetchItems = useCallback(() => {
    setLoad({ status: 'loading' })
    Promise.all([loader(submissionId), loadBody()])
      .then(([result, body]) => {
        if ('error' in result) {
          setLoad({ status: 'error', message: result.error })
          return
        }
        const { items } = result.data
        const at = target.current ? items.findIndex(item => item.answerId === target.current) : -1
        setIndex(Math.max(at, 0))
        setLoad({ status: 'ready', items, Body: body.AttemptSolutionBody })
      })
      .catch(() => setLoad({ status: 'error', message: CONNECTION_FAILED }))
  }, [loader, submissionId])

  const openAt = useCallback((answerId?: string) => {
    target.current = answerId ?? null
    setMounted(true)
    setOpen(true)
    if (load.status === 'ready') {
      const at = answerId ? load.items.findIndex(item => item.answerId === answerId) : -1
      if (at >= 0) setIndex(at)
      return
    }
    if (load.status !== 'loading') fetchItems()
  }, [load, fetchItems])

  return (
    <ViewerContext value={{ openAt }}>
      {children}
      {mounted && (
        <AttemptSolutionsDialog
          open={open}
          onOpenChange={setOpen}
          load={load}
          index={index}
          onIndexChange={setIndex}
          onRetry={fetchItems}
        />
      )}
    </ViewerContext>
  )
}

function AttemptSolutionsDialog({ open, onOpenChange, load, index, onIndexChange, onRetry }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  load: LoadState
  index: number
  onIndexChange: (index: number) => void
  onRetry: () => void
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLElement>(null)
  const items = load.status === 'ready' ? load.items : []
  const item = items[index] ?? null
  const isLast = index >= items.length - 1
  const showStrip = items.length > 1

  // A new ข้อ starts at its top, and its number stays in sight in the strip.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
    stripRef.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [index, load.status])

  function go(delta: number) {
    if (items.length === 0) return
    onIndexChange(Math.min(Math.max(index + delta, 0), items.length - 1))
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      go(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      go(1)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* A fixed height keeps ข้อถัดไป under the same spot on every ข้อ, so a
          student can page through without chasing the button. Only the body
          scrolls: which ข้อ this is and the way out stay on screen. */}
      <DialogContent
        initialFocus={bodyRef}
        onKeyDown={handleKeyDown}
        className={cn(
          'h-[calc(100dvh-2rem)] overflow-hidden sm:h-[min(44rem,calc(100dvh-4rem))] sm:max-w-2xl',
          showStrip ? 'grid-rows-[auto_auto_minmax(0,1fr)_auto]' : 'grid-rows-[auto_minmax(0,1fr)_auto]',
        )}
      >
        {/* pr-8 keeps the title clear of the dialog's own close button. */}
        <DialogHeader className="flex-row items-start gap-3 pr-8">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
            <Lightbulb className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <DialogTitle>เฉลยวิธีทำ</DialogTitle>
            {/* Announced as the student pages, so a screen reader hears which
                ข้อ they landed on. */}
            <DialogDescription aria-live="polite" className="line-clamp-2">
              {item
                ? `ข้อ ${item.number} จาก ${items.length}${item.title ? ` · ${item.title}` : ''}`
                : load.status === 'error' ? 'เปิดเฉลยไม่สำเร็จ' : 'กำลังเปิดเฉลย…'}
            </DialogDescription>
          </div>
        </DialogHeader>

        {showStrip && (
          <nav ref={stripRef} aria-label="เลือกข้อ" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1">
            {items.map((entry, position) => {
              const active = position === index
              const hasSolution = attemptItemHasSolution(entry)
              const label = hasSolution ? `ข้อ ${entry.number}` : `ข้อ ${entry.number} — ไม่มีเฉลยวิธีทำ`
              return (
                <Button
                  key={entry.answerId}
                  type="button"
                  size="icon-sm"
                  variant={active ? 'default' : hasSolution ? 'outline' : 'ghost'}
                  aria-current={active ? 'true' : undefined}
                  aria-label={label}
                  title={label}
                  onClick={() => onIndexChange(position)}
                  className={cn('shrink-0 tabular-nums', !active && !hasSolution && 'text-muted-foreground')}
                >
                  {entry.number}
                </Button>
              )
            })}
          </nav>
        )}

        {/* -mx-4 px-4 puts the scrollbar on the dialog's edge, not in the text.
            Focused on open, so ↑/↓ scroll the เฉลย straight away. */}
        <div
          ref={bodyRef}
          tabIndex={0}
          role="region"
          aria-label="เนื้อหาเฉลย"
          className="-mx-4 min-h-0 overflow-y-auto px-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
        >
          {(load.status === 'idle' || load.status === 'loading') && (
            <div className="space-y-3" role="status" aria-label="กำลังโหลดเฉลย">
              <div className="h-24 animate-pulse rounded-xl bg-muted" />
              <div className="h-40 animate-pulse rounded-xl bg-muted" />
            </div>
          )}
          {load.status === 'error' && (
            <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-destructive">{load.message}</p>
              <Button variant="outline" size="sm" onClick={onRetry}>ลองอีกครั้ง</Button>
            </div>
          )}
          {load.status === 'ready' && item && <load.Body item={item} />}
          {load.status === 'ready' && !item && (
            <p className="py-10 text-center text-sm text-muted-foreground">รอบนี้ไม่มีข้อให้แสดง</p>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button variant="outline" onClick={() => go(-1)} disabled={!item || index === 0}>
            <ChevronLeft aria-hidden="true" /> ข้อก่อนหน้า
          </Button>
          {item && !isLast ? (
            <Button onClick={() => go(1)}>
              ข้อถัดไป <ChevronRight aria-hidden="true" />
            </Button>
          ) : (
            <DialogClose render={<Button variant="outline" />}>ปิด</DialogClose>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Amber with the lightbulb, like ดูเฉลย on a คลังโจทย์ card and the
 *  "เฉลยวิธีทำ" section the teacher fills in. */
const SOLUTION_TONE = 'text-[color-mix(in_oklab,var(--warning)_60%,var(--foreground))]'

/** The summary card's way in — opens where the student last left off. */
export function AttemptSolutionsButton() {
  const viewer = useViewer()
  return (
    <Button
      size="lg"
      onClick={() => viewer.openAt()}
      onPointerEnter={preloadBody}
      onFocus={preloadBody}
      className={cn('h-auto rounded-xl bg-warning/10 px-4 py-2 font-semibold hover:bg-warning/20', SOLUTION_TONE)}
    >
      <Lightbulb aria-hidden="true" /> ดูเฉลยวิธีทำ
    </Button>
  )
}

/** A ข้อ's own way in, from the answer list below the summary card. */
export function AttemptSolutionShortcut({ answerId, number }: { answerId: string; number: number }) {
  const viewer = useViewer()
  return (
    <Button
      size="xs"
      variant="ghost"
      onClick={() => viewer.openAt(answerId)}
      onPointerEnter={preloadBody}
      onFocus={preloadBody}
      aria-label={`ดูเฉลยวิธีทำข้อ ${number}`}
      className={cn('hover:bg-warning/10', SOLUTION_TONE)}
    >
      <Lightbulb aria-hidden="true" /> เฉลยวิธีทำ
    </Button>
  )
}

/**
 * Hands in an attempt left open on a งาน the teacher has since closed.
 *
 * Closing turns students away from the take page, but the attempt itself is
 * still writable from a tab left open on it — which is why its เฉลยวิธีทำ stays
 * shut. Handing it in as saved is the only way forward, and it is the
 * student's choice: the confirmation says the attempt is scored as it stands.
 */
export function FinishUnfinishedAttempt({ submissionId, attemptNumber }: {
  submissionId: string
  attemptNumber: number
}) {
  const router = useRouter()
  const [confirm, confirmDialog] = useConfirm()
  const [pending, setPending] = useState(false)

  async function finish() {
    const ok = await confirm({
      title: `ส่งรอบที่ ${attemptNumber} ตามที่บันทึกไว้?`,
      description: 'งานนี้ปิดแล้ว จึงกลับไปทำรอบนี้ต่อไม่ได้ — ระบบจะตรวจคำตอบที่บันทึกไว้ล่าสุดและนับคะแนนรอบนี้ตามวิธีเก็บคะแนนของงาน แล้วจึงเปิดเฉลยวิธีทำให้ดู',
      confirmLabel: `ส่งรอบที่ ${attemptNumber}`,
    })
    if (!ok) return
    setPending(true)
    try {
      const result = await submitSubmission(submissionId)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success(`ส่งรอบที่ ${attemptNumber} แล้ว`)
      router.refresh()
    } catch {
      toast.error('ส่งไม่สำเร็จ — ตรวจการเชื่อมต่อแล้วลองอีกครั้ง')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={finish} disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        ส่งรอบที่ {attemptNumber}
      </Button>
      {confirmDialog}
    </>
  )
}
