'use client'

import Link from 'next/link'
import { GraduationCap, Presentation } from 'lucide-react'

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
          variant="primary"
          className="w-full"
          disabled={disabled}
        >
          {ACCOUNT_TYPES.map(({ value: role, label, icon: Icon }) => (
            <ToggleGroupItem key={role} value={role} className="min-h-[44px] flex-1">
              <Icon data-icon="inline-start" aria-hidden />
              {label}
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
