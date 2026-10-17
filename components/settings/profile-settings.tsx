'use client'

import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { updateProfile } from '@/lib/actions/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { PasswordSettingsForm } from '@/components/settings/password-settings-form'
import {
  User, Lock, ShieldCheck, Download, Globe,
} from 'lucide-react'

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ title, description, icon: Icon, children }: {
  title: string
  description: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <Card className="overflow-hidden">
      <div className="px-6 py-4 border-b bg-muted/20 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon size={15} className="text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-sm">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </Card>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ProfileSettingsProps {
  user: {
    id: string
    full_name: string
    email: string
    avatar_url: string | null
    role: string
    created_at: string
  }
}

export function ProfileSettings({ user }: ProfileSettingsProps) {
  const [isPending, startTransition] = useTransition()

  const [fullName, setFullName] = useState(user.full_name)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar_url)
  const fileRef = useRef<HTMLInputElement>(null)


  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error('ขนาดไฟล์ต้องไม่เกิน 2MB'); return }
    const reader = new FileReader()
    reader.onloadend = () => setAvatarPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  function handleProfileSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await updateProfile(fd)
      if (res.error) toast.error(res.error)
      else toast.success('บันทึกโปรไฟล์สำเร็จ ✓')
    })
  }


  const initials = user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const joinedDate = new Date(user.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="space-y-5">

      {/* ── Profile Info ─────────────────────────────────────────────────── */}
      <SectionCard title="ข้อมูลโปรไฟล์" description="ชื่อและรูปแสดงตัวตนของคุณ" icon={User}>
        <form onSubmit={handleProfileSave} className="space-y-5">
          {/* Avatar */}
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPreview} alt="avatar" className="w-20 h-20 rounded-2xl object-cover border-2 border-border" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-black">
                  {initials}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{user.full_name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
              <p className="text-[10px] text-muted-foreground">สมาชิกตั้งแต่ {joinedDate}</p>
              <Button variant="link" size="xs"
                type="button"
                onClick={() => fileRef.current?.click()}>
                เปลี่ยนรูปโปรไฟล์
              </Button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
          </div>

          {/* Fields */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">ชื่อ-นามสกุล</Label>
              <Input
                id="full_name"
                name="full_name"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="กรอกชื่อ-นามสกุล"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email_display">อีเมล</Label>
              <Input
                id="email_display"
                value={user.email}
                readOnly
                disabled
                className="bg-muted/50 text-muted-foreground cursor-not-allowed"
              />
              <p className="text-[10px] text-muted-foreground">อีเมลไม่สามารถเปลี่ยนแปลงได้</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending} className="min-w-[120px]">
              {isPending ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
            </Button>
          </div>
        </form>
      </SectionCard>

      {/* ── Change Password ──────────────────────────────────────────────── */}
      <SectionCard title="เปลี่ยนรหัสผ่าน" description="ยืนยันด้วยรหัสผ่านปัจจุบัน แล้วเข้าสู่ระบบใหม่หลังบันทึก" icon={Lock}>
        <PasswordSettingsForm email={user.email} />
      </SectionCard>

      <SectionCard title="การยืนยันตัวตนสองชั้น (2FA)" description="ยังไม่รองรับการเปิดใช้งานใน KorKru" icon={ShieldCheck}>
        <p className="text-sm text-muted-foreground">
          หากเข้าสู่ระบบด้วย Google คุณจัดการการยืนยันตัวตนสองชั้นได้ในบัญชี Google ของคุณ
        </p>
      </SectionCard>

      <SectionCard title="ประวัติการเข้าสู่ระบบ" description="ยังไม่รองรับการดูประวัติอุปกรณ์ในหน้านี้" icon={Globe}>
        <p className="text-sm text-muted-foreground">
          หากสงสัยว่ามีผู้อื่นเข้าถึงบัญชี ให้เปลี่ยนรหัสผ่านและติดต่อผู้ดูแล
        </p>
      </SectionCard>

      <SectionCard title="ข้อมูลส่วนตัว" description="ยังไม่รองรับการส่งออกข้อมูลด้วยตนเอง" icon={Download}>
        <p className="text-sm text-muted-foreground">
          หากต้องการขอสำเนาหรือลบข้อมูลส่วนตัว <Link href="/contact" className="text-primary underline underline-offset-4">ติดต่อผู้ดูแล KorKru</Link>
        </p>
      </SectionCard>
    </div>
  )
}
