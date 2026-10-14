'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Eye, Share2, Flag, Edit2, Trash2, AlertTriangle, Copy, Download, Users,
  ChevronUp, ChevronDown, FolderMinus, MoreVertical,
} from 'lucide-react'
import { deleteQuestion, getQuestionClientDetail, shareQuestionToOrg } from '@/lib/actions/questions'
import { exportQuestions } from '@/lib/actions/question-export'
import { storeDuplicateSeed, NEW_QUESTION_ROUTE_BY_TYPE } from '@/lib/question-duplicate'
import { isTrueFalseGroupQuestion, TRUE_FALSE_GROUP_ROUTE } from '@/lib/true-false-group'
import { Card } from '@/components/ui/card'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { cn, downloadTextFile } from '@/lib/utils'
import { DIFF_META, TYPE_LABEL } from '@/lib/question-display'
import { QuestionTagsEditor } from './question-tags-editor'
import { SubQuestionCountBadge } from './sub-question-count-badge'
import { QuestionSetBadges, type QuestionSetRef } from './question-set-badges'
import { QuestionSectionBadges } from './question-section-badges'
import { SolutionButton } from './solution-button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import type { Question } from '@/lib/types'

import { questionExcerpt } from '@/lib/question-display'
import { questionEditHref, RETURN_SET_PARAM, RETURN_DASHBOARD_PARAM } from '@/lib/question-return'

/**
 * The row a full card draws from.
 *
 * Written as its own type rather than the คลังโจทย์ page's row so the card can
 * be handed a question assembled anywhere — the แฟ้มโจทย์ editor builds one out
 * of its picker list plus a lazily-fetched detail, and never has a page row to
 * give.
 */
export type QuestionCardRow = Pick<
  Question,
  | 'id' | 'title' | 'question_text' | 'question_type' | 'difficulty' | 'tags'
  | 'group_id' | 'order_in_group' | 'subject'
> & { question_categories: { name: string } | null }

/**
 * The แฟ้ม controls a card grows when it is listed inside one.
 *
 * All of it is absent on the คลังโจทย์ page, where a โจทย์ has no position and
 * belongs to no one list. Passing this object is what turns the card from "a
 * โจทย์ in the คลัง" into "ข้อที่ 7 of this แฟ้ม".
 */
export interface QuestionCardSetContext {
  /** 1-based position in the แฟ้ม — the number students will see. */
  order: number
  selected: boolean
  onSelect: (selected: boolean) => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  /** Takes the โจทย์ out of this แฟ้ม. Never deletes it from the คลัง. */
  onRemove: () => void
  /** Names of the แฟ้มย่อย inside this แฟ้ม that hold it. */
  sectionTitles: string[]
  /**
   * Runs before แก้ไข navigates away, and cancels the move by returning false.
   *
   * The แฟ้ม editor is a draft — nothing in it exists until บันทึก — so leaving
   * for the โจทย์ editor would throw the draft away. This is where it gets
   * saved first.
   */
  onBeforeEdit?: () => Promise<boolean>
  /**
   * The แฟ้ม's id — where แก้ไข comes back to once the โจทย์ is saved.
   *
   * Absent while a แฟ้ม is still being created: there is no แฟ้ม yet to save
   * the draft into or to come back to, so the card offers no แก้ไข at all
   * rather than one that would silently lose the list being built.
   */
  setId?: string
}

interface Props {
  question: QuestionCardRow
  isFlagged: boolean
  onPreview: () => void
  onToggleFlag: () => void
  /** Teams the signed-in teacher belongs to — the real targets a question can be shared to. */
  myTeams: { id: string; name: string }[]
  /** Assignment lists reuse the card without question-bank mutations. */
  readOnly?: boolean
  position?: number
  sectionTitles?: string[]
  /**
   * False while the per-card read for this โจทย์ is still in flight.
   *
   * Group-specific controls stay hidden until placement metadata is known.
   */
  detailsLoaded?: boolean
  /** Every tag in view, offered as suggestions when adding one from this card. */
  allTags: string[]
  /** How many other questions in the bank have exactly this content. 0 = none. */
  duplicateCount: number
  /** How many ข้อย่อย the question holds; absent when the count could not be read. */
  subQuestionCount?: number
  /** Every แฟ้มโจทย์ in view that holds this question. Absent = none of them. */
  sets?: QuestionSetRef[]
  /** Whether it carries a เฉลย, for the ดูเฉลย button. Absent = not known, no button. */
  hasSolution?: boolean
  /** Present only when the card is listed inside one แฟ้ม. See the type. */
  setContext?: QuestionCardSetContext
  /** Recent questions return to home and refresh its totals after deletion. */
  returnToDashboard?: boolean
}

export function QuestionCard({
  question: q, isFlagged, onPreview, onToggleFlag, myTeams, detailsLoaded = true, readOnly = false, position, sectionTitles,
  allTags, duplicateCount, subQuestionCount, sets, hasSolution, setContext, returnToDashboard = false,
}: Props) {
  const router = useRouter()
  // The edit page carries the bank's current view back with it, so returning
  // from an edit lands on the same search, filters and page.
  const returnQuery = useSearchParams().toString()
  const [confirm, confirmDialog] = useConfirm()
  const [shareOpen, setShareOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const diff = DIFF_META[q.difficulty]
  const isGroup = q.order_in_group === 0

  const isGroupUnknown = !detailsLoaded

  const editPath = isGroup ? `/questions/multi/${q.group_id}` : `/questions/${q.id}/edit`
  // Inside a แฟ้ม the return trip is to that แฟ้ม, not to the คลัง view the
  // bank's own cards remember.
  // แก้ไข from a แฟ้ม needs somewhere to come back to and something to save
  // the draft with; a แฟ้ม that has never been saved has neither.
  const canEditFromSet = !!setContext?.setId && !!setContext.onBeforeEdit
  const editHref = setContext?.setId
    ? questionEditHref(editPath, '', { [RETURN_SET_PARAM]: setContext.setId })
    : returnToDashboard
      ? questionEditHref(editPath, '', { [RETURN_DASHBOARD_PARAM]: '1' })
      : questionEditHref(editPath, returnQuery)

  async function handleDelete() {
    const ok = await confirm({
      title: 'ลบโจทย์นี้?',
      description: setContext
        ? `“${q.title}” จะถูกลบถาวรออกจากคลังโจทย์ทั้งหมด กู้คืนไม่ได้ — ถ้าต้องการแค่เอาออกจากแฟ้มนี้ ให้กด “เอาออกจากแฟ้ม”`
        : `“${q.title}” จะถูกลบถาวร กู้คืนไม่ได้`,
      confirmLabel: 'ลบถาวร',
      variant: 'destructive',
    })
    if (!ok) return
    startTransition(async () => {
      const result = await deleteQuestion(q.id)
      if (result?.error) toast.error(result.error)
      else if (returnToDashboard) router.refresh()
    })
  }

  /** แก้ไข from inside a แฟ้ม: the draft is saved before the page is left. */
  function handleEditFromSet() {
    if (!setContext?.onBeforeEdit) return
    const save = setContext.onBeforeEdit
    startTransition(async () => {
      if (await save()) router.push(editHref)
    })
  }

  function handleShareToTeam(orgId: string, teamName: string) {
    startTransition(async () => {
      const res = await shareQuestionToOrg(q.id, orgId)
      if (res?.error) toast.error(res.error)
      else {
        toast.success(`แชร์ให้ทีม ${teamName} แล้ว`)
        setShareOpen(false)
        router.refresh()
      }
    })
  }

  function handleDuplicate() {
    startTransition(async () => {
      const result = await getQuestionClientDetail(q.id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      storeDuplicateSeed(result.data)
      const route = isTrueFalseGroupQuestion(result.data) ? TRUE_FALSE_GROUP_ROUTE : NEW_QUESTION_ROUTE_BY_TYPE[q.question_type]
      router.push(`/questions/new/${route}`)
    })
  }

  function handleExport() {
    setShareOpen(false)
    startTransition(async () => {
      const result = await exportQuestions([q.id])
      if ('error' in result) { toast.error(result.error); return }
      downloadTextFile(result.filename, result.content)
      toast.success('ดาวน์โหลดไฟล์โจทย์แล้ว')
    })
  }

  return (
    <Card
      edge="ring"
      className={cn(
        '@container group transition-all hover:shadow-sm',
        isFlagged ? 'ring-flag/40 hover:ring-flag/60' : 'hover:ring-primary/30',
      )}
    >
      {/* Flagged banner */}
      {isFlagged && (
        <div className="flex items-center gap-2 px-4 py-2 bg-flag/10 rounded-t-2xl border-b border-flag/20">
          <AlertTriangle className="w-3.5 h-3.5 text-flag shrink-0" />
          <p className="text-xs text-flag font-medium">
            โจทย์ข้อนี้ถูกรายงานว่าเฉลยอาจผิดพลาด กรุณาตรวจสอบ
          </p>
        </div>
      )}

      <div className="p-3">
        <div className="flex flex-col @md:flex-row @md:items-start gap-2">
          {/* Inside a แฟ้ม, the tick and the position come before the โจทย์
              itself: bulk actions and the numbering students will see are the
              two things this list exists to control. */}
          {!readOnly && setContext && (
            <div className="flex @md:flex-col items-center gap-2 shrink-0 @md:pt-0.5">
              <input
                type="checkbox"
                checked={setContext.selected}
                onChange={event => setContext.onSelect(event.target.checked)}
                aria-label={`เลือก ${q.title}`}
                className="accent-primary shrink-0"
              />
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                {setContext.order}.
              </span>
            </div>
          )}

          {/* Left: content */}
          <div className="flex-1 min-w-0">
            {/* Badge row */}
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
              {position !== undefined && <span className="text-xs font-semibold text-muted-foreground">ข้อ {position}</span>}
              {isGroup && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">📚 หลายขั้นตอน</span>
              )}
              {/* Same question twice — a re-import or an unedited copy. Only the
                  content counts, so a renamed or retagged twin still shows up. */}
              {duplicateCount > 0 && (
                <span
                  title={`เนื้อหาโจทย์ตรงกับโจทย์อื่นในคลังอีก ${duplicateCount} ข้อ (เทียบเฉพาะเนื้อโจทย์ รูป ตัวเลือก และคำตอบ ไม่นับชื่อโจทย์ แท็ก และระดับความยาก)`}
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning font-medium"
                >
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  ซ้ำกับอีก {duplicateCount} ข้อ
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${diff?.badge}`}>
                {diff?.label}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {TYPE_LABEL[q.question_type] ?? q.question_type}
              </span>
              <SubQuestionCountBadge questionType={q.question_type} count={subQuestionCount} />
              {/* วิชา, then the หมวดหมู่ inside it — the order they nest in.
                  Added when the bank learned to order by วิชา: grouping a list
                  by something the card never shows just reads as shuffled. */}
              {q.subject && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-tint-4/10 text-tint-4">
                  {q.subject}
                </span>
              )}
              {q.question_categories?.name && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {q.question_categories.name}
                </span>
              )}
              {!readOnly && !setContext && <QuestionSetBadges sets={sets} showEmpty />}
              {readOnly ? (q.tags ?? []).map(tag => <span key={tag} className="text-xs text-muted-foreground">#{tag}</span>) : <QuestionTagsEditor questionId={q.id} tags={q.tags ?? []} allTags={allTags} />}
            </div>

            {/* Title */}
            <button
              onClick={onPreview}
              className="text-sm font-semibold text-foreground hover:text-primary transition-colors text-left line-clamp-1 w-full"
            >
              {q.title}
            </button>

            {/* Question text preview */}
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{questionExcerpt(q.question_text)}</p>

            {sectionTitles && <QuestionSectionBadges titles={sectionTitles} showEmpty className="mt-1.5" />}

            {/* Keep แฟ้มย่อย out of the metadata row above. A title such as
                "งาน" can also be a category or a tag; this labelled row makes
                the location unambiguous and names every แฟ้มย่อย rather than
                shortening several memberships to "+N". */}
            {!readOnly && setContext && (
              <QuestionSectionBadges
                titles={setContext.sectionTitles}
                showEmpty
                className="mt-2"
              />
            )}

          </div>

          {/* Right: actions (always visible on hover) */}
          <div className="flex flex-wrap items-center justify-between @md:flex-col @md:items-end @md:justify-start gap-1.5 @md:shrink-0">
            {/* The two ways to look at a โจทย์: its เฉลย on its own, or the
                whole of it as a student meets it. Side by side on a wide card,
                with ดูตัวอย่าง keeping the corner it has always had; stacked
                on a narrow one — a grid column — where side by side would
                take its width out of the title. */}
            <div className="flex items-center gap-1.5 @md:flex-col @md:items-end @2xl:flex-row @2xl:items-center">
              {!readOnly && <SolutionButton questionId={q.id} questionTitle={q.title} hasSolution={hasSolution} />}
              <Button onClick={onPreview} size="sm" className="bg-primary/10 text-primary hover:bg-primary/20">
                <Eye /> ดูตัวอย่าง
              </Button>
            </div>

            {/* Secondary actions row */}
            {!readOnly && (
              <div className="flex items-center flex-wrap gap-0.5">
                {/* Share */}
                <div className="relative">
                  <IconButton
                    onClick={() => setShareOpen(o => !o)}
                    label="แชร์ให้ครูท่านอื่น"
                    size="sm"
                    className="hover:text-tint-1 hover:bg-tint-1/10 dark:hover:text-violet-300 dark:hover:bg-violet-950/40"
                  >
                    <Share2 />
                  </IconButton>
                  {shareOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShareOpen(false)} />
                      <Card radius="md" edge="ring" elevation="xl" className="absolute right-0 top-8 z-40 w-52 overflow-hidden">
                        <div className="px-3 py-2.5 border-b border-border">
                          <p className="text-xs font-semibold text-muted-foreground">แชร์ให้ครูท่านอื่น</p>
                        </div>
                        {!isGroup && (
                          <button
                            onClick={handleExport}
                            disabled={isPending}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted transition-colors text-left border-b border-border disabled:opacity-50"
                          >
                            <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-muted text-muted-foreground">
                              <Download className="w-3.5 h-3.5" />
                            </span>
                            <span className="text-sm text-muted-foreground">ดาวน์โหลดเป็นไฟล์ (ส่งให้ครูต่างโรงเรียน)</span>
                          </button>
                        )}
                        {myTeams.length === 0 ? (
                          <p className="px-3 py-2.5 text-xs text-muted-foreground">
                            ยังไม่ได้อยู่ในทีมใด — สร้างหรือเข้าร่วมทีมก่อนจึงจะแชร์ให้ครูท่านอื่นได้
                          </p>
                        ) : (
                          myTeams.map(team => (
                            <button
                              key={team.id}
                              onClick={() => handleShareToTeam(team.id, team.name)}
                              disabled={isPending}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted transition-colors text-left disabled:opacity-50"
                            >
                              <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-primary/10 text-primary">
                                <Users className="w-3.5 h-3.5" />
                              </span>
                              <span className="text-sm text-muted-foreground">{team.name}</span>
                            </button>
                          ))
                        )}
                      </Card>
                    </>
                  )}
                </div>

                {/* Flag */}
                <IconButton
                  onClick={onToggleFlag}
                  label={isFlagged ? 'ยกเลิกการรายงาน' : 'รายงานปัญหา'}
                  size="sm"
                  className={isFlagged ? 'text-flag bg-flag/10' : 'hover:text-flag hover:bg-flag/10'}
                >
                  <Flag />
                </IconButton>

                {/* Duplicate (non-group only) */}
                {!isGroup && !isGroupUnknown && (
                  <IconButton onClick={handleDuplicate} label="ทำสำเนาเพื่อแก้ไข" size="sm"
                    className="hover:text-primary hover:bg-primary/10">
                    <Copy />
                  </IconButton>
                )}

                {/* Edit. From inside a แฟ้ม this cannot be a plain link: the แฟ้ม
                    draft has to be written down before the page is left. */}
                {setContext ? (canEditFromSet && (
                  <IconButton onClick={handleEditFromSet} disabled={isPending} label="แก้ไข" size="sm">
                    <Edit2 />
                  </IconButton>
                )) : (
                  <Link
                    href={editHref}
                    title="แก้ไข"
                    aria-label="แก้ไข"
                    className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }))}
                  >
                    <Edit2 />
                  </Link>
                )}

                {/* Delete (non-group only). Inside a แฟ้ม it moves into the ⋯ menu
                    below — "ลบถาวรจากคลัง" and "เอาออกจากแฟ้ม" sitting side by
                    side as two similar icons is exactly how a โจทย์ gets lost. */}
                {!isGroup && !isGroupUnknown && !setContext && (
                  <IconButton onClick={handleDelete} disabled={isPending} label="ลบโจทย์" size="sm"
                    className="hover:text-destructive hover:bg-destructive/10">
                    <Trash2 />
                  </IconButton>
                )}
              </div>
            )}

            {/* แฟ้ม controls: position, membership, and the destructive action
                that belongs to the คลัง rather than to this list. */}
            {!readOnly && setContext && (
              <div className="flex items-center flex-wrap gap-0.5">
                <IconButton
                  label="ย้ายขึ้น"
                  size="sm"
                  disabled={!setContext.canMoveUp}
                  onClick={setContext.onMoveUp}
                >
                  <ChevronUp />
                </IconButton>
                <IconButton
                  label="ย้ายลง"
                  size="sm"
                  disabled={!setContext.canMoveDown}
                  onClick={setContext.onMoveDown}
                >
                  <ChevronDown />
                </IconButton>
                <IconButton
                  label="เอาออกจากแฟ้ม"
                  size="sm"
                  className="hover:text-destructive hover:bg-destructive/10"
                  onClick={setContext.onRemove}
                >
                  <FolderMinus />
                </IconButton>
                {!isGroup && !isGroupUnknown && canEditFromSet && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" aria-label="เพิ่มเติม" title="เพิ่มเติม" />}
                    >
                      <MoreVertical />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={isPending}
                        onClick={handleDelete}
                      >
                        <Trash2 className="w-4 h-4" /> ลบโจทย์ถาวรจากคลัง
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {confirmDialog}
    </Card>
  )
}
