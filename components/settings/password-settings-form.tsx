'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'
import { updatePassword } from '@/lib/actions/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel, FieldError } from '@/components/ui/field'

export function PasswordSettingsForm({ email, changePasswordAction = updatePassword }: {
  email: string
  changePasswordAction?: typeof updatePassword
}) {
  const router = useRouter()
  const [isPwPending, startPwTransition] = useTransition()
  const [showOldPw, setShowOldPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  function handlePasswordChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    setPasswordError(null)
    startPwTransition(async () => {
      try {
        const res = await changePasswordAction(fd)
        if ('error' in res) {
          setPasswordError(res.error)
          return
        }
        form.reset()
        setShowOldPw(false)
        setShowNewPw(false)
        setShowConfirmPw(false)
        if (res.warning) toast.warning(res.warning, { duration: 10000 })
        else toast.success('เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่')
        router.replace('/login?password_changed=1')
        router.refresh()
      } catch {
        setPasswordError('ยังเปลี่ยนรหัสผ่านไม่ได้ กรุณาลองใหม่อีกครั้ง')
      }
    })
  }

  return (
    <form onSubmit={handlePasswordChange} className="flex max-w-md flex-col gap-3">
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <fieldset disabled={isPwPending} className="min-w-0">
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel htmlFor="old_password">รหัสผ่านปัจจุบัน</FieldLabel>
            <div className="flex items-center gap-1">
              <Input
                id="old_password"
                name="old_password"
                type={showOldPw ? 'text' : 'password'}
                autoComplete="current-password"
                className="min-h-11"
                required
              />
              <Button type="button" variant="ghost" size="icon" className="size-11"
                aria-label={showOldPw ? 'ซ่อนรหัสผ่านปัจจุบัน' : 'แสดงรหัสผ่านปัจจุบัน'}
                aria-pressed={showOldPw}
                onClick={() => setShowOldPw(v => !v)}>
                {showOldPw ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="new_password">รหัสผ่านใหม่</FieldLabel>
            <div className="flex items-center gap-1">
              <Input
                id="new_password"
                name="new_password"
                type={showNewPw ? 'text' : 'password'}
                autoComplete="new-password"
                aria-describedby="new-password-requirements"
                className="min-h-11"
                required
              />
              <Button type="button" variant="ghost" size="icon" className="size-11"
                aria-label={showNewPw ? 'ซ่อนรหัสผ่านใหม่' : 'แสดงรหัสผ่านใหม่'}
                aria-pressed={showNewPw}
                onClick={() => setShowNewPw(v => !v)}>
                {showNewPw ? <EyeOff /> : <Eye />}
              </Button>
            </div>
            <p id="new-password-requirements" className="text-xs text-muted-foreground">
              อย่างน้อย 8 ตัว มีตัวอักษรภาษาอังกฤษและตัวเลข ใช้รหัสที่ไม่ซ้ำกับเว็บอื่น
            </p>
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm_password">ยืนยันรหัสผ่านใหม่</FieldLabel>
            <div className="flex items-center gap-1">
              <Input
                id="confirm_password"
                name="confirm_password"
                type={showConfirmPw ? 'text' : 'password'}
                autoComplete="new-password"
                className="min-h-11"
                required
              />
              <Button type="button" variant="ghost" size="icon" className="size-11"
                aria-label={showConfirmPw ? 'ซ่อนรหัสผ่านยืนยัน' : 'แสดงรหัสผ่านยืนยัน'}
                aria-pressed={showConfirmPw}
                onClick={() => setShowConfirmPw(v => !v)}>
                {showConfirmPw ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </fieldset>
      {passwordError && <FieldError>{passwordError}</FieldError>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={isPwPending} variant="outline" className="min-h-11">
          {isPwPending ? 'กำลังเปลี่ยน...' : 'เปลี่ยนรหัสผ่าน'}
        </Button>
        <Button variant="link" className="min-h-11" render={<Link href="/forgot-password" />}>
          ตั้งรหัสผ่านผ่านอีเมล
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        หากสมัครด้วย Google และยังไม่มีรหัสผ่าน หรือจำรหัสผ่านปัจจุบันไม่ได้ ให้ใช้ลิงก์ตั้งรหัสผ่านผ่านอีเมล
      </p>
    </form>
  )
}
