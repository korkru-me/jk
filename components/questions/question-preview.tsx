'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { PreviewMath, QuestionPreviewProps } from './question-preview-content'

export type { QuestionPreviewProps }

type PreviewModule = typeof import('./question-preview-content')
type LoadedPreview = { module: PreviewModule; math: PreviewMath | undefined }
let previewRequest: Promise<PreviewModule> | undefined
let mathRequest: Promise<PreviewMath> | undefined
let readyPreview: PreviewModule | undefined
let readyMath: PreviewMath | undefined

/** Share one request across samples, but allow a failed chunk request to retry. */
export async function preloadQuestionPreview(needsMath = false): Promise<LoadedPreview> {
  const moduleRequest = previewRequest ??= import('./question-preview-content')
  const evaluatorRequest = needsMath
    ? (mathRequest ??= import('@/lib/math/evaluator'))
    : undefined
  try {
    const [module, math] = await Promise.all([moduleRequest, evaluatorRequest])
    readyPreview = module
    if (math) readyMath = math
    return { module, math }
  } catch (error) {
    if (previewRequest === moduleRequest) previewRequest = undefined
    if (evaluatorRequest && mathRequest === evaluatorRequest) mathRequest = undefined
    throw error
  }
}

function cachedPreview(needsMath: boolean): LoadedPreview | undefined {
  return readyPreview && (!needsMath || readyMath)
    ? { module: readyPreview, math: needsMath ? readyMath : undefined }
    : undefined
}

/** Client-only so random values and option shuffles start in the browser. */
export function QuestionPreviewContent(props: QuestionPreviewProps) {
  const needsMath = props.questionType === 'written' || props.variables.length > 0
  const [loaded, setLoaded] = useState<LoadedPreview>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setFailed(false)
    const cached = cachedPreview(needsMath)
    if (cached) { setLoaded(cached); return }
    const timeout = window.setTimeout(() => { if (active) setFailed(true) }, 15_000)
    void preloadQuestionPreview(needsMath).then(
      result => {
        if (active) { setLoaded(result); setFailed(false) }
        window.clearTimeout(timeout)
      },
      error => {
        console.error('Question preview could not load', error)
        if (active) setFailed(true)
        window.clearTimeout(timeout)
      },
    )
    return () => { active = false; window.clearTimeout(timeout) }
  }, [needsMath, attempt])

  if (loaded && (!needsMath || loaded.math)) {
    const Content = loaded.module.QuestionPreviewContent
    return <Content {...props} math={loaded.math} />
  }

  return (
    <div className="flex flex-col items-center gap-2 py-3" aria-busy={!failed}>
      <p role={failed ? 'alert' : 'status'} className="text-sm text-muted-foreground">
        {failed ? 'โหลดตัวอย่างไม่สำเร็จ กรุณาลองอีกครั้ง' : 'กำลังเตรียมตัวอย่าง...'}
      </p>
      {failed && (
        <Button type="button" variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>
          ลองใหม่
        </Button>
      )}
    </div>
  )
}


// ── QuestionPreview ──────────────────────────────────────────────────────────────
// Button + dialog wrapper around QuestionPreviewContent, used inline in the
// question create/edit forms.

export function QuestionPreview(props: QuestionPreviewProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
      >
        👁 ดูตัวอย่าง
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>👁</span>
              <span>มุมมองนักเรียน</span>
              {props.isRandom && <span className="text-xs font-normal text-primary">· ค่าถูกสุ่มแล้ว</span>}
            </DialogTitle>
          </DialogHeader>

          {open && <QuestionPreviewContent {...props} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
