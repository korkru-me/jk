'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateMyAvatar } from '@/lib/actions/avatar'
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { AvatarCropEditor } from '@/components/settings/avatar-crop-editor'
import { PasswordSettingsSection } from '@/components/settings/password-settings-form'
import { SignInMethodsSection } from '@/components/settings/sign-in-methods-section'
import type { AccountSignInMethods, AccountSignInMethodActions } from '@/lib/auth/account-methods-types'
import {
  User, GraduationCap, Phone, Eye, Plus, X,
} from 'lucide-react'

const GRADE_LEVELS = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6', 'อื่นๆ']
const SECTION_NUMBERS = Array.from({ length: 15 }, (_, i) => i + 1)
const MAX_GUARDIANS = 3
const NAME_PREFIXES: NamePrefix[] = ['เด็กหญิง', 'เด็กชาย', 'นาย', 'นางสาว']

function AudienceNotice({ title, audience, detail }: { title: string; audience: string; detail: string }) {
  const [open, setOpen] = useState(false)
  return (
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger render={<Button type="button" variant="ghost" size="xs" />}
        className="h-auto min-h-7 max-w-full gap-1.5 whitespace-normal py-1 text-left text-xs font-normal text-muted-foreground"
        aria-label={`ผู้ที่ดู${title}ได้: ${audience}`} aria-expanded={open}
        onClick={() => setOpen(value => !value)}>
        <Eye size={13} className="shrink-0" /><span>{audience}</span>
      </HoverCardTrigger>
      <HoverCardContent align="end" role="region" aria-label={`รายละเอียดผู้ที่ดู${title}ได้`}
        className="max-w-[calc(100vw-2rem)] text-xs leading-relaxed">{detail}</HoverCardContent>
    </HoverCard>
  )
}

function SectionCard({ title, description, audience, audienceDetail, icon: Icon, children }: {
  title: string
  description?: string
  audience?: string
  audienceDetail?: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <Card className="@container/profile-section overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b bg-muted/20 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon size={15} className="text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">{title}</h2>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {audience && audienceDetail && <AudienceNotice title={title} audience={audience} detail={audienceDetail} />}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
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
  /** Synthetic lab routes substitute actions so preview forms cannot mutate accounts. */
  saveProfileAction?: typeof updateMyStudentProfile
  changePasswordAction?: typeof updatePassword
  saveAvatarAction?: typeof updateMyAvatar
  signInMethods?: AccountSignInMethods | null
  signInMethodActions?: AccountSignInMethodActions
}

export function StudentProfileSettings({ user, profile, saveProfileAction = updateMyStudentProfile, changePasswordAction = updatePassword, saveAvatarAction = updateMyAvatar, signInMethods, signInMethodActions }: StudentProfileSettingsProps) {
  const router = useRouter()
  const [isInfoPending, startInfoTransition] = useTransition()

  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar_url)

  const [guardians, setGuardians] = useState<StudentGuardian[]>(
    profile?.guardians?.length ? profile.guardians : [{ name: '', phone: '' }]
  )


  function handleInfoSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('guardians', JSON.stringify(guardians))
    startInfoTransition(async () => {
      const res = await saveProfileAction(fd)
      if (res.error) toast.error(res.error)
      else toast.success('บันทึกข้อมูลสำเร็จ ✓')
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
              <img src={avatarPreview} alt="รูปโปรไฟล์" className="w-20 h-20 rounded-2xl object-cover border-2 border-border" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-2xl font-black">
                {initials}
              </div>
            )}
          </div>
          <div className="min-w-0 space-y-1.5">
            <p className="text-sm font-medium">{displayName}</p>
            <p className="break-all text-xs text-muted-foreground">{user.email}</p>
            <p className="text-[10px] text-muted-foreground">สมาชิกตั้งแต่ {joinedDate}</p>
            <AvatarCropEditor src={avatarPreview} onChange={async file => {
              const form = new FormData()
              form.set('avatar', file)
              const result = await saveAvatarAction(form)
              if (result.error || !result.avatarUrl) return { error: result.error ?? 'บันทึกรูปไม่สำเร็จ' }
              setAvatarPreview(result.avatarUrl)
              toast('บันทึกรูปโปรไฟล์แล้ว')
              router.refresh()
              return {}
            }} />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-4">
          แก้ไขชื่อได้ที่ส่วน &ldquo;ข้อมูลตัวตน&rdquo; ด้านล่าง
        </p>
      </SectionCard>

      <form key={profile?.updated_at ?? 'new'} onSubmit={handleInfoSave} className="space-y-5">
        {/* ── Identity ────────────────────────────────────────────────────── */}
        <SectionCard title="ข้อมูลตัวตน" icon={User} audience="ครูที่ปรึกษา"
          audienceDetail="ครูที่ปรึกษาในห้อง Homeroom ดูข้อมูลตัวตนและสุขภาพส่วนนี้ได้ ส่วนชื่อที่ใช้แสดงในระบบปรากฏในห้องเรียนด้วย">
          <div className="mb-4 grid grid-cols-1 gap-4 @lg/profile-section:grid-cols-[8.5rem_1fr_1fr]">
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
          <div className="mb-4 grid grid-cols-1 gap-4 @lg/profile-section:grid-cols-3">
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
          <div className="grid grid-cols-1 gap-4 @md/profile-section:grid-cols-2">
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
        <SectionCard title="ข้อมูลการศึกษา" icon={GraduationCap} audience="ครูที่ปรึกษาและครูประจำวิชา"
          audienceDetail="ครูประจำวิชาในห้องเรียนของคุณดูระดับชั้น ห้อง รหัสนักเรียน และเลขที่ได้ ส่วนชื่อโรงเรียนแสดงให้ครูที่ปรึกษาในห้อง Homeroom">
          <div className="mb-4 grid grid-cols-1 gap-4 @lg/profile-section:grid-cols-3">
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
          <div className="grid grid-cols-1 gap-4 @md/profile-section:grid-cols-2">
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
        <SectionCard title="ข้อมูลติดต่อ" icon={Phone} audience="ครูที่ปรึกษา"
          audienceDetail="ครูที่ปรึกษาในห้อง Homeroom ดูที่อยู่ เบอร์โทร และข้อมูลผู้ปกครองส่วนนี้ได้ เพื่อใช้ติดต่อและดูแลนักเรียน">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 @md/profile-section:grid-cols-2">
              <div className="space-y-1.5 @md/profile-section:col-span-2">
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
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor={`guardian-name-${i}`}>{i === 0 ? 'ชื่อผู้ปกครอง' : `ชื่อผู้ปกครองคนที่ ${i + 1}`}</Label>
                    <Input
                      id={`guardian-name-${i}`}
                      value={g.name}
                      onChange={e => updateGuardian(i, 'name', e.target.value)}
                      placeholder="ชื่อ-นามสกุลผู้ปกครอง"
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor={`guardian-phone-${i}`}>{i === 0 ? 'เบอร์โทรผู้ปกครอง' : `เบอร์โทรผู้ปกครองคนที่ ${i + 1}`}</Label>
                    <Input
                      id={`guardian-phone-${i}`}
                      value={g.phone}
                      onChange={e => updateGuardian(i, 'phone', e.target.value)}
                      placeholder="08x-xxx-xxxx"
                    />
                  </div>
                  {guardians.length > 1 && (
                    <Button variant="ghost" size="icon-sm"
                      type="button"
                      onClick={() => removeGuardian(i)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`ลบผู้ปกครองคนที่ ${i + 1}`}
                    >
                      <X size={15} />
                    </Button>
                  )}
                </div>
              ))}
              {guardians.length < MAX_GUARDIANS && (
                <Button variant="link" size="xs"
                  type="button"
                  onClick={addGuardian} className="flex items-center gap-1.5">
                  <Plus size={14} /> เพิ่มผู้ปกครองอีกคน
                </Button>
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
      <SignInMethodsSection methods={signInMethods ?? null} {...signInMethodActions} />
      <PasswordSettingsSection email={user.email} changePasswordAction={changePasswordAction} />
    </div>
  )
}
