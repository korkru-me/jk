'use client'

import { useState, useTransition, useRef } from 'react'
import { toast } from 'sonner'
import { updateProfile, updatePassword } from '@/lib/actions/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  User, Lock, ShieldCheck, Download, Monitor, Smartphone, Globe,
  Eye, EyeOff, AlertTriangle, CheckCircle2,
} from 'lucide-react'

// ─── Reusable Toggle ──────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ title, description, icon: Icon, children }: {
  title: string
  description: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="bg-card border rounded-2xl overflow-hidden">
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
    </div>
  )
}

// ─── Mock Login History ───────────────────────────────────────────────────────

const MOCK_HISTORY = [
  { ip: '49.228.112.45',  device: 'Chrome / macOS',         icon: Monitor,     location: 'เชียงราย, TH', time: 'เมื่อกี้' },
  { ip: '49.228.112.45',  device: 'Safari / iPhone 15 Pro', icon: Smartphone,  location: 'เชียงราย, TH', time: '2 ชั่วโมงที่แล้ว' },
  { ip: '202.57.94.120',  device: 'Chrome / Windows 11',    icon: Monitor,     location: 'กรุงเทพฯ, TH', time: 'เมื่อวาน 18:32' },
  { ip: '119.76.193.211', device: 'Firefox / Ubuntu',       icon: Globe,       location: 'เชียงใหม่, TH', time: '3 วันที่แล้ว' },
]

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
  const [isPwPending, startPwTransition] = useTransition()

  const [fullName, setFullName] = useState(user.full_name)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar_url)
  const fileRef = useRef<HTMLInputElement>(null)

  const [showOldPw, setShowOldPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [twoFAEnabled, setTwoFAEnabled] = useState(false)

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

  function handlePasswordChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startPwTransition(async () => {
      const res = await updatePassword(fd)
      if (res.error) toast.error(res.error)
      else { toast.success('เปลี่ยนรหัสผ่านสำเร็จ ✓'); (e.target as HTMLFormElement).reset() }
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
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-xs text-primary hover:underline font-medium"
              >
                เปลี่ยนรูปโปรไฟล์
              </button>
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
      <SectionCard title="เปลี่ยนรหัสผ่าน" description="แนะนำให้เปลี่ยนรหัสผ่านทุก 3-6 เดือน" icon={Lock}>
        <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
          <div className="space-y-1.5">
            <Label htmlFor="old_password">รหัสผ่านปัจจุบัน</Label>
            <div className="relative">
              <Input
                id="old_password"
                name="old_password"
                type={showOldPw ? 'text' : 'password'}
                placeholder="รหัสผ่านปัจจุบัน"
                className="pr-10"
                required
              />
              <button type="button" onClick={() => setShowOldPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showOldPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new_password">รหัสผ่านใหม่</Label>
            <div className="relative">
              <Input
                id="new_password"
                name="new_password"
                type={showNewPw ? 'text' : 'password'}
                placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)"
                className="pr-10"
                required
              />
              <button type="button" onClick={() => setShowNewPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm_password">ยืนยันรหัสผ่านใหม่</Label>
            <div className="relative">
              <Input
                id="confirm_password"
                name="confirm_password"
                type={showConfirmPw ? 'text' : 'password'}
                placeholder="พิมพ์รหัสผ่านใหม่อีกครั้ง"
                className="pr-10"
                required
              />
              <button type="button" onClick={() => setShowConfirmPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showConfirmPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <Button type="submit" disabled={isPwPending} variant="outline" className="min-w-[140px]">
            {isPwPending ? 'กำลังเปลี่ยน...' : 'เปลี่ยนรหัสผ่าน'}
          </Button>
        </form>
      </SectionCard>

      {/* ── Two-Factor Auth ──────────────────────────────────────────────── */}
      <SectionCard title="การยืนยันตัวตนสองชั้น (2FA)" description="เพิ่มความปลอดภัยให้บัญชีของคุณ" icon={ShieldCheck}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">เปิดใช้งาน 2FA ผ่าน Authenticator App</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              เมื่อเปิดใช้งาน ระบบจะขอรหัส 6 หลักจาก Google Authenticator หรือ Authy ทุกครั้งที่ล็อกอิน
            </p>
          </div>
          <Toggle checked={twoFAEnabled} onChange={setTwoFAEnabled} />
        </div>

        {twoFAEnabled && (
          <div className="mt-4 p-4 bg-green-500/8 border border-green-500/20 rounded-xl flex items-center gap-3">
            <CheckCircle2 size={16} className="text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-400">2FA เปิดใช้งานแล้ว</p>
              <p className="text-xs text-muted-foreground">บัญชีของคุณมีการป้องกันเพิ่มเติม</p>
            </div>
          </div>
        )}

        {!twoFAEnabled && (
          <div className="mt-4 p-4 bg-amber-500/8 border border-amber-500/20 rounded-xl flex items-center gap-3">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              แนะนำให้เปิดใช้งาน 2FA เพื่อป้องกันการเข้าถึงบัญชีโดยไม่ได้รับอนุญาต
            </p>
          </div>
        )}
      </SectionCard>

      {/* ── Login History ────────────────────────────────────────────────── */}
      <SectionCard title="ประวัติการเข้าสู่ระบบ" description="อุปกรณ์และตำแหน่งที่เข้าใช้งานล่าสุด" icon={Globe}>
        <div className="space-y-2 mb-5">
          {MOCK_HISTORY.map((entry, i) => {
            const Icon = entry.icon
            return (
              <div
                key={i}
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  i === 0 ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-border/50'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  i === 0 ? 'bg-primary/10' : 'bg-muted'
                }`}>
                  <Icon size={15} className={i === 0 ? 'text-primary' : 'text-muted-foreground'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{entry.device}</p>
                  <p className="text-xs text-muted-foreground">{entry.location} · IP {entry.ip}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{entry.time}</p>
                  {i === 0 && (
                    <span className="text-[10px] text-primary font-medium">อุปกรณ์นี้</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="pt-4 border-t flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">ส่งออกข้อมูลส่วนตัว (PDPA)</p>
            <p className="text-xs text-muted-foreground">ดาวน์โหลดข้อมูลทั้งหมดที่คุณมีในระบบ</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2 shrink-0">
            <Download size={14} />
            Export My Data
          </Button>
        </div>
      </SectionCard>
    </div>
  )
}
