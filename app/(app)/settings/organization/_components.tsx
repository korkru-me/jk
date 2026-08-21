'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  inviteMemberByEmail,
  createInviteLink,
  revokeInvite,
  updateMemberRole,
  removeMember,
  renameOrg,
} from '@/lib/actions/org-members'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type OrgRole = 'owner' | 'admin' | 'teacher' | 'student'

interface OrgData {
  org: { id: string; name: string; subscription_tier: string; is_personal: boolean }
  myRole: OrgRole
  currentUserId: string
  members: { userId: string; role: string; joinedAt: string; fullName: string; email: string }[]
  invites: { id: string; token: string; role: string; email: string | null; expiresAt: string; createdAt: string }[]
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'เจ้าของ',
  admin: 'ผู้ดูแล',
  teacher: 'ครู',
  student: 'นักเรียน',
}

const ROLE_COLOR: Record<string, string> = {
  owner: 'bg-warning/10 text-warning',
  admin: 'bg-tint-1/10 text-tint-1',
  teacher: 'bg-primary/10 text-primary',
  student: 'bg-success/10 text-green-800',
}

function getBaseUrl() {
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

// ─── Rename Org ────────────────────────────────────────────────────────────

function RenameOrgForm({ currentName }: { currentName: string }) {
  const [name, setName] = useState(currentName)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || name.trim() === currentName) return
    startTransition(async () => {
      const res = await renameOrg(name.trim())
      if (res.error) toast.error(res.error)
      else toast.success('เปลี่ยนชื่อสำเร็จ')
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="max-w-xs"
        placeholder="ชื่อสถาบัน / ทีม"
      />
      <Button type="submit" disabled={pending || !name.trim() || name.trim() === currentName} size="sm">
        {pending ? 'กำลังบันทึก…' : 'บันทึก'}
      </Button>
    </form>
  )
}

// ─── Invite by Email ───────────────────────────────────────────────────────

function InviteByEmailForm() {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'teacher' | 'student'>('teacher')
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    startTransition(async () => {
      const res = await inviteMemberByEmail(email.trim(), role)
      if (res.error) toast.error(res.error)
      else {
        toast.success('เพิ่มสมาชิกสำเร็จ')
        setEmail('')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-end">
      <div className="flex-1 min-w-48">
        <label className="text-xs text-muted-foreground mb-1 block">อีเมล</label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teacher@school.ac.th"
          className="h-9"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">บทบาท</label>
        <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
          <SelectTrigger className="h-9 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">ผู้ดูแล</SelectItem>
            <SelectItem value="teacher">ครู</SelectItem>
            <SelectItem value="student">นักเรียน</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending || !email.trim()} size="sm" className="h-9">
        {pending ? 'กำลังเพิ่ม…' : 'เพิ่มสมาชิก'}
      </Button>
    </form>
  )
}

// ─── Invite Link ───────────────────────────────────────────────────────────

function InviteLinkSection({ invites }: { invites: OrgData['invites'] }) {
  const [role, setRole] = useState<'admin' | 'teacher' | 'student'>('teacher')
  const [pending, startTransition] = useTransition()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  function handleCreate() {
    startTransition(async () => {
      const res = await createInviteLink(role)
      if (res.error) toast.error(res.error)
      else toast.success('สร้างลิงก์เรียบร้อย')
    })
  }

  function copyLink(token: string, id: string) {
    const url = `${getBaseUrl()}/join-org?token=${token}`
    navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function handleRevoke(id: string) {
    setRevoking(id)
    // Use a transition for UI feedback
    ;(async () => {
      const res = await revokeInvite(id)
      if (res.error) toast.error(res.error)
      else toast.success('ยกเลิกลิงก์แล้ว')
      setRevoking(null)
    })()
  }

  const daysLeft = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now()
    return Math.ceil(diff / 86400000)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">บทบาทสำหรับลิงก์</label>
          <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
            <SelectTrigger className="h-9 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">ผู้ดูแล</SelectItem>
              <SelectItem value="teacher">ครู</SelectItem>
              <SelectItem value="student">นักเรียน</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleCreate} disabled={pending} size="sm" className="h-9" variant="outline">
          {pending ? 'กำลังสร้าง…' : '+ สร้างลิงก์เชิญ'}
        </Button>
      </div>

      {invites.length > 0 && (
        <div className="space-y-2">
          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center gap-2 p-3 rounded-lg border bg-muted text-sm">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLOR[inv.role] ?? ''}`}>
                {ROLE_LABEL[inv.role] ?? inv.role}
              </span>
              <span className="flex-1 font-mono text-xs text-muted-foreground truncate">
                {`${getBaseUrl()}/join-org?token=${inv.token.slice(0, 12)}…`}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">หมดอายุใน {daysLeft(inv.expiresAt)} วัน</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => copyLink(inv.token, inv.id)}
              >
                {copiedId === inv.id ? '✓ คัดลอกแล้ว' : 'คัดลอก'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive/80"
                onClick={() => handleRevoke(inv.id)}
                disabled={revoking === inv.id}
              >
                ยกเลิก
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Members List ──────────────────────────────────────────────────────────

function MembersList({
  members,
  myRole,
  currentUserId,
}: {
  members: OrgData['members']
  myRole: OrgRole
  currentUserId: string
}) {
  const [pending, startTransition] = useTransition()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const canManage = myRole === 'owner' || myRole === 'admin'

  function handleRoleChange(userId: string, newRole: 'admin' | 'teacher' | 'student') {
    setLoadingId(userId)
    startTransition(async () => {
      const res = await updateMemberRole(userId, newRole)
      if (res.error) toast.error(res.error)
      else toast.success('เปลี่ยนบทบาทสำเร็จ')
      setLoadingId(null)
    })
  }

  function handleRemove(userId: string, name: string) {
    if (!confirm(`ต้องการลบ "${name}" ออกจากทีมใช่ไหม?`)) return
    setLoadingId(userId)
    startTransition(async () => {
      const res = await removeMember(userId)
      if (res.error) toast.error(res.error)
      else toast.success('ลบสมาชิกสำเร็จ')
      setLoadingId(null)
    })
  }

  return (
    <div className="divide-y rounded-lg border overflow-hidden">
      {members.map((m) => {
        const isMe = m.userId === currentUserId
        const isOwner = m.role === 'owner'
        const isLoading = loadingId === m.userId

        return (
          <div key={m.userId} className="flex items-center gap-3 px-4 py-3 bg-card">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold shrink-0">
              {m.fullName ? m.fullName.charAt(0) : m.email.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {m.fullName || '(ไม่มีชื่อ)'}
                {isMe && <span className="ml-2 text-xs text-muted-foreground">(คุณ)</span>}
              </p>
              <p className="text-xs text-muted-foreground truncate">{m.email}</p>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${ROLE_COLOR[m.role] ?? 'bg-muted text-muted-foreground'}`}>
              {ROLE_LABEL[m.role] ?? m.role}
            </span>
            {canManage && !isMe && !isOwner && (
              <DropdownMenu>
                <DropdownMenuTrigger className="h-7 w-7 inline-flex items-center justify-center rounded-md text-sm hover:bg-muted disabled:opacity-50" disabled={isLoading}>
                  {isLoading ? '…' : '⋯'}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onSelect={() => handleRoleChange(m.userId, 'admin')}>
                    เปลี่ยนเป็น ผู้ดูแล
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => handleRoleChange(m.userId, 'teacher')}>
                    เปลี่ยนเป็น ครู
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => handleRoleChange(m.userId, 'student')}>
                    เปลี่ยนเป็น นักเรียน
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => handleRemove(m.userId, m.fullName || m.email)}
                    className="text-destructive"
                  >
                    ลบออกจากทีม
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Root client component ─────────────────────────────────────────────────

export function OrgSettingsClient({ data }: { data: OrgData }) {
  const canManage = data.myRole === 'owner' || data.myRole === 'admin'

  return (
    <div className="space-y-8">
      {/* Org name */}
      {canManage && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">ชื่อสถาบัน / ทีม</h2>
          <RenameOrgForm currentName={data.org.name} />
        </section>
      )}

      {/* Members */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            สมาชิก <span className="text-muted-foreground font-normal text-sm">({data.members.length} คน)</span>
          </h2>
        </div>
        <MembersList members={data.members} myRole={data.myRole} currentUserId={data.currentUserId} />
      </section>

      {/* Invite */}
      {canManage && (
        <>
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">เชิญสมาชิกผ่านอีเมล</h2>
            <p className="text-xs text-muted-foreground">ผู้ใช้ต้องสมัครบัญชีก่อนจึงจะเพิ่มได้</p>
            <InviteByEmailForm />
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">ลิงก์เชิญ</h2>
            <p className="text-xs text-muted-foreground">ลิงก์มีอายุ 7 วัน ใครก็ตามที่มีลิงก์สามารถเข้าร่วมได้</p>
            <InviteLinkSection invites={data.invites} />
          </section>
        </>
      )}
    </div>
  )
}
