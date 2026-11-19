import Link from 'next/link'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'

export function PracticeAccessCodeForm({ title, accessError, unlockAction, returnHref = '/practice' }: {
  title: string
  accessError?: 'invalid' | 'unavailable' | null
  unlockAction: (formData: FormData) => void | Promise<void>
  returnHref?: string
}) {
  return (
    <Card padding="md" className="flex w-full max-w-lg flex-col gap-3">
      <h1 className="text-lg font-semibold">{title}</h1>
      <form action={unlockAction} className="flex flex-col gap-2">
        <Field data-invalid={Boolean(accessError)}>
          <FieldLabel htmlFor="practice-access-code">รหัสผ่านเข้าคลังฝึก</FieldLabel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="practice-access-code" name="accessCode" type="password" autoComplete="off" required
              maxLength={100} className="min-h-11" aria-invalid={Boolean(accessError)}
              aria-describedby={accessError ? 'practice-access-error' : undefined} />
            <Button type="submit" variant="workPractice" className="min-h-11 shrink-0">
              <KeyRound data-icon="inline-start" aria-hidden="true" />
              ตรวจรหัสและเข้าคลัง
            </Button>
          </div>
          <FieldError id="practice-access-error">
            {accessError === 'invalid' ? 'รหัสผ่านไม่ถูกต้อง กรุณาลองอีกครั้ง'
              : accessError === 'unavailable' ? 'ยังตรวจรหัสผ่านไม่ได้ กรุณาลองใหม่' : null}
          </FieldError>
        </Field>
      </form>
      <Button variant="ghost" className="min-h-11 self-start" render={<Link href={returnHref} />}>
        กลับไปรายการคลังฝึก
      </Button>
    </Card>
  )
}
