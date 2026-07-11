'use client'

import { useState } from 'react'
import { UserPlus, ChevronDown, Crown, Shield, Eye, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

type Permission = 'admin' | 'manage' | 'view'
const PERM_CFG: Record<Permission, { label: string; desc: string; icon: typeof Crown; color: string }> = {
  admin: { label: 'แอดมินเต็มตัว', desc: 'จัดการทุกอย่างได้', icon: Crown, color: 'text-amber-600' },
  manage: { label: 'จัดการข้อสอบ', desc: 'สร้าง ตรวจ แก้ไขข้อสอบได้', icon: Shield, color: 'text-blue-600' },
  view: { label: 'ดูได้อย่างเดียว', desc: 'ดูคะแนนและรายงาน', icon: Eye, color: 'text-gray-500' },
}

interface CoTeacher {
  id: string
  name: string
  email: string
  permission: Permission
  initials: string
  since: string
}

const MOCK_CO_TEACHERS: CoTeacher[] = [
  { id: '1', name: 'ครูพัชรีญา บุญมา', email: 'patchareeya@school.ac.th', permission: 'manage', initials: 'พบ', since: '3 เดือนที่แล้ว' },
  { id: '2', name: 'ครูวิชัย ศรีสุข', email: 'wichai@school.ac.th', permission: 'view', initials: 'วศ', since: '1 เดือนที่แล้ว' },
]

export function CoTeachers({ ownerName }: { ownerName: string }) {
  const [teachers, setTeachers] = useState<CoTeacher[]>(MOCK_CO_TEACHERS)
  const [openPerm, setOpenPerm] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitePerm, setInvitePerm] = useState<Permission>('manage')

  function updatePerm(id: string, perm: Permission) {
    setTeachers(prev => prev.map(t => t.id === id ? { ...t, permission: perm } : t))
    setOpenPerm(null)
    toast.success('อัปเดตสิทธิ์แล้ว')
  }

  function removeTeacher(id: string) {
    setTeachers(prev => prev.filter(t => t.id !== id))
    toast.success('ลบผู้ช่วยสอนแล้ว')
  }

  function handleInvite() {
    if (!inviteEmail.trim()) { toast.error('กรอกอีเมลก่อน'); return }
    toast.success(`ส่งคำเชิญไปที่ ${inviteEmail} แล้ว (ฟีเจอร์กำลังพัฒนา)`)
    setInviteEmail('')
    setShowInvite(false)
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
          <p className="text-sm font-semibold text-gray-900">ผู้ช่วยสอน ({teachers.length} คน)</p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowInvite(!showInvite)}>
            <UserPlus className="w-3.5 h-3.5" /> เชิญผู้ช่วยสอน
          </Button>
        </div>

        {/* Invite form */}
        {showInvite && (
          <div className="px-4 py-3 bg-blue-50/50 border-b border-gray-100 space-y-3">
            <div className="flex gap-2">
              <input
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="อีเมลครู..."
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                onKeyDown={e => e.key === 'Enter' && handleInvite()}
              />
              <select
                value={invitePerm}
                onChange={e => setInvitePerm(e.target.value as Permission)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none bg-white"
              >
                {(Object.keys(PERM_CFG) as Permission[]).map(p => (
                  <option key={p} value={p}>{PERM_CFG[p].label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleInvite}>ส่งคำเชิญ</Button>
              <Button size="sm" variant="outline" onClick={() => setShowInvite(false)}>ยกเลิก</Button>
            </div>
          </div>
        )}

        {teachers.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">ยังไม่มีผู้ช่วยสอน</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {teachers.map(t => {
              const perm = PERM_CFG[t.permission]
              const PermIcon = perm.icon
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-100 to-blue-100 flex items-center justify-center text-xs font-bold text-violet-700 shrink-0">
                    {t.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-400 truncate">{t.email}</p>
                  </div>
                  {/* Permission dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setOpenPerm(openPerm === t.id ? null : t.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${perm.color} border-current/20 bg-current/5 hover:bg-current/10`}
                    >
                      <PermIcon className="w-3 h-3" />
                      {perm.label}
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    {openPerm === t.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenPerm(null)} />
                        <div className="absolute right-0 top-9 z-20 bg-white rounded-xl shadow-lg ring-1 ring-black/10 py-1 min-w-[180px]">
                          {(Object.keys(PERM_CFG) as Permission[]).map(p => {
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
                  <button
                    onClick={() => removeTeacher(t.id)}
                    className="w-7 h-7 rounded-lg hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-gray-300 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
