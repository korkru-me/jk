'use client'

import { useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { changeUserRole, toggleSuspendUser, adminDeleteUser } from '@/lib/actions/admin'
import type { User } from '@/lib/types'

type Row = User & { question_count: number }

const ROLE_LABEL: Record<string, string> = {
  teacher: 'ครู', student: 'นักเรียน', admin: 'Admin',
}
const ROLE_STYLE: Record<string, string> = {
  teacher: 'bg-blue-100 text-blue-700',
  student: 'bg-gray-100 text-gray-600',
  admin:   'bg-purple-100 text-purple-700',
}

// ─── Filter ─────────────────────────────────────────────────
export function UsersFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function update(key: string, value: string) {
    const p = new URLSearchParams(searchParams.toString())
    if (value && value !== 'all') p.set(key, value)
    else p.delete(key)
    router.push(`${pathname}?${p.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <Input
        placeholder="ค้นหาชื่อหรืออีเมล..."
        defaultValue={searchParams.get('search') ?? ''}
        onChange={(e) => update('search', e.target.value)}
        className="w-56"
      />
      <Select
        value={searchParams.get('role') ?? 'all'}
        onValueChange={(v) => v !== null && update('role', v)}
      >
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">ทุก Role</SelectItem>
          <SelectItem value="teacher">ครู</SelectItem>
          <SelectItem value="student">นักเรียน</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={searchParams.get('status') ?? 'all'}
        onValueChange={(v) => v !== null && update('status', v)}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">ทุก Status</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="suspended">Suspended</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

// ─── Table ───────────────────────────────────────────────────
export function UsersTable({ users }: { users: Row[] }) {
  const [roleTarget, setRoleTarget] = useState<Row | null>(null)
  const [newRole, setNewRole] = useState<'teacher' | 'student'>('teacher')
  const [isPending, startTransition] = useTransition()

  function handleRoleChange() {
    if (!roleTarget) return
    startTransition(async () => {
      const res = await changeUserRole(roleTarget.id, newRole)
      if (res?.error) toast.error(res.error)
      else { toast.success('เปลี่ยน Role แล้ว'); setRoleTarget(null) }
    })
  }

  function handleSuspend(user: Row) {
    const action = user.status === 'suspended' ? 'คืนสิทธิ์' : 'ระงับ'
    if (!confirm(`${action}บัญชี "${user.full_name}"?`)) return
    startTransition(async () => {
      const res = await toggleSuspendUser(user.id, user.status !== 'suspended')
      if (res?.error) toast.error(res.error)
      else toast.success(`${action}บัญชีแล้ว`)
    })
  }

  function handleDelete(user: Row) {
    if (!confirm(`ลบบัญชี "${user.full_name}" (${user.email}) ถาวร?`)) return
    startTransition(async () => {
      const res = await adminDeleteUser(user.id)
      if (res?.error) toast.error(res.error)
      else toast.success('ลบบัญชีแล้ว')
    })
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ชื่อ / อีเมล</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">โจทย์</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">สมัครเมื่อ</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.length === 0 && (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">ไม่พบผู้ใช้</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{u.full_name}</p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_STYLE[u.role]}`}>
                    {ROLE_LABEL[u.role]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{u.question_count}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    u.status === 'suspended' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {u.status === 'suspended' ? 'ระงับ' : 'Active'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(u.created_at).toLocaleDateString('th-TH')}
                </td>
                <td className="px-4 py-3">
                  {u.role !== 'admin' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setRoleTarget(u); setNewRole(u.role === 'teacher' ? 'student' : 'teacher') }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        เปลี่ยน Role
                      </button>
                      <button
                        onClick={() => handleSuspend(u)}
                        disabled={isPending}
                        className={`text-xs hover:underline disabled:opacity-50 ${
                          u.status === 'suspended' ? 'text-green-600' : 'text-yellow-600'
                        }`}
                      >
                        {u.status === 'suspended' ? 'คืนสิทธิ์' : 'ระงับ'}
                      </button>
                      <button
                        onClick={() => handleDelete(u)}
                        disabled={isPending}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        ลบ
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Change role dialog */}
      <Dialog open={!!roleTarget} onOpenChange={(v) => !v && setRoleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เปลี่ยน Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-gray-600">ผู้ใช้: <strong>{roleTarget?.full_name}</strong></p>
            <p className="text-gray-600">Role ปัจจุบัน: <strong>{ROLE_LABEL[roleTarget?.role ?? '']}</strong></p>
            <Select value={newRole} onValueChange={(v) => v !== null && setNewRole(v as typeof newRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="teacher">ครู</SelectItem>
                <SelectItem value="student">นักเรียน</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleRoleChange} disabled={isPending}>
              {isPending ? 'กำลังบันทึก...' : 'ยืนยัน'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
