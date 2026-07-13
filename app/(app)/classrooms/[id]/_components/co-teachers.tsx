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

const PERM_CFG: Record<CoTeacherPermission, { label: string; desc: string; icon: typeof Crown; color: string }> = {
  admin: { label: 'แอดมินเต็มตัว', desc: 'จัดการทุกอย่างได้', icon: Crown, color: 'text-amber-600' },
  manage: { label: 'จัดการข้อสอบ', desc: 'สร้าง ตรวจ แก้ไขข้อสอบได้', icon: Shield, color: 'text-blue-600' },
  view: { label: 'ดูได้อย่างเดียว', desc: 'ดูคะแนนและรายงาน', icon: Eye, color: 'text-gray-500' },
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
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center font-bold text-amber-700 text-sm shrink-0">
          {ownerName.slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{ownerName}</p>
          <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
            <Crown className="w-3 h-3" /> เจ้าของห้องเรียน
          </p>
        </div>
      </div>

      {/* Co-teacher list */}
      <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">ผู้ช่วยสอน ({coTeachers.length} คน)</p>
          {canManage && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setShowInvite(!showInvite); setPendingLink(null) }}>
              <UserPlus className="w-3.5 h-3.5" /> เชิญผู้ช่วยสอน
            </Button>
          )}
        </div>

        {/* Invite form */}
        {showInvite && canManage && (
          <div className="px-4 py-3 bg-blue-50/50 border-b border-gray-100 space-y-3">
            {!pendingLink ? (
              <>
                <div className="flex gap-2">
                  <select
                    value={invitePerm}
                    onChange={e => setInvitePerm(e.target.value as CoTeacherPermission)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none bg-white"
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
                <p className="text-xs text-gray-500">ส่งลิงก์นี้ให้ครูที่ต้องการเชิญ (ผ่าน Line, Email ฯลฯ)</p>
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-2.5">
                  <Link2 className="w-4 h-4 text-gray-400 shrink-0" />
                  <p className="text-xs text-gray-600 truncate flex-1 font-mono">{pendingLink}</p>
                </div>
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
          <p className="py-8 text-center text-sm text-gray-400">ยังไม่มีผู้ช่วยสอน</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {coTeachers.map(t => {
              const perm = PERM_CFG[t.permission]
              const PermIcon = perm.icon
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-100 to-blue-100 flex items-center justify-center text-xs font-bold text-violet-700 shrink-0">
                    {t.fullName.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{t.fullName}</p>
                    <p className="text-xs text-gray-400 truncate">{t.email}</p>
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
                        <div className="absolute right-0 top-9 z-20 bg-white rounded-xl shadow-lg ring-1 ring-black/10 py-1 min-w-[180px]">
                          {(Object.keys(PERM_CFG) as CoTeacherPermission[]).map(p => {
                            const cfg = PERM_CFG[p]
                            const Icon = cfg.icon
                            return (
                              <button
                                key={p}
                                className={`w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors ${t.permission === p ? 'bg-gray-50' : ''}`}
                                onClick={() => updatePerm(t.id, p)}
                              >
                                <Icon className={`w-3.5 h-3.5 mt-0.5 ${cfg.color}`} />
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{cfg.label}</p>
                                  <p className="text-xs text-gray-400">{cfg.desc}</p>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                  {canManage && (
                    <button
                      onClick={() => removeTeacher(t.id)}
                      className="w-7 h-7 rounded-lg hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-gray-300 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Active invite links */}
      {canManage && invites.length > 0 && (
        <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">คำเชิญที่ยังไม่ถูกใช้ ({invites.length})</p>
          </div>
          <div className="divide-y divide-gray-50">
            {invites.map(inv => {
              const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/join-classroom?token=${inv.token}`
              return (
                <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-gray-500 truncate">{link}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">สิทธิ์: {PERM_CFG[inv.permission].label}</p>
                  </div>
                  <button
                    onClick={() => copyLink(link, inv.id)}
                    className="w-7 h-7 rounded-lg hover:bg-blue-50 hover:text-blue-500 flex items-center justify-center text-gray-300 transition-colors"
                  >
                    {copied === inv.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => handleRevoke(inv.id)}
                    className="w-7 h-7 rounded-lg hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-gray-300 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
