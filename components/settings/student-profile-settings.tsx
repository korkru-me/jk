'use client'

import { useState, useTransition, useRef } from 'react'
import { toast } from 'sonner'
import { updatePassword } from '@/lib/actions/settings'
import { updateMyStudentProfile } from '@/lib/actions/student-profile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { StudentProfile, StudentGuardian, NamePrefix } from '@/lib/types'
import { buildFullName } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import {
  User, Lock, GraduationCap, Phone, Info, Eye, EyeOff, Plus, X,
} from 'lucide-react'

const GRADE_LEVELS = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6', 'อื่นๆ']
const SECTION_NUMBERS = Array.from({ length: 15 }, (_, i) => i + 1)
const MAX_GUARDIANS = 3
const NAME_PREFIXES: NamePrefix[] = ['เด็กหญิง', 'เด็กชาย', 'นาย', 'นางสาว']

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

interface StudentProfileSettingsProps {
  user: {
    id: string
    full_name: string
    prefix: NamePrefix | null
    first_name: string | null
    last_name: string | null
    email: string
    avatar_url: string | null
    created_at: string
  }
  profile: StudentProfile | null
}

export function StudentProfileSettings({ user, profile }: StudentProfileSettingsProps) {
  const [isPwPending, startPwTransition] = useTransition()
  const [isInfoPending, startInfoTransition] = useTransition()

  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar_url)
  const fileRef = useRef<HTMLInputElement>(null)

  const [guardians, setGuardians] = useState<StudentGuardian[]>(
    profile?.guardians?.length ? profile.guardians : [{ name: '', phone: '' }]
  )

  const [showOldPw, setShowOldPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error('ขนาดไฟล์ต้องไม่เกิน 2MB'); return }
    const reader = new FileReader()
    reader.onloadend = () => setAvatarPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  function handleInfoSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('guardians', JSON.stringify(guardians))
    startInfoTransition(async () => {
      const res = await updateMyStudentProfile(fd)
      if (res.error) toast.error(res.error)
      else toast.success('บันทึกข้อมูลสำเร็จ ✓')
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

  function updateGuardian(index: number, field: keyof StudentGuardian, value: string) {
    setGuardians(prev => prev.map((g, i) => i === index ? { ...g, [field]: value } : g))
  }

  function addGuardian() {
    setGuardians(prev => prev.length >= MAX_GUARDIANS ? prev : [...prev, { name: '', phone: '' }])
  }

  function removeGuardian(index: number) {
    setGuardians(prev => prev.filter((_, i) => i !== index))
  }

  const displayName = buildFullName(user.prefix, user.first_name, user.last_name) || user.full_name
  const initials = ((user.first_name?.[0] ?? displayName[0] ?? '') + (user.last_name?.[0] ?? '')).toUpperCase()
  const joinedDate = new Date(user.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="space-y-5">

      {/* ── Profile Info ─────────────────────────────────────────────────── */}
      <SectionCard title="ข้อมูลโปรไฟล์" description="ชื่อและรูปแสดงตัวตนของคุณ" icon={User}>
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
            <p className="text-sm font-medium">{displayName}</p>
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
        <p className="text-[10px] text-muted-foreground mt-4">
          แก้ไขชื่อได้ที่ส่วน &ldquo;ข้อมูลตัวตน&rdquo; ด้านล่าง
        </p>
      </SectionCard>

      {/* ── Notice: shared with homeroom advisor ────────────────────────── */}
      <div className="flex items-start gap-3 p-4 bg-primary/8 border border-primary/20 rounded-xl">
        <Info size={16} className="text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-primary">
          ข้อมูลตัวตน, ข้อมูลการศึกษา และข้อมูลติดต่อด้านล่างนี้ จะแสดงให้ <b>ครูที่ปรึกษาประจำห้อง Homeroom</b> ของคุณเห็น
          เพื่อใช้ติดต่อและดูแลนักเรียน — ครูวิชาอื่นหรือนักเรียนคนอื่นจะไม่เห็นข้อมูลนี้
        </p>
      </div>

      <form key={profile?.updated_at ?? 'new'} onSubmit={handleInfoSave} className="space-y-5">
        {/* ── Identity ────────────────────────────────────────────────────── */}
        <SectionCard title="ข้อมูลตัวตน" description="คำนำหน้าชื่อ ชื่อ สกุล ชื่อเล่น วันเกิด เพศสภาพ และข้อมูลสุขภาพ" icon={User}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8.5rem_1fr_1fr] mb-4">
            <div className="space-y-1.5">
              <Label htmlFor="prefix">คำนำหน้าชื่อ</Label>
              <NativeSelect
                id="prefix"
                name="prefix"
                defaultValue={user.prefix ?? ''}
                required className="flex w-full"
              >
                <option value="" disabled>เลือก</option>
                {NAME_PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="first_name">ชื่อ</Label>
              <Input id="first_name" name="first_name" defaultValue={user.first_name ?? ''} placeholder="ชื่อจริง" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">สกุล</Label>
              <Input id="last_name" name="last_name" defaultValue={user.last_name ?? ''} placeholder="นามสกุล" required />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-4">
            <div className="space-y-1.5">
              <Label htmlFor="nickname">ชื่อเล่น</Label>
              <Input id="nickname" name="nickname" defaultValue={profile?.nickname ?? ''} placeholder="เช่น น้องแบม" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date_of_birth">วันเกิด</Label>
              <Input id="date_of_birth" name="date_of_birth" type="date" defaultValue={profile?.date_of_birth ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gender">เพศสภาพ</Label>
              <NativeSelect
                id="gender"
                name="gender"
                defaultValue={profile?.gender ?? ''} className="flex w-full"
              >
                <option value="">ไม่ระบุ</option>
                <option value="male">ชาย</option>
                <option value="female">หญิง</option>
              </NativeSelect>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="food_allergy">ข้อมูลการแพ้อาหาร</Label>
              <Input id="food_allergy" name="food_allergy" defaultValue={profile?.food_allergy ?? ''} placeholder="เช่น แพ้กุ้ง, ถั่วลิสง (ถ้าไม่มีเว้นว่างได้)" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="chronic_disease">โรคประจำตัว</Label>
              <Input id="chronic_disease" name="chronic_disease" defaultValue={profile?.chronic_disease ?? ''} placeholder="เช่น หอบหืด, ภูมิแพ้ (ถ้าไม่มีเว้นว่างได้)" />
            </div>
          </div>
        </SectionCard>

        {/* ── Academic ────────────────────────────────────────────────────── */}
        <SectionCard title="ข้อมูลการศึกษา" description="ระดับชั้น ห้อง โรงเรียน และรหัสประจำตัว" icon={GraduationCap}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-4">
            <div className="space-y-1.5">
              <Label htmlFor="grade_level">ระดับชั้น</Label>
              <NativeSelect
                id="grade_level"
                name="grade_level"
                defaultValue={profile?.grade_level ?? ''} className="flex w-full"
              >
                <option value="">เลือกระดับชั้น</option>
                {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="section_number">ห้อง</Label>
              <NativeSelect
                id="section_number"
                name="section_number"
                defaultValue={profile?.section_number ?? ''} className="flex w-full"
              >
                <option value="">เลือกห้อง</option>
                {SECTION_NUMBERS.map(n => <option key={n} value={n}>ห้อง {n}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="school_name">โรงเรียน</Label>
              <Input id="school_name" name="school_name" defaultValue={profile?.school_name ?? ''} placeholder="ชื่อโรงเรียน" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="student_code">รหัสนักเรียน</Label>
              <Input id="student_code" name="student_code" defaultValue={profile?.student_code ?? ''} placeholder="รหัสประจำตัวนักเรียน" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="class_number">เลขที่</Label>
              <Input id="class_number" name="class_number" type="number" min={1} defaultValue={profile?.class_number ?? ''} placeholder="เลขที่ในห้อง" />
            </div>
          </div>
        </SectionCard>

        {/* ── Contact ─────────────────────────────────────────────────────── */}
        <SectionCard title="ข้อมูลติดต่อ" description="ที่อยู่ เบอร์โทร และผู้ปกครอง" icon={Phone}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="address">ที่อยู่</Label>
                <Input id="address" name="address" defaultValue={profile?.address ?? ''} placeholder="บ้านเลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">เบอร์โทรนักเรียน</Label>
                <Input id="phone" name="phone" defaultValue={profile?.phone ?? ''} placeholder="08x-xxx-xxxx" />
              </div>
            </div>

            <div className="pt-2 border-t space-y-3">
              {guardians.map((g, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label>{i === 0 ? 'ชื่อผู้ปกครอง' : `ชื่อผู้ปกครองคนที่ ${i + 1}`}</Label>
                    <Input
                      value={g.name}
                      onChange={e => updateGuardian(i, 'name', e.target.value)}
                      placeholder="ชื่อ-นามสกุลผู้ปกครอง"
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <Label>{i === 0 ? 'เบอร์โทรผู้ปกครอง' : `เบอร์โทรผู้ปกครองคนที่ ${i + 1}`}</Label>
                    <Input
                      value={g.phone}
                      onChange={e => updateGuardian(i, 'phone', e.target.value)}
                      placeholder="08x-xxx-xxxx"
                    />
                  </div>
                  {guardians.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeGuardian(i)}
                      className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="ลบผู้ปกครองคนนี้"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}
              {guardians.length < MAX_GUARDIANS && (
                <button
                  type="button"
                  onClick={addGuardian}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <Plus size={14} /> เพิ่มผู้ปกครองอีกคน
                </button>
              )}
            </div>
          </div>
        </SectionCard>

        <div className="flex justify-end">
          <Button type="submit" disabled={isInfoPending} className="min-w-[120px]">
            {isInfoPending ? 'กำลังบันทึก...' : 'บันทึกข้อมูลส่วนตัว'}
          </Button>
        </div>
      </form>

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
    </div>
  )
}
