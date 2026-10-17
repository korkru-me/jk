'use client'

import Link from 'next/link'
import { Circle, CircleCheck, GraduationCap, Presentation } from 'lucide-react'

import type { AccountRole } from '@/lib/auth/validation'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLegend, FieldSet } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const ACCOUNT_TYPES = [
  { value: 'teacher', label: 'ครูผู้สอน', icon: Presentation },
  { value: 'student', label: 'นักเรียน', icon: GraduationCap },
] as const

export function AccountRoleField({ id, value, onChange, error, disabled }: {
  id: string
  value?: AccountRole
  onChange: (role: AccountRole) => void
  error?: string
  disabled?: boolean
}) {
  return (
    <FieldSet disabled={disabled} className="gap-1">
      <FieldLegend variant="label" id={`${id}-label`}>คุณใช้งานในฐานะอะไร?</FieldLegend>
      <Field data-invalid={!!error} className="gap-1">
        <ToggleGroup
          aria-labelledby={`${id}-label`}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={!!error}
          value={value ? [value] : []}
          onValueChange={(values) => {
            const role = values[0]
            if (role === 'teacher' || role === 'student') onChange(role)
          }}
          variant="outline"
          className="@container/role-options grid w-full grid-cols-2"
          disabled={disabled}
        >
          {ACCOUNT_TYPES.map(({ value: role, label, icon: Icon }) => (
            <ToggleGroupItem
              key={role}
              value={role}
              className="group/role min-h-[52px] min-w-0 cursor-pointer justify-start gap-1.5 border-2 border-border bg-muted/30 px-2.5 py-1.5 text-foreground shadow-xs hover:border-primary/50 hover:bg-primary/5 aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary aria-pressed:hover:border-primary aria-pressed:hover:bg-primary/10 motion-safe:active:scale-[0.98]"
            >
              <span className="hidden size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary group-aria-pressed/role:bg-primary group-aria-pressed/role:text-primary-foreground @min-[280px]/role-options:flex">
                <Icon data-icon="inline-start" aria-hidden />
              </span>
              <span className="min-w-0 whitespace-normal text-left leading-snug">{label}</span>
              {value === role
                ? <CircleCheck data-icon="inline-end" className="ml-auto text-primary" aria-hidden />
                : <Circle data-icon="inline-end" className="ml-auto text-muted-foreground/60" aria-hidden />}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
      </Field>
    </FieldSet>
  )
}

export function PolicyAcknowledgmentField({ id, checked, onChange, error, disabled }: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  error?: string
  disabled?: boolean
}) {
  return (
    <Field data-invalid={!!error} className="gap-1">
      <div className="flex min-h-[44px] items-start gap-2">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={onChange}
          aria-invalid={!!error}
          aria-labelledby={`${id}-label`}
          aria-describedby={error ? `${id}-error` : undefined}
          disabled={disabled}
          className="mt-1.5 after:-inset-3.5"
        />
        <p id={`${id}-label`} className="text-sm leading-relaxed">
          <label htmlFor={id} className="cursor-pointer">ฉันยอมรับ</label>{' '}
          <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">ข้อกำหนดการใช้งาน</Link>
          {' '}และรับทราบ{' '}
          <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">นโยบายความเป็นส่วนตัว</Link>
        </p>
      </div>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  )
}
