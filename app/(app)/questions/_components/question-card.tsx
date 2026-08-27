'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, Share2, Flag, Edit2, Trash2, AlertTriangle, Copy, Download, Users } from 'lucide-react'
import { deleteQuestion, getQuestionClientDetail, setRequiresWorkImage, shareQuestionToOrg } from '@/lib/actions/questions'
import { exportQuestions } from '@/lib/actions/question-export'
import { storeDuplicateSeed, NEW_QUESTION_ROUTE_BY_TYPE } from '@/lib/question-duplicate'
import { isTrueFalseGroupQuestion, TRUE_FALSE_GROUP_ROUTE } from '@/lib/true-false-group'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { Card } from '@/components/ui/card'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { cn, downloadTextFile } from '@/lib/utils'
import { DIFF_META, TYPE_LABEL } from '@/lib/question-display'
import { difficultyLabel, discriminationLabel, type QuestionStats } from '@/lib/question-stats'
import { QuestionTagsEditor } from './question-tags-editor'
import { SubQuestionCountBadge } from './sub-question-count-badge'
import { QuestionSetBadges, type QuestionSetRef } from '@/components/questions/question-set-badges'
import type { QuestionWithCategory } from '../page'
import { questionExcerpt } from '@/lib/question-display'
import { questionEditHref } from '@/lib/question-return'

interface Props {
  question: QuestionWithCategory
  isFlagged: boolean
  onPreview: () => void
  onToggleFlag: () => void
  /** Teams the signed-in teacher belongs to — the real targets a question can be shared to. */
  myTeams: { id: string; name: string }[]
  /** Item analysis, absent until the question has been answered in a graded attempt. */
  stats?: QuestionStats
  /** Every tag in view, offered as suggestions when adding one from this card. */
  allTags: string[]
  /** How many other questions in the bank have exactly this content. 0 = none. */
  duplicateCount: number
  /** How many ข้อย่อย the question holds; absent when the count could not be read. */
  subQuestionCount?: number
  /** Every แฟ้มโจทย์ in view that holds this question. Absent = none of them. */
  sets?: QuestionSetRef[]
}

export function QuestionCard({ question: q, isFlagged, onPreview, onToggleFlag, myTeams, stats, allTags, duplicateCount, subQuestionCount, sets }: Props) {
  const router = useRouter()
  // The edit page carries the bank's current view back with it, so returning
  // from an edit lands on the same search, filters and page.
  const returnQuery = useSearchParams().toString()
  const [confirm, confirmDialog] = useConfirm()
  const [shareOpen, setShareOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [requiresWorkImage, setRequiresWorkImageLocal] = useState(q.requires_work_image)
  const diff = DIFF_META[q.difficulty]
  const isGroup = q.order_in_group === 0

  const pPercent = stats ? Math.round(stats.pValue * 100) : null
  const rMeta = stats?.discrimination != null ? discriminationLabel(stats.discrimination) : null

  async function handleDelete() {
    const ok = await confirm({
      title: 'ลบโจทย์นี้?',
      description: `“${q.title}” จะถูกลบถาวร กู้คืนไม่ได้`,
      confirmLabel: 'ลบถาวร',
      variant: 'destructive',
    })
    if (!ok) return
    startTransition(async () => { await deleteQuestion(q.id) })
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

  function handleToggleWorkImage(next: boolean) {
    setRequiresWorkImageLocal(next)
    startTransition(async () => {
      const result = await setRequiresWorkImage(q.id, next)
      if (result?.error) {
        setRequiresWorkImageLocal(!next)
        toast.error(result.error)
      }
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

      <div className="p-4">
        <div className="flex flex-col @md:flex-row @md:items-start gap-3">
          {/* Left: content */}
          <div className="flex-1 min-w-0">
            {/* Badge row */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
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
              {/* Which แฟ้มโจทย์ this question was filed into — all of them,
                  since a question can sit in several. */}
              <QuestionSetBadges sets={sets} showEmpty />
              <QuestionTagsEditor questionId={q.id} tags={q.tags ?? []} allTags={allTags} />
            </div>

            {/* Work-image requirement toggle (written questions only) */}
            {q.question_type === 'written' && (
              <div className="flex items-center gap-2 mb-2">
                <ToggleSwitch checked={requiresWorkImage} onChange={handleToggleWorkImage} disabled={isPending} />
                <span className="text-xs text-muted-foreground">บังคับแนบรูปวิธีทำ</span>
              </div>
            )}

            {/* Title */}
            <button
              onClick={onPreview}
              className="text-sm font-semibold text-foreground hover:text-primary transition-colors text-left line-clamp-1 w-full"
            >
              {q.title}
            </button>

            {/* Question text preview */}
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{questionExcerpt(q.question_text)}</p>

            {/* Stats row — measured from graded attempts, so absent on a question
                nobody has answered yet */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 pt-3 border-t border-border">
              {!stats || pPercent === null ? (
                <p className="text-[10px] text-muted-foreground">ยังไม่มีสถิติ — จะคำนวณให้เมื่อมีนักเรียนส่งคำตอบข้อนี้</p>
              ) : (
                <>
                  {/* p-value bar */}
                  <div className="flex-1 min-w-0 max-w-[180px]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground">ความยาก (p={stats.pValue.toFixed(2)})</span>
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {pPercent}% · {difficultyLabel(stats.pValue)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${diff?.bar}`}
                        style={{ width: `${pPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* r-value */}
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] text-muted-foreground">อำนาจจำแนก</p>
                    {stats.discrimination != null && rMeta ? (
                      <p className={`text-xs font-bold ${rMeta.color}`}>
                        r={stats.discrimination.toFixed(2)}{' '}
                        <span className="font-normal text-muted-foreground">({rMeta.label})</span>
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">ข้อมูลยังไม่พอ</p>
                    )}
                  </div>

                  {/* Usage count */}
                  {stats.usedIn > 0 && (
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] text-muted-foreground">ใช้ใน</p>
                      <p className="text-xs font-bold text-muted-foreground">{stats.usedIn} ชุดสอบ</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right: actions (always visible on hover) */}
          <div className="flex flex-wrap items-center justify-between @md:flex-col @md:items-end @md:justify-start gap-1.5 @md:shrink-0">
            {/* Primary action: preview */}
            <Button onClick={onPreview} size="sm" className="bg-primary/10 text-primary hover:bg-primary/20">
              <Eye /> ดูตัวอย่าง
            </Button>

            {/* Secondary actions row */}
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
              {!isGroup && (
                <IconButton onClick={handleDuplicate} label="ทำสำเนาเพื่อแก้ไข" size="sm"
                  className="hover:text-primary hover:bg-primary/10">
                  <Copy />
                </IconButton>
              )}

              {/* Edit */}
              <Link
                href={questionEditHref(
                  isGroup ? `/questions/multi/${q.group_id}` : `/questions/${q.id}/edit`,
                  returnQuery,
                )}
                title="แก้ไข"
                aria-label="แก้ไข"
                className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }))}
              >
                <Edit2 />
              </Link>

              {/* Delete (non-group only) */}
              {!isGroup && (
                <IconButton onClick={handleDelete} disabled={isPending} label="ลบโจทย์" size="sm"
                  className="hover:text-destructive hover:bg-destructive/10">
                  <Trash2 />
                </IconButton>
              )}
            </div>
          </div>
        </div>
      </div>
      {confirmDialog}
    </Card>
  )
}
