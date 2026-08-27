'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Layers, Plus, FolderMinus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Pagination } from '@/components/ui/pagination'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  SearchGroupHeading,
  SearchGroupSelector,
} from '@/components/questions/question-search-groups'
import type { QuestionSetRef } from '@/components/questions/question-set-badges'
import { addQuestionsToSets, removeQuestionsFromQuestionSet } from '@/lib/actions/question-sets'
import { getQuestionClientDetail } from '@/lib/actions/questions'
import { questionSortParams, type QuestionSort } from '@/lib/question-sort'
import type { QuestionSearchScope } from '@/lib/question-search'
import { cn } from '@/lib/utils'
import { LibraryQuestionCard } from './library-question-card'
import { LibraryToolbar, libraryScopeCopy, scopeKey, type LibraryScopeOption } from './library-toolbar'
import type { QuestionDetailWithCategory } from '../../page'
import type { LibraryResult, LibraryScope, UnfiledQuestion } from '../page'

const PreviewModal = dynamic(
  () => import('../../_components/preview-modal').then(mod => mod.PreviewModal),
  { ssr: false },
)

/** How long a typed search waits before it becomes a page load. */
const SEARCH_DEBOUNCE_MS = 500

/** A แฟ้ม a โจทย์ can be filed into — the teacher's own, the only ones they may edit. */
export type FilingTarget = LibraryScopeOption

/**
 * The โจทย์ browser at the foot of คลังแฟ้มโจทย์.
 *
 * It started as one list — โจทย์ที่ยังไม่อยู่ในแฟ้มใด — and that is still what
 * it opens on, because that list is the page's worklist: those โจทย์ exist but
 * can never reach a class through a แฟ้ม. The other two views answer the
 * questions that come straight after it. "โจทย์ทั้งหมด" is for finding a โจทย์
 * you know you wrote and filing it, and "ในแฟ้ม X" is for reading back what a
 * แฟ้ม ended up holding — the only place a misfiled โจทย์ is ever noticed.
 *
 * All three are the same list under different membership filters, so they share
 * one search, one ordering and one page counter, and none of that state is
 * private to this component: it lives in the URL, so a half-finished filing
 * session survives a reload and can be linked to.
 *
 * Filing takes several แฟ้ม at once on purpose. A โจทย์ leaves the unfiled view
 * the moment it lands in one, so a teacher who wants งาน–พลังงาน in both the
 * พลังงาน and the ทบทวนกลางภาค แฟ้ม has to say so while the card is still in
 * front of them.
 */
export function LibraryPanel({
  library, scope, search, match, sort, perPage, unfiledTotal, ownQuestionTotal,
  sets, setMemberships, allTags, subQuestionCounts,
}: {
  library: LibraryResult
  scope: LibraryScope
  search: string
  match: QuestionSearchScope
  sort: QuestionSort
  perPage: number
  /** How many โจทย์ are in no แฟ้ม at all — the chip's own count, whatever is on screen. */
  unfiledTotal: number
  /** The whole คลัง of this teacher. */
  ownQuestionTotal: number
  /** แฟ้ม that can be filed into or browsed: the teacher's own. */
  sets: FilingTarget[]
  /** question id → every แฟ้ม holding it. */
  setMemberships: Record<string, QuestionSetRef[]>
  allTags: string[]
  subQuestionCounts: Record<string, number>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [confirm, confirmDialog] = useConfirm()

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [filingIds, setFilingIds] = useState<string[] | null>(null)
  // Cards already acted on in this sitting. The server list is one navigation
  // behind until the refresh lands, and a card that visibly stayed put after
  // "เพิ่มเข้าแฟ้มแล้ว" reads as a failure.
  const [settledIds, setSettledIds] = useState<Set<string>>(new Set())
  const [previewQ, setPreviewQ] = useState<QuestionDetailWithCategory | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null)
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set())

  const [searchDraft, setSearchDraft] = useState(search)
  // The URL is the source of truth; the box only runs ahead of it while typing.
  useEffect(() => { setSearchDraft(search) }, [search])

  function setParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '') params.delete(key)
      else params.set(key, value)
    }
    const query = params.toString()
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }))
  }
  // `setParams` closes over this render's params; the debounce fires from a
  // later one, so it reads the ref rather than a stale copy.
  const setParamsRef = useRef(setParams)
  setParamsRef.current = setParams

  useEffect(() => {
    if (searchDraft === search) return
    const timer = setTimeout(
      () => setParamsRef.current({ uq: searchDraft, unfiled: null, umatch: null }),
      SEARCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft])

  const activeSet = scope.kind === 'set' ? sets.find(set => set.id === scope.setId) ?? null : null
  const copy = libraryScopeCopy(scope, sets)

  const visible = useMemo(
    () => library.questions.filter(question => !settledIds.has(question.id)),
    [library.questions, settledIds],
  )
  const visibleGroups = useMemo(
    () => library.groups
      .map(group => ({
        ...group,
        questions: group.questions.filter(question => !settledIds.has(question.id)),
      }))
      .filter(group => group.questions.length > 0),
    [library.groups, settledIds],
  )
  const totalPages = Math.max(1, Math.ceil(library.total / perPage))
  const selectedOnPage = visible.filter(question => selectedIds.includes(question.id))
  const allSelected = visible.length > 0 && selectedOnPage.length === visible.length

  function toggleSelected(id: string, selected: boolean) {
    setSelectedIds(prev => selected ? [...new Set([...prev, id])] : prev.filter(other => other !== id))
  }

  async function openPreview(questionId: string) {
    if (previewLoadingId) return
    setPreviewLoadingId(questionId)
    const result = await getQuestionClientDetail(questionId)
    setPreviewLoadingId(null)
    if ('error' in result) {
      toast.error(result.error)
      return
    }
    setPreviewQ(result.data as QuestionDetailWithCategory)
  }

  /** A card that has just been filed or unfiled leaves whichever list it no
   *  longer belongs to; "ทั้งหมด" keeps it, since it still belongs there. */
  function settle(questionIds: string[]) {
    if (scope.kind !== 'all') setSettledIds(prev => new Set([...prev, ...questionIds]))
    setSelectedIds(prev => prev.filter(id => !questionIds.includes(id)))
    setFilingIds(null)
    // The counts, and which page holds what, are the server's to recompute.
    startTransition(() => router.refresh())
  }

  async function handleRemove(questionIds: string[]) {
    if (!activeSet) return
    const single = questionIds.length === 1
      ? library.questions.find(question => question.id === questionIds[0])
      : null
    const ok = await confirm({
      title: single
        ? `เอา “${single.title}” ออกจากแฟ้ม ${activeSet.title}?`
        : `เอาโจทย์ ${questionIds.length} ข้อออกจากแฟ้ม ${activeSet.title}?`,
      description: 'โจทย์ยังอยู่ในคลังโจทย์ และงานที่มอบหมายไปแล้วจากแฟ้มนี้ไม่ได้รับผลกระทบ',
      confirmLabel: 'เอาออกจากแฟ้ม',
      variant: 'destructive',
    })
    if (!ok) return

    startTransition(async () => {
      const result = await removeQuestionsFromQuestionSet(activeSet.id, questionIds)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(`เอา ${result.removed} ข้อออกจาก ${result.title} แล้ว`)
      settle(questionIds)
    })
  }

  // Nothing to say to a teacher whose คลัง is empty — the แฟ้ม empty state
  // already tells them to make a โจทย์ first.
  if (ownQuestionTotal === 0) return null

  const countLine = scope.kind === 'unfiled'
    ? `${library.total} จาก ${ownQuestionTotal} ข้อในคลังโจทย์`
    : scope.kind === 'all'
      ? `${library.total} จาก ${ownQuestionTotal} ข้อ${search ? ' ที่ตรงกับคำค้นหา' : ''}`
      : `${library.total} ข้อ${search ? ' ที่ตรงกับคำค้นหา' : ''} · ยังไม่อยู่ในแฟ้มใดอีก ${unfiledTotal} ข้อ`

  const cardFor = (question: UnfiledQuestion) => (
    <LibraryQuestionCard
      key={question.id}
      question={question}
      selected={selectedIds.includes(question.id)}
      onSelect={selected => toggleSelected(question.id, selected)}
      onPreview={() => void openPreview(question.id)}
      onFile={() => setFilingIds([question.id])}
      onRemove={activeSet ? () => void handleRemove([question.id]) : undefined}
      sets={setMemberships[question.id]}
      showSetBadges={scope.kind !== 'unfiled'}
      allTags={allTags}
      subQuestionCount={subQuestionCounts[question.id]}
      disabled={isPending}
    />
  )

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-muted-foreground">{copy.heading}</h2>
        <p className="text-xs text-muted-foreground">{countLine}</p>
      </div>

      <LibraryToolbar
        scope={scope}
        sets={sets}
        search={searchDraft}
        sort={sort}
        isPending={isPending}
        onScope={next => setParams({
          qscope: next.kind === 'unfiled' ? null : scopeKey(next),
          unfiled: null,
        })}
        onSearch={setSearchDraft}
        onSort={next => setParams({ ...questionSortParams(next, 'u'), unfiled: null })}
      />

      <p className="text-xs text-muted-foreground">{copy.description}</p>

      {search && (
        <SearchGroupSelector
          value={match}
          counts={library.groupCounts}
          onChange={value => setParams({ umatch: value === 'all' ? null : value, unfiled: null })}
          label="กลุ่มผลการค้นหาโจทย์"
        />
      )}

      {library.total === 0 ? (
        <Card edge="ring" className="text-center py-12">
          <p className="text-sm text-muted-foreground">
            {search
              ? 'ไม่พบโจทย์ที่ตรงกับคำค้นหาในรายการนี้'
              : scope.kind === 'unfiled'
                ? 'โจทย์ทุกข้อในคลังของคุณอยู่ในแฟ้มแล้ว'
                : 'ยังไม่มีโจทย์ในแฟ้มนี้'}
          </p>
        </Card>
      ) : (
        <>
          {visible.length > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelectedIds(allSelected
                    ? selectedIds.filter(id => !visible.some(question => question.id === id))
                    : [...new Set([...selectedIds, ...visible.map(question => question.id)])])}
                  className="accent-primary"
                />
                เลือกทั้งหน้า ({visible.length} ข้อ)
              </label>
            </div>
          )}

          {/* The bulk bar only exists once something is ticked, and it says what
              it will act on — a count carried across pages is easy to forget. */}
          {selectedIds.length > 0 && (
            <Card
              edge="ring"
              padding="sm"
              className="sticky bottom-3 z-20 flex items-center justify-between gap-3 flex-wrap bg-card/95 backdrop-blur"
            >
              <p className="text-sm text-foreground">
                เลือกไว้ <span className="font-semibold">{selectedIds.length}</span> ข้อ
                {selectedOnPage.length !== selectedIds.length && (
                  <span className="text-muted-foreground"> (หน้านี้ {selectedOnPage.length} ข้อ)</span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])} disabled={isPending}>
                  ล้างที่เลือก
                </Button>
                {activeSet && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => void handleRemove(selectedIds)}
                    disabled={isPending}
                  >
                    <FolderMinus className="w-3.5 h-3.5" /> เอาออกจาก {activeSet.title}
                  </Button>
                )}
                <Button size="sm" className="gap-1.5" onClick={() => setFilingIds(selectedIds)} disabled={isPending}>
                  <Layers className="w-3.5 h-3.5" /> เพิ่ม {selectedIds.length} ข้อเข้าแฟ้ม
                </Button>
              </div>
            </Card>
          )}

          {search ? (
            <div className={cn('space-y-7', isPending && 'opacity-60')} aria-busy={isPending}>
              {visibleGroups.map(result => (
                <section key={result.group} aria-labelledby={`library-${result.group}`} className="space-y-3">
                  <SearchGroupHeading
                    id={`library-${result.group}`}
                    group={result.group}
                    count={library.groupCounts[result.group]}
                  />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {result.questions.map(cardFor)}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div
              className={cn('grid grid-cols-1 lg:grid-cols-2 gap-3', isPending && 'opacity-60')}
              aria-busy={isPending}
            >
              {visible.map(cardFor)}
            </div>
          )}

          {totalPages > 1 && (
            <Pagination
              page={library.page}
              totalPages={totalPages}
              isPending={isPending}
              label="หน้าของรายการโจทย์ท้ายหน้าแฟ้มโจทย์"
              onGo={next => setParams({ unfiled: next <= 1 ? null : String(next) })}
            />
          )}
        </>
      )}

      <FilingDialog
        questionIds={filingIds}
        questions={library.questions}
        sets={sets}
        setMemberships={setMemberships}
        onClose={() => setFilingIds(null)}
        onFiled={settle}
      />

      {previewLoadingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" aria-label="กำลังโหลดตัวอย่างโจทย์">
          <div className="h-80 w-full max-w-2xl animate-pulse rounded-2xl bg-card" />
        </div>
      )}
      {previewQ && (
        <PreviewModal
          question={previewQ}
          isFlagged={flaggedIds.has(previewQ.id)}
          onClose={() => setPreviewQ(null)}
          onToggleFlag={() => setFlaggedIds(prev => {
            const next = new Set(prev)
            next.has(previewQ.id) ? next.delete(previewQ.id) : next.add(previewQ.id)
            return next
          })}
        />
      )}
      {confirmDialog}
    </div>
  )
}

/**
 * Picking which แฟ้ม a โจทย์ goes into — any number of them.
 *
 * Ticking rather than choosing, because a โจทย์ genuinely belongs to more than
 * one แฟ้ม (a งาน–พลังงาน question sits in both the unit แฟ้ม and the revision
 * one) and because the unfiled view drops the card once it is filed: whatever
 * is not ticked now needs a trip through the แฟ้ม editor later.
 */
function FilingDialog({ questionIds, questions, sets, setMemberships, onClose, onFiled }: {
  /** The โจทย์ being filed; null when the dialog is closed. */
  questionIds: string[] | null
  questions: UnfiledQuestion[]
  sets: FilingTarget[]
  setMemberships: Record<string, QuestionSetRef[]>
  onClose: () => void
  onFiled: (questionIds: string[]) => void
}) {
  const [chosen, setChosen] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()

  const open = questionIds !== null
  const count = questionIds?.length ?? 0
  const single = count === 1
    ? questions.find(question => question.id === questionIds?.[0]) ?? null
    : null

  // Which แฟ้ม already hold every โจทย์ being filed — ticking one of those is a
  // no-op, so say so rather than letting it look like it did something.
  const alreadyIn = useMemo(() => {
    if (!questionIds || questionIds.length === 0) return new Set<string>()
    const counts = new Map<string, number>()
    for (const id of questionIds) {
      for (const set of setMemberships[id] ?? []) {
        counts.set(set.id, (counts.get(set.id) ?? 0) + 1)
      }
    }
    return new Set(
      [...counts.entries()].filter(([, held]) => held === questionIds.length).map(([id]) => id),
    )
  }, [questionIds, setMemberships])

  function close() {
    setChosen([])
    onClose()
  }

  function handleConfirm() {
    if (!questionIds || chosen.length === 0) return
    startTransition(async () => {
      const result = await addQuestionsToSets(chosen, questionIds)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      const names = result.sets.map(set => set.title).join(', ')
      const alreadyThere = result.sets.every(set => set.added === 0)
      toast.success(alreadyThere
        ? `โจทย์อยู่ใน ${names} อยู่แล้ว`
        : `เพิ่ม ${count} ข้อเข้า ${names} แล้ว`)
      if (result.failedCount > 0) {
        toast.error(`มี ${result.failedCount} แฟ้มที่เพิ่มไม่สำเร็จ`)
      }
      setChosen([])
      onFiled(questionIds)
    })
  }

  return (
    <Dialog open={open} onOpenChange={next => !next && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>เพิ่มเข้าแฟ้มโจทย์</DialogTitle>
          <DialogDescription>
            {single
              ? `“${single.title}” จะถูกเพิ่มเข้าแฟ้มที่เลือกไว้`
              : `โจทย์ ${count} ข้อจะถูกเพิ่มเข้าแฟ้มที่เลือกไว้`}
            {' '}เลือกได้มากกว่าหนึ่งแฟ้ม — โจทย์ข้อเดียวอยู่ได้หลายแฟ้ม
          </DialogDescription>
        </DialogHeader>

        {sets.length === 0 ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              ยังไม่มีแฟ้มโจทย์ของคุณให้เพิ่มเข้า สร้างแฟ้มก่อนแล้วค่อยกลับมา
            </p>
            <Link href="/questions/sets/new">
              <Button className="gap-2"><Plus className="w-4 h-4" /> สร้างแฟ้มโจทย์ใหม่</Button>
            </Link>
          </div>
        ) : (
          <ul className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-0.5">
            {sets.map(set => (
              <li key={set.id}>
                <label className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2 py-2 cursor-pointer transition-colors',
                  chosen.includes(set.id) ? 'bg-primary/10' : 'hover:bg-muted',
                )}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(set.id)}
                    onChange={event => setChosen(prev => event.target.checked
                      ? [...prev, set.id]
                      : prev.filter(id => id !== set.id))}
                    disabled={isPending}
                    className="accent-primary"
                  />
                  <Layers className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-sm text-foreground truncate flex-1">{set.title}</span>
                  {alreadyIn.has(set.id)
                    ? <span className="text-xs text-muted-foreground shrink-0">อยู่ในแฟ้มนี้แล้ว</span>
                    : <span className="text-xs text-muted-foreground shrink-0">{set.questionCount} ข้อ</span>}
                </label>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter className="sm:items-center sm:justify-between">
          <DialogClose render={<Button type="button" variant="outline" disabled={isPending} />}>ยกเลิก</DialogClose>
          {sets.length > 0 && (
            <Button onClick={handleConfirm} disabled={chosen.length === 0 || isPending} className="gap-1.5">
              {isPending
                ? 'กำลังเพิ่ม…'
                : chosen.length > 0
                  ? `เพิ่มเข้า ${chosen.length} แฟ้ม`
                  : 'เลือกแฟ้มก่อน'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
