'use client'

import { useCallback, useEffect, useId, useRef, useState, type ComponentProps } from 'react'
import type { DialogRootChangeEventDetails } from '@base-ui/react/dialog'
import { Clock, LoaderCircle, RefreshCw, Users, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { extendAssignmentDeadline, getAssignmentDeadlineExtension } from '@/lib/actions/extensions'
import type { AssignmentDeadlineExtensionSnapshot } from '@/lib/assignment-deadline-extension'
import { formatThaiDateTime, thaiLocalDateTimeToIso, toThaiLocalDateTimeInput } from '@/lib/thai-time'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

export interface ExtensionDialogActions {
  prepare: typeof getAssignmentDeadlineExtension
  save: typeof extendAssignmentDeadline
}

interface Props {
  assignmentId: string
  assignmentTitle: string
  onClose: () => void
  finalFocus?: ComponentProps<typeof DialogContent>['finalFocus']
  /** Isolated screen-lab actions never write to a real assignment. */
  actions?: ExtensionDialogActions
}

export function ExtensionDialog({ assignmentId, assignmentTitle, onClose, finalFocus, actions }: Props) {
  const router = useRouter()
  const actionOverrides = useRef(actions)
  actionOverrides.current = actions
  const [snapshot, setSnapshot] = useState<AssignmentDeadlineExtensionSnapshot | null>(null)
  const [extendedEndAt, setExtendedEndAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [saveUncertain, setSaveUncertain] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const dismissFocus = useRef<HTMLElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const lifecycle = useRef({ mounted: false, revision: 0, busy: false })
  const inputId = useId()
  const busy = loading || saving
  const dirty = snapshot !== null && extendedEndAt !== toThaiLocalDateTimeInput(snapshot.endAt)
  const candidateEndAt = thaiLocalDateTimeToIso(extendedEndAt)
  const candidateError = !candidateEndAt || toThaiLocalDateTimeInput(candidateEndAt) !== extendedEndAt
    ? 'กรุณาเลือกวันและเวลาปิดรับที่ถูกต้อง'
    : snapshot && Date.parse(candidateEndAt) <= Date.parse(snapshot.endAt)
      ? 'เลือกเวลาปิดรับใหม่ให้ช้ากว่าเวลาเดิม'
      : Date.parse(candidateEndAt) <= Date.now()
        ? 'เลือกเวลาปิดรับใหม่ที่ยังมาไม่ถึง'
        : null
  const inputError = fieldError ?? (dirty ? candidateError : null)

  const loadSnapshot = useCallback(async () => {
    const revision = ++lifecycle.current.revision
    const isCurrent = () => lifecycle.current.mounted && lifecycle.current.revision === revision
    lifecycle.current.busy = true
    setLoading(true)
    setSnapshot(null)
    setExtendedEndAt('')
    setLoadError(null)
    setSaveError(null)
    setFieldError(null)
    setSaveUncertain(false)
    try {
      const prepare = actionOverrides.current?.prepare ?? getAssignmentDeadlineExtension
      const result = await prepare(assignmentId)
      if (!isCurrent()) return
      if ('error' in result) {
        setLoadError(result.error)
        return
      }
      setSnapshot(result.snapshot)
      setExtendedEndAt(toThaiLocalDateTimeInput(result.snapshot.endAt))
    } catch {
      if (isCurrent()) setLoadError('โหลดเวลาปิดรับไม่สำเร็จ กรุณาลองอีกครั้ง')
    } finally {
      if (isCurrent()) {
        lifecycle.current.busy = false
        setLoading(false)
      }
    }
  }, [assignmentId])

  useEffect(() => {
    lifecycle.current.mounted = true
    void loadSnapshot()
    return () => {
      lifecycle.current.mounted = false
      lifecycle.current.revision += 1
    }
  }, [loadSnapshot])

  function requestClose(details?: DialogRootChangeEventDetails) {
    if (lifecycle.current.busy) {
      details?.cancel()
      return
    }
    if (dirty || details?.reason === 'outside-press' || details?.reason === 'escape-key') {
      details?.cancel()
      dismissFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setConfirmClose(true)
      return
    }
    onClose()
  }

  async function handleSave() {
    if (lifecycle.current.busy || !snapshot || !dirty || saveUncertain) return
    const endAt = candidateEndAt
    const error = candidateError ?? (endAt && Date.parse(endAt) <= Date.now() ? 'เลือกเวลาปิดรับใหม่ที่ยังมาไม่ถึง' : null)
    setFieldError(error)
    setSaveError(null)
    if (error || !endAt) {
      inputRef.current?.focus()
      return
    }

    const revision = lifecycle.current.revision
    const isCurrent = () => lifecycle.current.mounted && lifecycle.current.revision === revision
    lifecycle.current.busy = true
    setSaving(true)
    let saved: Extract<Awaited<ReturnType<typeof extendAssignmentDeadline>>, { success: true }> | null = null
    try {
      const save = actionOverrides.current?.save ?? extendAssignmentDeadline
      const result = await save(assignmentId, {
        endAt,
        expectedEndAt: snapshot.endAt,
        expectedUpdatedAt: snapshot.updatedAt,
      })
      if (!isCurrent()) return
      if ('error' in result) {
        setSaveError(result.error)
        toast.error(result.error)
        return
      }
      saved = result
    } catch {
      if (isCurrent()) {
        const message = 'ยังยืนยันการบันทึกไม่ได้ กรุณาปิดแล้วเปิดหน้าต่างนี้เพื่อตรวจเวลาล่าสุดก่อนลองอีกครั้ง'
        setSaveError(message)
        setSaveUncertain(true)
        toast.error(message)
      }
    } finally {
      if (isCurrent()) {
        lifecycle.current.busy = false
        setSaving(false)
      }
    }
    if (!saved || !isCurrent()) return
    toast.success('ขยายเวลาปิดรับทั้งงานสำเร็จแล้ว')
    if (saved.warning) toast.warning(saved.warning)
    onClose()
    try {
      router.refresh()
    } catch {
      toast.warning('บันทึกเวลาปิดรับแล้ว กรุณารีเฟรชหน้าเพื่อดูข้อมูลล่าสุด')
    }
  }

  return (
    <Dialog open onOpenChange={(open, details) => { if (!open) requestClose(details) }}>
      <DialogContent showCloseButton={false} finalFocus={finalFocus} className="gap-3 sm:max-w-md">
        <div className="flex items-start justify-between gap-2">
          <DialogHeader className="min-w-0 gap-1">
            <DialogTitle className="flex items-center gap-2">
              <Clock className="size-4 shrink-0 text-primary" aria-hidden="true" />
              ขยายเวลาทั้งงาน
            </DialogTitle>
            <DialogDescription className="break-words">{snapshot?.title ?? assignmentTitle}</DialogDescription>
          </DialogHeader>
          <Button type="button" variant="ghost" size="icon-sm" className="pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]" disabled={busy} aria-label="ปิดหน้าต่างขยายเวลา" onClick={() => requestClose()}>
            <X aria-hidden="true" />
          </Button>
        </div>

        {loading ? (
          <div role="status" aria-label="กำลังโหลดเวลาปิดรับ" className="flex flex-col gap-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
            <p className="text-sm text-muted-foreground">กำลังโหลดเวลาปิดรับ…</p>
          </div>
        ) : loadError ? (
          <Alert variant="destructive">
            <AlertTitle>ยังขยายเวลาไม่ได้</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : snapshot ? (
          <form id={`${inputId}-form`} noValidate onSubmit={event => { event.preventDefault(); void handleSave() }} className="flex flex-col gap-3">
            <Alert role="note">
              <Users aria-hidden="true" />
              <AlertTitle>ใช้กับนักเรียนทุกคนที่ได้รับงานนี้</AlertTitle>
              {snapshot.linkedClassroomCount > 1 && <AlertDescription>รวมทั้ง {snapshot.linkedClassroomCount} ห้องเรียนที่ได้รับงานเดียวกัน</AlertDescription>}
            </Alert>

            <Card padding="sm" className="flex flex-col gap-3">
              <dl className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <dt className="text-xs text-muted-foreground">เวลาปิดรับเดิม</dt>
                <dd className="text-sm font-medium tabular-nums">{formatThaiDateTime(snapshot.endAt)}</dd>
              </dl>
              <FieldGroup className="gap-2">
                <Field className="gap-1.5" data-invalid={Boolean(inputError)} data-disabled={saving || saveUncertain}>
                  <FieldLabel htmlFor={inputId}>เวลาปิดรับใหม่</FieldLabel>
                  <Input
                    ref={inputRef}
                    id={inputId}
                    type="datetime-local"
                    value={extendedEndAt}
                    min={toThaiLocalDateTimeInput(new Date(Math.max(Date.now(), Date.parse(snapshot.endAt)) + 60_000))}
                    required
                    disabled={saving || saveUncertain}
                    aria-invalid={Boolean(inputError)}
                    aria-describedby={`${inputId}-description${inputError ? ` ${inputId}-error` : ''}`}
                    className="pointer-coarse:min-h-[44px]"
                    onChange={event => { setExtendedEndAt(event.target.value); setFieldError(null); setSaveError(null) }}
                  />
                  <FieldDescription id={`${inputId}-description`}>เลือกวันและเวลาไทยที่ช้ากว่าเวลาปิดรับเดิม</FieldDescription>
                  {inputError && <FieldError id={`${inputId}-error`}>{inputError}</FieldError>}
                </Field>
              </FieldGroup>
            </Card>

            <p className="text-xs leading-relaxed text-muted-foreground">
              {snapshot.dueAt ? `กำหนดส่งตรงเวลายังคงเป็น ${formatThaiDateTime(snapshot.dueAt)}` : 'งานนี้ไม่ได้กำหนดเวลาส่งตรงเวลา'}
              {' · '}
              {snapshot.durationMinutes ? `เวลาทำต่อครั้งยังเป็น ${snapshot.durationMinutes} นาที` : 'ไม่จำกัดเวลาทำต่อครั้ง'}
            </p>
            {saveError && <Alert variant="destructive"><AlertDescription>{saveError}</AlertDescription></Alert>}
          </form>
        ) : null}

        <DialogFooter className="gap-2 py-3">
          <Button type="button" variant="outline" disabled={busy} className="pointer-coarse:min-h-[44px]" onClick={() => requestClose()}>
            {loadError ? 'ปิด' : 'ยกเลิก'}
          </Button>
          {loadError ? (
            <Button type="button" variant="outline" className="pointer-coarse:min-h-[44px]" onClick={() => void loadSnapshot()}>
              <RefreshCw data-icon="inline-start" aria-hidden="true" /> ลองอีกครั้ง
            </Button>
          ) : (
            <Button type="submit" form={`${inputId}-form`} disabled={busy || !snapshot || !dirty || Boolean(candidateError) || saveUncertain} className="pointer-coarse:min-h-[44px]">
              {saving && <LoaderCircle data-icon="inline-start" className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {saving ? 'กำลังบันทึก…' : 'บันทึกเวลาปิดรับ'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="ปิดหน้าต่างขยายเวลา?"
        description={saveUncertain
          ? 'ยังยืนยันผลการบันทึกไม่ได้ ปิดแล้วเปิดหน้าต่างนี้อีกครั้งเพื่อตรวจเวลาปิดรับล่าสุด'
          : dirty
            ? 'วันและเวลาที่เลือกยังไม่ได้บันทึก หากปิดตอนนี้ค่าที่กรอกจะถูกยกเลิก'
            : 'ยังไม่มีการเปลี่ยนเวลาปิดรับของงานนี้'}
        cancelLabel="กลับไปดำเนินการต่อ"
        confirmLabel="ยืนยันปิด"
        finalFocus={dismissFocus}
        onConfirm={() => { setConfirmClose(false); onClose() }}
      />
    </Dialog>
  )
}
