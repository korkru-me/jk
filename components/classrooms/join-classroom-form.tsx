'use client'

import { useId, useState, useTransition } from 'react'
import { LogIn, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { joinClassroom } from '@/lib/actions/classrooms'
import { cn } from '@/lib/utils'

export type JoinClassroomAction = typeof joinClassroom

export function JoinClassroomForm({
  initialCode = '', compact = false, joinAction = joinClassroom,
}: {
  initialCode?: string
  compact?: boolean
  joinAction?: JoinClassroomAction
}) {
  const codeId = useId()
  const [code, setCode] = useState(initialCode.trim().slice(0, 6).toUpperCase())
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) { toast.error('กรอกรหัสห้องเรียน'); return }
    startTransition(async () => {
      const res = await joinAction(code.trim())
      if (res?.error) toast.error(res.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <FieldGroup>
        <Field className="gap-1.5" data-disabled={isPending}>
          <FieldLabel htmlFor={codeId} className={cn(!compact && 'sr-only')}>
            {compact && <LogIn className="size-3.5 text-primary" aria-hidden="true" />}
            เข้าร่วมห้องเรียนใหม่
          </FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              id={codeId}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={compact ? 'รหัส 6 หลัก' : 'รหัส 6 หลัก เช่น AB3X7Y'}
              maxLength={6}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={isPending}
              className="uppercase tracking-widest placeholder:font-sans placeholder:tracking-normal"
            />
            <Button type="submit" disabled={isPending}>
              {isPending && <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />}
              {isPending ? 'กำลังเข้าร่วม' : 'เข้าร่วม'}
            </Button>
          </div>
        </Field>
      </FieldGroup>
    </form>
  )
}
