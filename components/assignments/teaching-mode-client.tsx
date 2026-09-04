'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Presentation,
  Trash2,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { RichText } from '@/components/ui/rich-text'
import type { Question } from '@/lib/types'
import type { TeachingBoardView } from '@/lib/math-work'
import { TYPE_LABEL } from '@/lib/question-display'
import { TeachingTryAnswer } from './teaching-try-answer'

const TeachingBoardEditor = dynamic(() => import('./teaching-board-editor'), {
  ssr: false,
  loading: () => (
    <Card className="flex h-[70dvh] min-h-[560px] items-center justify-center text-sm text-muted-foreground lg:h-full">
      <Loader2 className="mr-2 size-4 animate-spin" /> กำลังเตรียมกระดานสอน...
    </Card>
  ),
})

export type TeachingQuestionView = Question & {
  randomValues: Record<string, number>
  correctAnswer: string
}

interface Props {
  assignmentId: string
  assignmentTitle: string
  backHref: string
  currentUserId: string
  canManage: boolean
  questions: TeachingQuestionView[]
  initialBoards: TeachingBoardView[]
  initialBoardsError?: string
}

function firstAvailableSlot(boards: TeachingBoardView[], userId: string): number {
  const used = new Set(boards.filter(board => board.createdBy === userId).map(board => board.slot))
  for (let slot = 1; slot <= 5; slot++) if (!used.has(slot)) return slot
  return 1
}

function interpolateValues(text: string, values: Record<string, number>): string {
  let result = text
  for (const [name, value] of Object.entries(values)) {
    result = result.split(`{${name}}`).join(String(value))
  }
  return result
}

function answerSummary(question: TeachingQuestionView): string {
  const extra = question.extra_data as any
  if (question.question_type === 'mcq') {
    const answers = (question.mcq_options ?? []).filter(option => option.is_correct).map(option => option.text || 'ตัวเลือกภาพ')
    return answers.length > 0 ? answers.join(', ') : 'ยังไม่ได้กำหนดคำตอบ'
  }
  if (question.question_type === 'matching') return 'ดูคู่คำตอบที่เรียงไว้ด้านล่าง'
  if (question.question_type === 'ordering') {
    return (extra?.items ?? []).map((item: any, index: number) => `${index + 1}. ${item.text || 'รายการภาพ'}`).join('  ·  ')
  }
  if (question.question_type === 'true_false') {
    const values = [extra?.correct_answer, ...(extra?.statements ?? []).map((item: any) => item.correct_answer)]
    return values.map((value: boolean, index: number) => `${index + 1}. ${value ? 'ถูก' : 'ผิด'}`).join('  ·  ')
  }
  if (question.question_type === 'fill_blank') {
    const answers = (extra?.blanks ?? []).map((blank: any, index: number) => {
      const accepted = Array.isArray(blank.answers) && blank.answers.length > 0 ? blank.answers : [blank.answer]
      return `${index + 1}. ${accepted.filter(Boolean).join(' หรือ ') || 'ครูตรวจเอง'}`
    })
    return answers.join('  ·  ')
  }
  if (question.question_type === 'essay') return 'คำตอบแบบบรรยาย — ครูตรวจตามเกณฑ์'
  if (question.question_type === 'file_upload') return 'นักเรียนส่งไฟล์ — ครูตรวจผลงาน'
  if (question.question_type === 'composite') return 'ดูคำตอบของแต่ละส่วนจากข้อมูลโจทย์และคำอธิบายของครู'
  try {
    const answers = JSON.parse(question.correctAnswer)
    if (Array.isArray(answers)) return answers.join(', ')
  } catch { /* use the scalar below */ }
  return question.correctAnswer || 'ยังไม่ได้กำหนดคำตอบ'
}

function TeachingQuestion({ question, index, total, showSolution }: {
  question: TeachingQuestionView
  index: number
  total: number
  showSolution: boolean
}) {
  const renderedQuestion = interpolateValues(question.question_text, question.randomValues)
  const renderedSolution = interpolateValues(question.solution_text ?? '', question.randomValues)
  const extra = question.extra_data as any
  const pairs = question.question_type === 'matching' ? (question.mcq_options ?? []) as any[] : []
  const options = question.question_type === 'mcq' ? question.mcq_options ?? [] : []
  const answerParts = question.answer_parts ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">ข้อ {index + 1} / {total}</Badge>
        <Badge variant="outline">{TYPE_LABEL[question.question_type] ?? question.question_type}</Badge>
        {Object.keys(question.randomValues).length > 0 && <Badge variant="secondary">สุ่มค่าตัวอย่างแล้ว</Badge>}
      </div>
      {question.title && <h2 className="text-lg font-semibold">{question.title}</h2>}
      <div className="text-base leading-relaxed">
        <RichText text={renderedQuestion} />
      </div>

      {(question.image_urls ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(question.image_urls ?? []).map(url => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="รูปประกอบโจทย์" className="max-h-52 rounded-xl border object-contain" />
          ))}
        </div>
      )}

      {options.length > 0 && (
        <div className="space-y-2">
          {options.map((option, optionIndex) => (
            <div key={optionIndex} className="flex items-start gap-2 rounded-xl border border-border px-3 py-2 text-sm">
              <span className="font-semibold text-muted-foreground">{String.fromCharCode(65 + optionIndex)}.</span>
              <div className="min-w-0 flex-1">
                {option.text && <RichText text={option.text} />}
                {option.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={option.image_url} alt={`ตัวเลือก ${optionIndex + 1}`} className="mt-1 max-h-28 rounded-lg object-contain" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {pairs.length > 0 && !showSolution && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-2">
            {pairs.map((pair, pairIndex) => (
              <div key={`left-${pairIndex}`} className="rounded-xl border border-border px-3 py-2 text-sm">
                {pair.left_text || `รายการ ${pairIndex + 1}`}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {[...pairs].reverse().map((pair, pairIndex) => (
              <div key={`right-${pairIndex}`} className="rounded-xl border border-border px-3 py-2 text-sm">
                {pair.right_text || `ตัวเลือก ${pairIndex + 1}`}
              </div>
            ))}
          </div>
        </div>
      )}

      {answerParts.length > 0 && (
        <div className="space-y-2">
          {answerParts.map((part, partIndex) => part.sub_text ? (
            <div key={part.id || partIndex} className="rounded-xl bg-muted/40 px-3 py-2 text-sm">
              <span className="mr-2 font-semibold">{partIndex + 1})</span>
              <RichText text={interpolateValues(part.sub_text, question.randomValues)} />
            </div>
          ) : null)}
        </div>
      )}

      {question.question_type === 'true_false' && (extra?.statements ?? []).length > 0 && (
        <div className="space-y-2">
          {(extra.statements as any[]).map((statement, statementIndex) => (
            <div key={statement.id ?? statementIndex} className="rounded-xl bg-muted/40 px-3 py-2 text-sm">
              {statement.text}
            </div>
          ))}
        </div>
      )}

      {showSolution && (
        <Card edge="dashed" padding="md" className="space-y-3 bg-success/5">
          <div className="flex items-center gap-2 text-sm font-semibold text-success">
            <BookOpenCheck className="size-4" /> เฉลยสำหรับสอน
          </div>
          <p className="text-sm"><span className="font-semibold">คำตอบ:</span> {answerSummary(question)}</p>
          {pairs.length > 0 && (
            <div className="space-y-1 text-sm">
              {pairs.map((pair, pairIndex) => (
                <p key={pairIndex}>{pair.left_text || `รายการ ${pairIndex + 1}`} ↔ {pair.right_text || '—'}</p>
              ))}
            </div>
          )}
          {renderedSolution && <div className="text-sm leading-relaxed"><RichText text={renderedSolution} /></div>}
          {(question.solution_image_urls ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(question.solution_image_urls ?? []).map(url => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="รูปเฉลย" className="max-h-44 rounded-xl border object-contain" />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

export function TeachingModeClient({
  assignmentId,
  assignmentTitle,
  backHref,
  currentUserId,
  canManage,
  questions,
  initialBoards,
  initialBoardsError,
}: Props) {
  const router = useRouter()
  const [confirm, confirmDialog] = useConfirm()
  const initialSlot = firstAvailableSlot(initialBoards, currentUserId)
  const initialBoard = initialBoards.find(board => board.createdBy === currentUserId && board.slot === initialSlot) ?? null
  const [questionIndex, setQuestionIndex] = useState(0)
  const [boards, setBoards] = useState(initialBoards)
  const [selectedSlot, setSelectedSlot] = useState(initialSlot)
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(initialBoard?.id ?? null)
  const [showSolution, setShowSolution] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [loadingBoards, setLoadingBoards] = useState(false)
  const [loadNonce, setLoadNonce] = useState(initialBoard ? 1 : 0)
  const [resetNonce, setResetNonce] = useState(initialBoard ? 0 : 1)
  const requestRef = useRef(0)

  const question = questions[questionIndex]
  const selectedBoard = boards.find(board => board.id === selectedBoardId) ?? null
  const ownBoards = useMemo(
    () => boards.filter(board => board.createdBy === currentUserId),
    [boards, currentUserId],
  )
  const sharedBoards = useMemo(
    () => boards.filter(board => board.createdBy !== currentUserId),
    [boards, currentUserId],
  )

  useEffect(() => {
    if (initialBoardsError) toast.error(initialBoardsError)
  }, [initialBoardsError])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const fetchBoards = useCallback(async (questionId: string): Promise<TeachingBoardView[] | null> => {
    const requestId = ++requestRef.current
    setLoadingBoards(true)
    try {
      const { getTeachingBoards } = await import('@/lib/actions/math-work')
      const result = await getTeachingBoards(assignmentId, questionId)
      if (!result || 'error' in result) {
        toast.error(result?.error ?? 'เปิดรายการกระดานสอนไม่สำเร็จ')
        return null
      }
      if (requestId === requestRef.current) setBoards(result.boards)
      return result.boards
    } catch {
      toast.error('เปิดรายการกระดานสอนไม่สำเร็จ กรุณาลองใหม่')
      return null
    } finally {
      if (requestId === requestRef.current) setLoadingBoards(false)
    }
  }, [assignmentId])

  const allowDiscard = async () => {
    if (!dirty) return true
    return confirm({
      title: 'ทิ้งสิ่งที่ยังไม่ได้บันทึก?',
      description: 'เส้นที่เขียนหลังการบันทึกล่าสุดจะหายไป แต่กระดานที่บันทึกไว้แล้วไม่ถูกลบ',
      confirmLabel: 'ทิ้งแล้วไปต่อ',
      variant: 'destructive',
    })
  }

  const changeQuestion = async (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= questions.length || !await allowDiscard()) return
    const nextQuestion = questions[nextIndex]
    setQuestionIndex(nextIndex)
    setShowSolution(false)
    setDirty(false)
    setSelectedBoardId(null)
    setBoards([])
    const nextBoards = await fetchBoards(nextQuestion.id)
    const slot = firstAvailableSlot(nextBoards ?? [], currentUserId)
    const existing = (nextBoards ?? []).find(board => board.createdBy === currentUserId && board.slot === slot) ?? null
    setSelectedSlot(slot)
    setSelectedBoardId(existing?.id ?? null)
    if (existing) setLoadNonce(value => value + 1)
    else setResetNonce(value => value + 1)
  }

  const openBoard = async (board: TeachingBoardView) => {
    if (!await allowDiscard()) return
    setSelectedSlot(board.slot)
    setSelectedBoardId(board.id)
    setDirty(false)
    setLoadNonce(value => value + 1)
  }

  const openOwnSlot = async (slot: number) => {
    const existing = ownBoards.find(board => board.slot === slot) ?? null
    if (existing) {
      await openBoard(existing)
      return
    }
    if (!await allowDiscard()) return
    setSelectedSlot(slot)
    setSelectedBoardId(null)
    setDirty(false)
    setResetNonce(value => value + 1)
  }

  const handleSaved = async (slot: number) => {
    const refreshed = await fetchBoards(question.id)
    const saved = refreshed?.find(board => board.createdBy === currentUserId && board.slot === slot) ?? null
    setSelectedBoardId(saved?.id ?? null)
  }

  const deleteBoard = async (board: TeachingBoardView) => {
    const ok = await confirm({
      title: `ลบกระดานช่อง ${board.slot}?`,
      description: 'ทั้งภาพตัวอย่างและไฟล์ที่ใช้กลับมาแก้ไขจะถูกลบ การกระทำนี้ย้อนกลับไม่ได้',
      confirmLabel: 'ลบกระดาน',
      variant: 'destructive',
    })
    if (!ok) return
    try {
      const { deleteTeachingBoard } = await import('@/lib/actions/math-work')
      const result = await deleteTeachingBoard(board.id)
      if (!result || 'error' in result) throw new Error(result?.error ?? 'ลบกระดานไม่สำเร็จ')
      const refreshed = await fetchBoards(question.id)
      if (selectedBoardId === board.id) {
        setSelectedBoardId(null)
        setSelectedSlot(board.slot)
        setDirty(false)
        setResetNonce(value => value + 1)
      } else if (refreshed) {
        setBoards(refreshed)
      }
      toast.success(`ลบกระดานช่อง ${board.slot} แล้ว`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ลบกระดานไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  const leaveTeachingMode = async () => {
    if (!await allowDiscard()) return
    router.push(backHref)
  }

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col gap-4">
      <Card padding="md" className="shrink-0">
        <div className="flex items-start gap-2">
          <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => void leaveTeachingMode()}>
            <ChevronLeft /> กลับ
          </Button>
          <Presentation className="mt-1.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="truncate text-sm font-semibold sm:text-base">โหมดสอน · {assignmentTitle}</h1>
            <p className="line-clamp-2 text-xs text-muted-foreground">กระดานแยกตามโจทย์ · ผู้สร้างแก้ไขได้สูงสุด 5 ช่อง</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 sm:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowSolution(value => !value)} aria-pressed={showSolution}>
            {showSolution ? <EyeOff /> : <Eye />}{showSolution ? 'ซ่อนเฉลย' : 'แสดงเฉลย'}
          </Button>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon-sm" onClick={() => void changeQuestion(questionIndex - 1)} disabled={questionIndex === 0} aria-label="ข้อก่อนหน้า">
              <ChevronLeft />
            </Button>
            <span className="min-w-12 text-center text-xs font-semibold">{questionIndex + 1} / {questions.length}</span>
            <Button type="button" variant="outline" size="icon-sm" onClick={() => void changeQuestion(questionIndex + 1)} disabled={questionIndex === questions.length - 1} aria-label="ข้อถัดไป">
              <ChevronRight />
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-[minmax(18rem,0.72fr)_minmax(32rem,1.28fr)]">
        <div className="min-w-0 space-y-4 lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto lg:pr-1">
          <Card padding="lg" className="space-y-4">
            <TeachingQuestion question={question} index={questionIndex} total={questions.length} showSolution={showSolution} />
            <TeachingTryAnswer question={question} revealAnswerKey={showSolution} />
          </Card>

          <Card padding="md" className="space-y-3">
            <div className="flex items-center gap-2">
              <Presentation className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">กระดานที่บันทึกไว้</h2>
              {loadingBoards && <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" />}
            </div>

            {canManage ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-2 xl:grid-cols-5">
                {Array.from({ length: 5 }, (_, index) => index + 1).map(slot => {
                  const saved = ownBoards.find(board => board.slot === slot) ?? null
                  const selected = selectedSlot === slot && (!selectedBoard || selectedBoard.createdBy === currentUserId)
                  return (
                    <div key={slot} className="relative min-w-0">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void openOwnSlot(slot)}
                        aria-pressed={selected}
                        aria-label={saved ? `เปิดกระดานช่อง ${slot}` : `เริ่มกระดานช่อง ${slot}`}
                        className={`h-auto w-full flex-col items-stretch gap-2 whitespace-normal rounded-xl border p-2 ${selected ? 'border-primary bg-primary/5' : 'border-border'}`}
                      >
                        {saved?.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={saved.previewUrl}
                            alt=""
                            className="aspect-square w-full rounded-lg border bg-card object-cover"
                            onError={() => void fetchBoards(question.id)}
                          />
                        ) : (
                          <span className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
                            <Plus className="size-5" />
                          </span>
                        )}
                        <span className="text-center text-xs font-medium">ช่อง {slot}</span>
                      </Button>
                      {/* A slot is only a fifth of the sidebar wide: beside the
                          label this button overflowed under the next slot, which
                          then swallowed every click on it. */}
                      {saved && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          className="absolute right-1 top-1 bg-card/90 shadow-sm"
                          onClick={() => void deleteBoard(saved)}
                          aria-label={`ลบกระดานช่อง ${slot}`}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">สิทธิ์ของคุณเปิดดูได้อย่างเดียว ผู้ดูแลหรือครูที่มีสิทธิ์จัดการจึงจะสร้างกระดานของตนได้</p>
            )}

            {sharedBoards.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold"><UserRound className="size-3.5" /> กระดานของครูร่วม</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {sharedBoards.map(board => (
                    <Button
                      key={board.id}
                      type="button"
                      variant="ghost"
                      onClick={() => void openBoard(board)}
                      className={`h-auto w-24 shrink-0 flex-col items-stretch whitespace-normal rounded-xl border p-2 text-left ${selectedBoardId === board.id ? 'border-primary bg-primary/5' : 'border-border'}`}
                    >
                      {board.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={board.previewUrl} alt="ตัวอย่างกระดานของครูร่วม" className="mb-1 aspect-square w-full rounded-lg border object-cover" onError={() => void fetchBoards(question.id)} />
                      ) : (
                        <div className="mb-1 flex aspect-square items-center justify-center rounded-lg bg-muted text-xs">เปิดดู</div>
                      )}
                      <p className="truncate text-[10px] font-semibold">{board.creatorName}</p>
                      <p className="text-[10px] text-muted-foreground">ช่อง {board.slot}</p>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="min-h-[560px] min-w-0 lg:min-h-0">
          <TeachingBoardEditor
            key={question.id}
            assignmentId={assignmentId}
            questionId={question.id}
            slot={selectedSlot}
            board={selectedBoard}
            canManage={canManage}
            loadNonce={loadNonce}
            resetNonce={resetNonce}
            onSaved={handleSaved}
            onDirtyChange={setDirty}
          />
        </div>
      </div>
      {confirmDialog}
    </div>
  )
}
