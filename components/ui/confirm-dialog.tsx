'use client'

import { useCallback, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** What exactly is about to happen, and what survives it. */
  description?: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
  onConfirm: () => void
}

/**
 * A yes/no step in front of an action that is annoying to undo.
 *
 * Replaces `window.confirm`, which cannot say which questions are about to go,
 * cannot be styled, and reads as a browser error to teachers.
 */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel,
  cancelLabel = 'ยกเลิก', variant = 'default', onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription render={<div />}>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={() => { onConfirm(); onOpenChange(false) }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export interface ConfirmOptions {
  title: string
  description?: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
}

/**
 * `window.confirm` with the app's own dialog: same shape at the call site —
 *
 *   if (!(await confirm({ ... }))) return
 *
 * — so guarding an action stays one line, and every screen asks the same way.
 * Render the returned node once anywhere in the component.
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const [pending, setPending] = useState<{
    options: ConfirmOptions
    resolve: (confirmed: boolean) => void
  } | null>(null)

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>(resolve => setPending({ options, resolve })),
    []
  )

  // Answering settles the promise; dismissing any other way answers "no".
  // A promise ignores a second settle, so the close that follows a ยืนยัน is
  // harmless.
  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={open => {
        if (open) return
        pending?.resolve(false)
        setPending(null)
      }}
      title={pending?.options.title ?? ''}
      description={pending?.options.description}
      confirmLabel={pending?.options.confirmLabel ?? 'ยืนยัน'}
      cancelLabel={pending?.options.cancelLabel}
      variant={pending?.options.variant}
      onConfirm={() => {
        pending?.resolve(true)
        setPending(null)
      }}
    />
  )

  return [confirm, dialog]
}
