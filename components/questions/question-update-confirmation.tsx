'use client'

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { unstable_rethrow } from 'next/navigation'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { prepareQuestionUpdate } from '@/lib/actions/question-regrading'
import { updateQuestion, type QuestionFormData } from '@/lib/actions/questions'

export interface QuestionUpdateImpact {
  assignmentCount: number
  submissionCount: number
  manualCount: number
  activeCount: number
}

export type PreparedQuestionUpdate =
  | { error: string }
  | { requiresConfirmation: boolean; token?: string; impact: QuestionUpdateImpact }

export type QuestionUpdateResult = { error?: string; cancelled?: boolean } | void
type PrepareQuestionUpdate = (id: string, data: QuestionFormData) => Promise<PreparedQuestionUpdate>
type UpdateQuestion = (id: string, data: QuestionFormData) => Promise<QuestionUpdateResult>

interface QuestionUpdateConfirmationProviderProps {
  children: ReactNode
  /** Inject actions for local UI checks without reading or writing student data. */
  prepare?: PrepareQuestionUpdate
  update?: UpdateQuestion
  impact?: QuestionUpdateImpact
}

interface PendingConfirmation {
  impact: QuestionUpdateImpact
  resolve: (confirmed: boolean) => void
}

const QuestionUpdateContext = createContext<UpdateQuestion | null>(null)

/** Create forms can use the hook without mounting an edit confirmation dialog. */
export function useQuestionUpdate(): UpdateQuestion {
  const update = useContext(QuestionUpdateContext)
  return update ?? missingConfirmationProvider
}

async function missingConfirmationProvider(): Promise<QuestionUpdateResult> {
  return { error: 'กรุณาเปิดหน้าแก้ไขโจทย์อีกครั้งเพื่อยืนยันการเปลี่ยนแปลง' }
}

/** Prepare is read-only. The actual save runs only after the teacher acknowledges it. */
export function QuestionUpdateConfirmationProvider({
  children, prepare = prepareQuestionUpdate, update = updateQuestion, impact,
}: QuestionUpdateConfirmationProviderProps) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const pendingRef = useRef<PendingConfirmation | null>(null)
  const inFlightRef = useRef(false)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const dismissFocusRef = useRef<HTMLElement | null>(null)
  const acknowledgementRef = useRef<HTMLInputElement | null>(null)
  const backButtonRef = useRef<HTMLButtonElement | null>(null)
  const acknowledgementId = useId()

  useEffect(() => () => { pendingRef.current?.resolve(false) }, [])

  const settle = useCallback((confirmed: boolean) => {
    const current = pendingRef.current
    pendingRef.current = null
    setPending(null)
    setConfirmingClose(false)
    current?.resolve(confirmed)
  }, [])

  const confirmUpdate = useCallback<UpdateQuestion>(async (id, data) => {
    if (inFlightRef.current) return { error: 'กำลังตรวจสอบการเปลี่ยนแปลง กรุณารอสักครู่' }
    inFlightRef.current = true
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    try {
      let prepared: PreparedQuestionUpdate
      try {
        prepared = await prepare(id, data)
      } catch {
        return { error: 'ตรวจสอบผลกระทบไม่สำเร็จ กรุณาลองบันทึกอีกครั้ง' }
      }
      if ('error' in prepared) return prepared
      if (!prepared.requiresConfirmation) return await update(id, data)

      const confirmed = await new Promise<boolean>(resolve => {
        const next = { impact: impact ?? prepared.impact, resolve }
        pendingRef.current = next
        setAcknowledged(false)
        setConfirmingClose(false)
        setPending(next)
      })
      if (!confirmed) return { cancelled: true }
      if (!prepared.token) return { error: 'คำยืนยันหมดอายุ กรุณาลองบันทึกอีกครั้ง' }

      return await update(id, { ...data, regrade_confirmation: prepared.token })
    } catch (error) {
      unstable_rethrow(error)
      return { error: 'ยังยืนยันผลการบันทึกไม่ได้ กรุณาตรวจการเชื่อมต่อแล้วลองบันทึกอีกครั้ง' }
    } finally {
      inFlightRef.current = false
    }
  }, [prepare, update, impact])

  const blocked = (pending?.impact.activeCount ?? 0) > 0
  const currentImpact = pending?.impact

  return (
    <QuestionUpdateContext.Provider value={confirmUpdate}>
      {children}
      <Dialog open={pending !== null} onOpenChange={(open, details) => {
        if (open) return
        if (details.reason === 'outside-press' || details.reason === 'escape-key') {
          details.cancel()
          dismissFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
          setConfirmingClose(true)
          return
        }
        settle(false)
      }}>
        <DialogContent
          className="gap-3 sm:max-w-lg"
          showCloseButton={false}
          initialFocus={blocked ? backButtonRef : acknowledgementRef}
          finalFocus={returnFocusRef}
        >
          <DialogHeader className="gap-2">
            <DialogTitle>{blocked ? 'ยังแก้เฉลยไม่ได้' : 'แก้เฉลยและตรวจคะแนนย้อนหลัง?'}</DialogTitle>
            <DialogDescription>
              การเปลี่ยนเฉลยจะตรวจคะแนนใหม่ให้นักเรียนในทุกงานที่ใช้โจทย์นี้และคุณมีสิทธิ์จัดการ คะแนนและผลผ่านอาจเปลี่ยนแปลง
            </DialogDescription>
          </DialogHeader>

          {currentImpact && (
            <p className="text-sm text-muted-foreground">
              {currentImpact.assignmentCount.toLocaleString('th-TH')} งาน · ทั้งหมด {currentImpact.submissionCount.toLocaleString('th-TH')} รอบ
            </p>
          )}

          {blocked ? (
            <Alert>
              <CircleAlert aria-hidden="true" />
              <AlertTitle>มีนักเรียนกำลังทำ {currentImpact?.activeCount.toLocaleString('th-TH')} รอบ</AlertTitle>
              <AlertDescription>กรุณารอให้รอบที่กำลังทำจบก่อนแก้เฉลย เพื่อให้ตรวจคำตอบและคะแนนได้ถูกต้อง</AlertDescription>
            </Alert>
          ) : (
            <>
              {(currentImpact?.manualCount ?? 0) > 0 && (
                <Alert>
                  <CircleAlert aria-hidden="true" />
                  <AlertDescription>คำตอบที่ครูให้คะแนนเอง {currentImpact?.manualCount.toLocaleString('th-TH')} รายการจะเก็บคะแนนเดิมไว้ กรุณาตรวจทานตามเฉลยใหม่</AlertDescription>
                </Alert>
              )}
              <FieldGroup className="gap-2">
                <Field orientation="horizontal">
                  <FieldLabel htmlFor={acknowledgementId} className="min-h-11 cursor-pointer items-center">
                    <input
                      ref={acknowledgementRef}
                      id={acknowledgementId}
                      type="checkbox"
                      checked={acknowledged}
                      onChange={event => setAcknowledged(event.target.checked)}
                      className="size-4 shrink-0 accent-primary"
                    />
                    ฉันรับทราบผลกระทบต่อคะแนนนักเรียนแล้ว
                  </FieldLabel>
                </Field>
              </FieldGroup>
            </>
          )}

          <DialogFooter className="gap-2 py-3">
            <Button ref={backButtonRef} type="button" variant="outline" className="pointer-coarse:min-h-11" onClick={() => settle(false)}>
              กลับไปแก้ไข
            </Button>
            {!blocked && (
              <Button type="button" className="pointer-coarse:min-h-11" disabled={!acknowledged} onClick={() => {
                if (acknowledged) settle(true)
              }}>
                ยืนยันแก้เฉลยและตรวจคะแนนใหม่
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
        <ConfirmDialog
          open={confirmingClose}
          onOpenChange={setConfirmingClose}
          title="กลับไปแก้ไขโจทย์?"
          description="เฉลยและคะแนนยังไม่ได้เปลี่ยนแปลง ข้อมูลที่แก้ไขในฟอร์มจะยังอยู่"
          cancelLabel="อ่านคำเตือนต่อ"
          confirmLabel="กลับไปแก้ไข"
          finalFocus={pending ? dismissFocusRef : returnFocusRef}
          onConfirm={() => settle(false)}
        />
      </Dialog>
    </QuestionUpdateContext.Provider>
  )
}
