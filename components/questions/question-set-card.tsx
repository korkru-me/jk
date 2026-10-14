'use client'

import { useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Layers, Trash2, Download, ChevronDown } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { IconButton } from '@/components/ui/icon-button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { deleteQuestionSet } from '@/lib/actions/question-sets'
import { exportQuestionSet } from '@/lib/actions/question-export'
import { parseSections } from '@/lib/question-set-sections'
import { withBackHref } from '@/lib/back-link'
import { downloadTextFile, cn } from '@/lib/utils'
import type { QuestionSet } from '@/lib/types'

export type QuestionSetCardData = Pick<QuestionSet, 'id' | 'created_by' | 'title' | 'sections'> & {
  question_ids?: string[]
  valid_question_count?: number
}

export function QuestionSetCard({
  set, currentUserId, dragHandle, backHref, refreshAfterDelete = false,
}: {
  set: QuestionSetCardData
  currentUserId: string
  dragHandle?: ReactNode
  backHref?: string
  refreshAfterDelete?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [deleted, setDeleted] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const isOwner = set.created_by === currentUserId
  const sections = parseSections(set.sections)
  const questionCount = set.valid_question_count ?? (set.question_ids?.length ?? 0)
  // Owners open the editor; shared read-only sets open the library filter.
  const cardHref = isOwner
    ? `/questions/sets/${set.id}/edit`
    : `/questions/sets?qscope=${encodeURIComponent(set.id)}`
  const cardAction = isOwner ? 'แก้ไขแฟ้มโจทย์' : 'ดูโจทย์ในแฟ้ม'

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteQuestionSet(set.id)
      if (res?.error) toast.error(res.error)
      else {
        toast.success('ลบแฟ้มโจทย์แล้ว')
        setDeleted(true)
        if (refreshAfterDelete) router.refresh()
      }
    })
  }

  function handleExport() {
    startTransition(async () => {
      const result = await exportQuestionSet(set.id)
      if ('error' in result) { toast.error(result.error); return }
      downloadTextFile(result.filename, result.content)
      toast.success('ดาวน์โหลดไฟล์แฟ้มโจทย์แล้ว')
    })
  }

  if (deleted) return null

  return (
    <Card
      edge="border"
      radius="md"
      elevation="sm"
      interactive
      data-question-set-card
      className="group relative flex flex-col overflow-hidden focus-within:ring-3 focus-within:ring-ring/50"
    >
      {/* The whole card is the link, laid over the content rather than wrapped
          around it: an <a> around the footer would swallow its buttons and
          nest interactive elements. The footer sits above it on z-10. */}
      <Link
        href={backHref ? withBackHref(cardHref, backHref) : cardHref}
        aria-label={`${cardAction} ${set.title}`}
        className="absolute inset-0 z-10 rounded-[inherit] outline-none"
      />

      <div className={cn(
        'relative overflow-hidden bg-primary/5 p-3',
        isOwner && 'border-b border-primary/10',
      )}>
        <Layers
          aria-hidden="true"
          className="pointer-events-none absolute -right-2 -bottom-5 size-20 text-primary/5 transition-transform group-hover:-translate-y-1 group-hover:rotate-3"
        />
        <div className="relative flex items-start gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-card text-primary shadow-sm">
            <Layers className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 title={set.title} className="truncate text-base leading-snug font-semibold text-foreground transition-colors group-hover:text-primary">
              {set.title}
            </h3>
            <div className="mt-1.5 flex flex-nowrap items-center gap-1">
              <Badge variant="secondary">{questionCount} ข้อ</Badge>
              {sections.length > 0 && (
                <Badge variant="outline">{sections.length} แฟ้มย่อย</Badge>
              )}
            </div>
          </div>
          {dragHandle}
          <ChevronDown
            aria-hidden="true"
            className="mt-1 size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
          />
        </div>
      </div>

      {isOwner && (
        <div className="relative flex items-center justify-end px-3 py-2">
          <div className="relative z-20 flex shrink-0 items-center gap-1">
            <IconButton
              label={`ดาวน์โหลดแฟ้มโจทย์ ${set.title} เป็นไฟล์`}
              onClick={handleExport}
              disabled={isPending}
              size="xs"
              className="text-muted-foreground hover:text-primary"
            >
              <Download />
            </IconButton>
            <IconButton
              label={`ลบแฟ้มโจทย์ ${set.title}`}
              onClick={() => setConfirmingDelete(true)}
              disabled={isPending}
              size="xs"
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 />
            </IconButton>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`ลบแฟ้มโจทย์ “${set.title}”?`}
        description={
          <span className="flex flex-col gap-2">
            <span className="block">แฟ้มนี้จะถูกลบถาวร กู้คืนไม่ได้</span>
            <span className="block">
              โจทย์ {questionCount} ข้อข้างในยังอยู่ในคลังโจทย์ และงานที่มอบหมายไปแล้วจากแฟ้มนี้ไม่ได้รับผลกระทบ
            </span>
          </span>
        }
        confirmLabel="ลบถาวร"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </Card>
  )
}
