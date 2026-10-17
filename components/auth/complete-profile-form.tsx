'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { completeProfile } from '@/lib/actions/auth'
import { completeProfileSchema, type AccountRole, type CompleteProfileInput } from '@/lib/auth/validation'
import { AccountRoleField, PolicyAcknowledgmentField } from '@/components/auth/account-fields'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

type Props = { defaultName: string; defaultRole?: AccountRole }

export function CompleteProfileForm({ defaultName, defaultRole }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CompleteProfileInput>({
    resolver: zodResolver(completeProfileSchema),
    defaultValues: { full_name: defaultName, role: defaultRole, accept_terms: false },
  })

  const selectedRole = watch('role')
  const acceptedTerms = watch('accept_terms')

  async function onSubmit(values: CompleteProfileInput) {
    setLoading(true)
    setSubmitError(null)
    const formData = new FormData()
    formData.set('role', values.role)
    formData.set('full_name', values.full_name)
    formData.set('accept_terms', String(values.accept_terms))

    try {
      const result = await completeProfile(formData)
      if (result.error) {
        setSubmitError(result.error)
        setLoading(false)
        return
      }

      toast.success('ตั้งค่าบัญชีเรียบร้อยแล้ว')
      router.push('/dashboard')
      router.refresh()
    } catch {
      setSubmitError('บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate aria-busy={loading}>
      <FieldGroup className="gap-3">
        <AccountRoleField id="profile-role" value={selectedRole} onChange={(role) => setValue('role', role, { shouldValidate: true })} error={errors.role?.message} disabled={loading} />
        <Field data-invalid={!!errors.full_name} className="gap-1">
          <FieldLabel htmlFor="full_name">ชื่อที่ใช้แสดง</FieldLabel>
          <Input
            id="full_name"
            autoComplete="name"
            disabled={loading}
            aria-invalid={!!errors.full_name}
            aria-describedby={errors.full_name ? 'profile-name-error' : 'profile-name-help'}
            className="min-h-[44px]"
            {...register('full_name')}
          />
          <FieldDescription id="profile-name-help">ชื่อนี้จะแสดงต่อครูและสมาชิกห้องเรียนที่เกี่ยวข้อง</FieldDescription>
          <FieldError id="profile-name-error" errors={[errors.full_name]} />
        </Field>
        <PolicyAcknowledgmentField id="accept_terms" checked={acceptedTerms === true} onChange={(checked) => setValue('accept_terms', checked, { shouldValidate: true })} error={errors.accept_terms?.message} disabled={loading} />
        {submitError && <Alert variant="destructive"><AlertDescription>{submitError}</AlertDescription></Alert>}
        <Button type="submit" className="min-h-[44px] w-full" disabled={loading}>
          {loading && <Loader2 data-icon="inline-start" className="motion-safe:animate-spin" />}
          {loading ? 'กำลังบันทึก…' : 'เริ่มใช้งาน KorKru'}
        </Button>
      </FieldGroup>
    </form>
  )
}
