'use client'

import { useEffect, useState } from 'react'
import { getQuestionPreviewDetails, type QuestionPreviewDetail } from '@/lib/actions/question-previews'
import { QuestionDetailPreview } from './question-detail-preview'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Props {
  ids: readonly string[]
  open: boolean
  title?: string
  onOpenChange: (open: boolean) => void
  /** Isolated local QA supplies synthetic details, never database rows. */
  loadQuestions?: typeof getQuestionPreviewDetails
}

type Entry = { question: QuestionPreviewDetail } | { error: string }

export function QuestionListPreviewDialog({ ids, open, title = 'ตัวอย่างโจทย์ที่เลือก', onOpenChange, loadQuestions = getQuestionPreviewDetails }: Props) {
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const [retry, setRetry] = useState(0)
  // Stable across a parent mapping its ids on every render. No shared-user cache.
  const idsKey = JSON.stringify([...new Set(ids)])
  const orderedIds: string[] = JSON.parse(idsKey)

  useEffect(() => {
    if (!open) return
    let active = true
    const requested: string[] = JSON.parse(idsKey)
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
  }, [open, idsKey, loadQuestions, retry])

  const hasErrors = Object.values(entries).some(entry => 'error' in entry)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex min-h-0 flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{orderedIds.length} ข้อ · เลื่อนลงเพื่อดูทุกข้อ · คำตอบในตัวอย่างจะไม่ถูกบันทึก</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain pr-1" role="region" aria-label="ตัวอย่างโจทย์ทั้งหมด">
          {orderedIds.length === 0 && <p className="py-8 text-center text-muted-foreground">ยังไม่มีโจทย์ในแฟ้มนี้</p>}
          {orderedIds.map((id, index) => {
            const entry = entries[id]
            return (
              <Card key={id} padding="md" className="flex shrink-0 flex-col gap-3" role="region" aria-label={`โจทย์ข้อ ${index + 1}`}>
                <h3 className="text-sm font-semibold">ข้อ {index + 1}{entry && 'question' in entry ? ` · ${entry.question.title}` : ''}</h3>
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
