'use client'

import { useEffect, useState } from 'react'
import { getQuestionPreviewDetails, type QuestionPreviewDetail } from '@/lib/actions/question-previews'
import { QuestionDetailPreview } from './question-detail-preview'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/ui/native-select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface Props {
  ids: readonly string[]
  open: boolean
  title?: string
  onOpenChange: (open: boolean) => void
  /** Lets a selected-question preview update the assignment's real order. */
  onMoveQuestion?: (id: string, position: number) => void
  /** Isolated local QA supplies synthetic details, never database rows. */
  loadQuestions?: typeof getQuestionPreviewDetails
}

type Entry = { question: QuestionPreviewDetail } | { error: string }

export function QuestionListPreviewDialog({
  ids,
  open,
  title = 'ตัวอย่างโจทย์ที่เลือก',
  onOpenChange,
  onMoveQuestion,
  loadQuestions = getQuestionPreviewDetails,
}: Props) {
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const [retry, setRetry] = useState(0)
  // Stable across a parent mapping its ids on every render. No shared-user cache.
  const idsKey = JSON.stringify([...new Set(ids)])
  const orderedIds: string[] = JSON.parse(idsKey)
  // Reordering changes idsKey but not the rows that need loading. Keep the
  // loaded previews mounted so changing one position is immediate and does not
  // flash every question back to its loading state.
  const loadIdsKey = JSON.stringify([...orderedIds].sort())

  useEffect(() => {
    if (!open) return
    let active = true
    const requested: string[] = JSON.parse(loadIdsKey)
    setEntries({})
    async function load() {
      for (let offset = 0; offset < requested.length && active; offset += 50) {
        const batch = requested.slice(offset, offset + 50)
        let result: Awaited<ReturnType<typeof loadQuestions>>
        try {
          result = await loadQuestions(batch)
        } catch {
          result = { error: 'โหลดโจทย์ไม่สำเร็จ กรุณาลองอีกครั้ง' }
        }
        if (!active) return
        const next: Record<string, Entry> = {}
        for (const id of batch) {
          const question = 'data' in result ? result.data.find(q => q.id === id) : undefined
          next[id] = question ? { question } : { error: 'error' in result ? result.error : 'ไม่พบโจทย์นี้หรือคุณไม่มีสิทธิ์เข้าถึง' }
        }
        setEntries(prev => ({ ...prev, ...next }))
      }
    }
    void load()
    return () => { active = false }
  }, [open, loadIdsKey, loadQuestions, retry])

  const hasErrors = Object.values(entries).some(entry => 'error' in entry)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex min-h-0 flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {orderedIds.length} ข้อ · {onMoveQuestion ? 'กดเลขข้อเพื่อย้ายลำดับ · ' : ''}
            เลื่อนลงเพื่อดูทุกข้อ · คำตอบในตัวอย่างจะไม่ถูกบันทึก
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain pr-1" role="region" aria-label="ตัวอย่างโจทย์ทั้งหมด">
          {orderedIds.length === 0 && <p className="py-8 text-center text-muted-foreground">ยังไม่มีโจทย์ในแฟ้มนี้</p>}
          {orderedIds.map((id, index) => {
            const entry = entries[id]
            const questionTitle = entry && 'question' in entry ? entry.question.title : ''
            return (
              <Card key={id} padding="md" className="flex shrink-0 flex-col gap-3" role="region" aria-label={`โจทย์ข้อ ${index + 1}`}>
                {onMoveQuestion ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger
                        render={(
                          <NativeSelect
                            value={String(index + 1)}
                            aria-label={questionTitle
                              ? `ย้าย “${questionTitle}” ไปลำดับที่`
                              : `ย้ายโจทย์ข้อ ${index + 1} ไปลำดับที่`}
                            className="w-auto shrink-0"
                            onChange={event => onMoveQuestion(id, Number(event.target.value))}
                          >
                            {orderedIds.map((_, position) => (
                              <option key={position} value={position + 1}>ข้อ {position + 1}</option>
                            ))}
                          </NativeSelect>
                        )}
                      />
                      <TooltipContent align="start" side="top">
                        เลือกเพื่อย้ายโจทย์ไปยังลำดับที่ต้องการ
                      </TooltipContent>
                    </Tooltip>
                    <h3 className="min-w-0 truncate text-sm font-semibold">
                      {questionTitle || `โจทย์ข้อ ${index + 1}`}
                    </h3>
                  </div>
                ) : (
                  <h3 className="text-sm font-semibold">
                    ข้อ {index + 1}{questionTitle ? ` · ${questionTitle}` : ''}
                  </h3>
                )}
                {!entry && <p role="status" className="py-8 text-sm text-muted-foreground">กำลังโหลดโจทย์...</p>}
                {entry && 'error' in entry && <p role="alert" className="text-sm text-destructive">{entry.error}</p>}
                {entry && 'question' in entry && <QuestionDetailPreview question={entry.question} />}
              </Card>
            )
          })}
          {hasErrors && <Button type="button" variant="outline" onClick={() => setRetry(n => n + 1)}>ลองโหลดโจทย์อีกครั้ง</Button>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
