'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { createTeamOrg, joinTeamOrgByCode, leaveTeamOrg, deleteTeamOrg } from '@/lib/actions/team-org'
import type { OrgType, TeamOrg, TeamOrgMember } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface TeamOrgData {
  org: TeamOrg
  myRole: 'owner' | 'teacher'
  currentUserId: string
  members: TeamOrgMember[]
}

const TYPE_LABEL: Record<OrgType, string> = { school: 'โรงเรียน', team: 'ทีม' }
const ROLE_LABEL: Record<string, string> = { owner: 'เจ้าของ', teacher: 'สมาชิก' }
const ROLE_COLOR: Record<string, string> = {
  owner: 'bg-warning/10 text-warning',
  teacher: 'bg-primary/10 text-primary',
}

// ─── Create Org Modal ───────────────────────────────────────────────────────

function CreateOrgModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<OrgType>('school')
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    startTransition(async () => {
      const res = await createTeamOrg(name.trim(), type)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success('สร้างองค์กรสำเร็จ')
        onOpenChange(false)
        setName('')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>สร้างองค์กรใหม่</DialogTitle>
            <DialogDescription>เพื่อแชร์โจทย์กับเพื่อนครูในโรงเรียนหรือทีมเดียวกัน</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>ชื่อองค์กร</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น โรงเรียนสาธิต, ทีมฟิสิกส์ ม.ปลาย"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>ประเภท</Label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="org-type" checked={type === 'school'} onChange={() => setType('school')} />
                โรงเรียน
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="org-type" checked={type === 'team'} onChange={() => setType('team')} />
                ทีม
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? 'กำลังสร้าง…' : 'สร้างองค์กร'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Join Org Modal ─────────────────────────────────────────────────────────

function JoinOrgModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setError(null)
    startTransition(async () => {
      const res = await joinTeamOrgByCode(code.trim())
      if (res.error) {
        setError(res.error)
      } else {
        toast.success(`เข้าร่วม ${res.data?.name} แล้ว`)
        onOpenChange(false)
        setCode('')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>เข้าร่วมด้วย Invite Code</DialogTitle>
            <DialogDescription>กรอกรหัส 6 หลักที่ได้รับจากเจ้าขององค์กร</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>Invite Code</Label>
            <Input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase().slice(0, 6))
                setError(null)
              }}
              placeholder="ABC123"
              maxLength={6}
              className="font-mono text-lg tracking-widest text-center uppercase"
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending || !code.trim()}>
              {pending ? 'กำลังเข้าร่วม…' : 'เข้าร่วม'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Invite Code Card ───────────────────────────────────────────────────────

function InviteCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    toast.success('คัดลอกแล้ว!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border bg-muted">
      <div className="flex-1">
        <p className="text-xs text-muted-foreground mb-1">Invite Code</p>
        <p className="text-2xl font-mono font-bold tracking-[0.3em] text-foreground">{code}</p>
      </div>
      <Button variant="outline" onClick={handleCopy}>
        {copied ? '✓ คัดลอกแล้ว' : 'คัดลอก'}
      </Button>
    </div>
  )
}

// ─── Member List ────────────────────────────────────────────────────────────

function MemberList({ members }: { members: TeamOrgMember[] }) {
  return (
    <div className="rounded-lg border overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted text-muted-foreground text-xs">
          <tr>
            <th className="text-left font-medium px-4 py-2">ชื่อ</th>
            <th className="text-left font-medium px-4 py-2">อีเมล</th>
            <th className="text-left font-medium px-4 py-2">บทบาท</th>
            <th className="text-left font-medium px-4 py-2">วันที่เข้าร่วม</th>
          </tr>
        </thead>
        <tbody className="divide-y bg-card">
          {members.map((m) => (
            <tr key={m.userId}>
              <td className="px-4 py-3 flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
                  {m.fullName ? m.fullName.charAt(0) : m.email.charAt(0)}
                </div>
                <span className="truncate">{m.fullName || '(ไม่มีชื่อ)'}</span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{m.email}</td>
              <td className="px-4 py-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLOR[m.role] ?? 'bg-muted text-muted-foreground'}`}>
                  {ROLE_LABEL[m.role] ?? m.role}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {new Date(m.joinedAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Team Card ──────────────────────────────────────────────────────────────

function TeamCard({ team }: { team: TeamOrgData }) {
  const [expanded, setExpanded] = useState(false)
  const [pending, startTransition] = useTransition()
  const isOwner = team.myRole === 'owner'

  function handleLeave() {
    if (!confirm(`ต้องการออกจาก "${team.org.name}" ใช่ไหม?`)) return
    startTransition(async () => {
      const res = await leaveTeamOrg(team.org.id)
      if (res.error) toast.error(res.error)
      else toast.success('ออกจากองค์กรแล้ว')
    })
  }

  function handleDelete() {
    if (!confirm(`ต้องการลบ "${team.org.name}" ใช่ไหม? สมาชิกทั้งหมดจะถูกนำออก และโจทย์ของทุกคนจะกลายเป็นส่วนตัว การกระทำนี้ย้อนกลับไม่ได้`)) return
    startTransition(async () => {
      const res = await deleteTeamOrg(team.org.id)
      if (res.error) toast.error(res.error)
      else toast.success('ลบองค์กรแล้ว')
    })
  }

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-muted transition-colors"
      >
        <div>
          <p className="font-semibold text-foreground">{team.org.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {TYPE_LABEL[team.org.type]} · {team.members.length} คน · {ROLE_LABEL[team.myRole]}
          </p>
        </div>
        <span className="text-muted-foreground text-sm shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-6 border-t">
          <section className="space-y-3 pt-4">
            <h3 className="text-sm font-semibold text-foreground">Invite Code</h3>
            <InviteCodeCard code={team.org.invite_code} />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              สมาชิก <span className="text-muted-foreground font-normal">({team.members.length} คน)</span>
            </h3>
            <MemberList members={team.members} />
          </section>

          <section className="flex gap-3">
            {!isOwner && (
              <Button variant="outline" className="text-destructive hover:text-destructive/80" disabled={pending} onClick={handleLeave}>
                ออกจากองค์กร
              </Button>
            )}
            {isOwner && (
              <Button variant="outline" className="text-destructive hover:text-destructive/80" disabled={pending} onClick={handleDelete}>
                ลบองค์กร
              </Button>
            )}
          </section>
        </div>
      )}
    </Card>
  )
}

// ─── Root client component ─────────────────────────────────────────────────

export function TeamOrgClient({ teams }: { teams: TeamOrgData[] }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-foreground">ทีมของฉัน</h1>
          <p className="text-sm text-muted-foreground mt-0.5">อยู่ใน {teams.length} องค์กร — เป็นสมาชิกได้พร้อมกันหลายทีม</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setCreateOpen(true)}>สร้างองค์กรใหม่</Button>
          <Button variant="outline" onClick={() => setJoinOpen(true)}>เข้าร่วมด้วย Invite Code</Button>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-12 space-y-4 rounded-2xl border bg-muted">
          <div className="text-4xl">🏫</div>
          <div>
            <p className="font-medium text-foreground">ยังไม่มีองค์กร</p>
            <p className="text-sm text-muted-foreground mt-1">สร้างองค์กรใหม่หรือเข้าร่วมด้วย Invite Code เพื่อแชร์โจทย์กับเพื่อนครู</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {teams.map(team => <TeamCard key={team.org.id} team={team} />)}
        </div>
      )}

      <CreateOrgModal open={createOpen} onOpenChange={setCreateOpen} />
      <JoinOrgModal open={joinOpen} onOpenChange={setJoinOpen} />
    </div>
  )
}
