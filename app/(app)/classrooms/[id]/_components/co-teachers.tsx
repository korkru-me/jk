'use client'

import { useState } from 'react'
import { UserPlus, ChevronDown, Crown, Shield, Eye, Trash2, Copy, Check, Link2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  createClassroomInvitation,
  revokeClassroomInvitation,
  removeCoTeacher,
  updateCoTeacherPermission,
} from '@/lib/actions/co-teachers'
import type { CoTeacherPermission } from '@/lib/types'
import { IconButton } from '@/components/ui/icon-button'
import { Card } from '@/components/ui/card'

const PERM_CFG: Record<CoTeacherPermission, { label: string; desc: string; icon: typeof Crown; color: string }> = {
  admin: { label: 'แอดมินเต็มตัว', desc: 'จัดการทุกอย่างได้', icon: Crown, color: 'text-warning' },
  manage: { label: 'จัดการข้อสอบ', desc: 'สร้าง ตรวจ แก้ไขข้อสอบได้', icon: Shield, color: 'text-primary' },
  view: { label: 'ดูได้อย่างเดียว', desc: 'ดูคะแนนและรายงาน', icon: Eye, color: 'text-muted-foreground' },
}

export interface CoTeacherRow {
  id: string
  userId: string
  permission: CoTeacherPermission
  createdAt: string
  fullName: string
  email: string
}

export interface InviteRow {
  id: string
  token: string
  permission: CoTeacherPermission
  email: string | null
  expiresAt: string
  createdAt: string
}

interface Props {
  classroomId: string
  ownerName: string
  canManage: boolean
  coTeachers: CoTeacherRow[]
  invites: InviteRow[]
}

export function CoTeachers({ classroomId, ownerName, canManage, coTeachers, invites }: Props) {
  const [openPerm, setOpenPerm] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [invitePerm, setInvitePerm] = useState<CoTeacherPermission>('manage')
  const [pendingLink, setPendingLink] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function updatePerm(id: string, perm: CoTeacherPermission) {
    setOpenPerm(null)
    const res = await updateCoTeacherPermission(id, perm, classroomId)
    if (res.error) toast.error(res.error)
    else toast.success('อัปเดตสิทธิ์แล้ว')
  }

  async function removeTeacher(id: string) {
    const res = await removeCoTeacher(id, classroomId)
    if (res.error) toast.error(res.error)
    else toast.success('ลบผู้ช่วยสอนแล้ว')
  }

  async function handleCreateInvite() {
    setBusy(true)
    const res = await createClassroomInvitation(classroomId, invitePerm)
    setBusy(false)
    if ('error' in res) { toast.error(res.error); return }
    const link = `${window.location.origin}/join-classroom?token=${res.token}`
    setPendingLink(link)
  }

  async function handleRevoke(id: string) {
    const res = await revokeClassroomInvitation(id, classroomId)
    if (res.error) toast.error(res.error)
    else toast.success('ยกเลิกคำเชิญแล้ว')
  }

  function copyLink(link: string, key: string) {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(key)
      toast.success('คัดลอกลิงก์แล้ว')
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div className="space-y-4">
      {/* Owner */}
      <div className="bg-warning/10 border border-warning/20 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center font-bold text-warning text-sm shrink-0">
          {ownerName.slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm">{ownerName}</p>
          <p className="text-xs text-warning flex items-center gap-1 mt-0.5">
            <Crown className="w-3 h-3" /> เจ้าของห้องเรียน
          </p>
        </div>
      </div>

      {/* Co-teacher list */}
      <Card edge="ring" className="overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">ผู้ช่วยสอน ({coTeachers.length} คน)</p>
          {canManage && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setShowInvite(!showInvite); setPendingLink(null) }}>
              <UserPlus className="w-3.5 h-3.5" /> เชิญผู้ช่วยสอน
            </Button>
          )}
        </div>

        {/* Invite form */}
        {showInvite && canManage && (
          <div className="px-4 py-3 bg-primary/10 border-b border-border space-y-3">
            {!pendingLink ? (
              <>
                <div className="flex gap-2">
                  <select
                    value={invitePerm}
                    onChange={e => setInvitePerm(e.target.value as CoTeacherPermission)}
                    className="flex-1 px-3 py-2 text-sm border border-border rounded-xl outline-none bg-card"
                  >
                    {(Object.keys(PERM_CFG) as CoTeacherPermission[]).map(p => (
                      <option key={p} value={p}>{PERM_CFG[p].label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleCreateInvite} disabled={busy}>
                    {busy ? 'กำลังสร้าง...' : 'สร้างลิงก์เชิญ'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowInvite(false)}>ยกเลิก</Button>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">ส่งลิงก์นี้ให้ครูที่ต้องการเชิญ (ผ่าน Line, Email ฯลฯ)</p>
                <Card radius="md" className="flex items-center gap-2 p-2.5">
                  <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground truncate flex-1 font-mono">{pendingLink}</p>
                </Card>
                <div className="flex gap-2">
                  <Button size="sm" className="gap-1.5" onClick={() => copyLink(pendingLink, 'new')}>
                    {copied === 'new' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied === 'new' ? 'คัดลอกแล้ว!' : 'คัดลอกลิงก์'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowInvite(false); setPendingLink(null) }}>เสร็จสิ้น</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {coTeachers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">ยังไม่มีผู้ช่วยสอน</p>
        ) : (
          <div className="divide-y divide-border">
            {coTeachers.map(t => {
              const perm = PERM_CFG[t.permission]
              const PermIcon = perm.icon
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-100 to-blue-100 flex items-center justify-center text-xs font-bold text-tint-1 shrink-0">
                    {t.fullName.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{t.fullName}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.email}</p>
                  </div>
                  {/* Permission dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => canManage && setOpenPerm(openPerm === t.id ? null : t.id)}
                      disabled={!canManage}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${perm.color} border-current/20 bg-current/5 ${canManage ? 'hover:bg-current/10' : 'opacity-70 cursor-default'}`}
                    >
                      <PermIcon className="w-3 h-3" />
                      {perm.label}
                      {canManage && <ChevronDown className="w-3 h-3" />}
                    </button>
                    {openPerm === t.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenPerm(null)} />
                        <Card radius="md" edge="ring" elevation="lg" className="absolute right-0 top-9 z-20 py-1 min-w-[180px]">
                          {(Object.keys(PERM_CFG) as CoTeacherPermission[]).map(p => {
                            const cfg = PERM_CFG[p]
                            const Icon = cfg.icon
                            return (
                              <button
                                key={p}
                                className={`w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-accent transition-colors ${t.permission === p ? 'bg-muted' : ''}`}
                                onClick={() => updatePerm(t.id, p)}
                              >
                                <Icon className={`w-3.5 h-3.5 mt-0.5 ${cfg.color}`} />
                                <div>
                                  <p className="text-sm font-medium text-foreground">{cfg.label}</p>
                                  <p className="text-xs text-muted-foreground">{cfg.desc}</p>
                                </div>
                              </button>
                            )
                          })}
                        </Card>
                      </>
                    )}
                  </div>
                  {canManage && (
                    <IconButton
                      onClick={() => removeTeacher(t.id)}
                      label="ลบครูผู้ช่วยสอน"
                      size="sm"
                      className="hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 />
                    </IconButton>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Active invite links */}
      {canManage && invites.length > 0 && (
        <Card edge="ring" className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground">คำเชิญที่ยังไม่ถูกใช้ ({invites.length})</p>
          </div>
          <div className="divide-y divide-border">
            {invites.map(inv => {
              const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/join-classroom?token=${inv.token}`
              return (
                <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-muted-foreground truncate">{link}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">สิทธิ์: {PERM_CFG[inv.permission].label}</p>
                  </div>
                  <IconButton
                    onClick={() => copyLink(link, inv.id)}
                    label="คัดลอกลิงก์เชิญ"
                    size="sm"
                    className="hover:bg-primary/10 hover:text-primary"
                  >
                    {copied === inv.id ? <Check /> : <Copy />}
                  </IconButton>
                  <IconButton
                    onClick={() => handleRevoke(inv.id)}
                    label="ยกเลิกคำเชิญ"
                    size="sm"
                    className="hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X />
                  </IconButton>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
