'use client'

import { useState } from 'react'
import {
  Search,
  UserX,
  UserCheck,
  Drama,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Filter,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type UserRole = 'teacher' | 'student' | 'admin'
type UserStatus = 'active' | 'suspended'
type TicketStatus = 'open' | 'in_progress' | 'resolved'
type TicketPriority = 'low' | 'medium' | 'high' | 'critical'

interface AppUser {
  id: string
  name: string
  email: string
  role: UserRole
  tenant: string
  status: UserStatus
  lastSeen: string
  joinedAt: string
  submissions: number
}

interface SupportTicket {
  id: string
  subject: string
  userName: string
  email: string
  tenant: string
  status: TicketStatus
  priority: TicketPriority
  createdAt: string
  lastUpdated: string
  message: string
}

const USERS: AppUser[] = [
  {
    id: 'U001',
    name: 'อาจารย์สมชาย วิทยาศาสตร์',
    email: 'somchai@pccr.ac.th',
    role: 'teacher',
    tenant: 'PCCR',
    status: 'active',
    lastSeen: '2026-05-15 14:22',
    joinedAt: '2024-06-01',
    submissions: 0,
  },
  {
    id: 'U002',
    name: 'นายธีรพล รักเรียน',
    email: 'teerphon.r@pccr.ac.th',
    role: 'student',
    tenant: 'PCCR',
    status: 'active',
    lastSeen: '2026-05-15 11:05',
    joinedAt: '2024-06-10',
    submissions: 248,
  },
  {
    id: 'U003',
    name: 'อาจารย์มานะ ฟิสิกส์',
    email: 'mana@olympicphysics.com',
    role: 'teacher',
    tenant: 'OPT',
    status: 'active',
    lastSeen: '2026-05-15 09:47',
    joinedAt: '2024-09-15',
    submissions: 0,
  },
  {
    id: 'U004',
    name: 'นางสาวพิมพ์ใจ ชาญฟิสิกส์',
    email: 'pimjai@olympicphysics.com',
    role: 'student',
    tenant: 'OPT',
    status: 'active',
    lastSeen: '2026-05-14 20:31',
    joinedAt: '2024-10-02',
    submissions: 512,
  },
  {
    id: 'U005',
    name: 'อาจารย์ปิยะ ศรีวิทยา',
    email: 'piya@mwit.ac.th',
    role: 'teacher',
    tenant: 'MWIT',
    status: 'active',
    lastSeen: '2026-05-15 13:55',
    joinedAt: '2024-03-01',
    submissions: 0,
  },
  {
    id: 'U006',
    name: 'นายกฤษดา นักฟิสิกส์',
    email: 'kritsada@mwit.ac.th',
    role: 'student',
    tenant: 'MWIT',
    status: 'suspended',
    lastSeen: '2026-05-10 08:00',
    joinedAt: '2024-03-15',
    submissions: 187,
  },
  {
    id: 'U007',
    name: 'อาจารย์วิชัย คิดเลข',
    email: 'vichai@kvis.ac.th',
    role: 'teacher',
    tenant: 'KVIS',
    status: 'active',
    lastSeen: '2026-05-15 10:12',
    joinedAt: '2024-11-20',
    submissions: 0,
  },
  {
    id: 'U008',
    name: 'นางสาวสุดา ฟิสิกส์เก่ง',
    email: 'suda.p@tutorplusphysics.com',
    role: 'student',
    tenant: 'TPP',
    status: 'active',
    lastSeen: '2026-05-15 15:03',
    joinedAt: '2025-01-10',
    submissions: 94,
  },
]

const TICKETS: SupportTicket[] = [
  {
    id: 'TKT-001',
    subject: 'ไม่สามารถ Export ข้อสอบเป็น PDF ได้',
    userName: 'อาจารย์สมชาย วิทยาศาสตร์',
    email: 'somchai@pccr.ac.th',
    tenant: 'PCCR',
    status: 'open',
    priority: 'high',
    createdAt: '2026-05-15 09:12',
    lastUpdated: '2026-05-15 09:12',
    message:
      'เมื่อกดปุ่ม Export PDF ระบบแสดง Error 500 และไม่ทำงาน เกิดขึ้นตั้งแต่วันพฤหัสบดีที่ผ่านมา ใช้ Chrome 125 บน Windows 11',
  },
  {
    id: 'TKT-002',
    subject: 'นักเรียนส่งข้อสอบแล้วแต่คะแนนไม่ขึ้น',
    userName: 'อาจารย์มานะ ฟิสิกส์',
    email: 'mana@olympicphysics.com',
    tenant: 'OPT',
    status: 'in_progress',
    priority: 'critical',
    createdAt: '2026-05-14 18:45',
    lastUpdated: '2026-05-15 08:30',
    message:
      'นักเรียน 12 คนส่งข้อสอบฟิสิกส์ครั้งที่ 3 แต่ระบบแสดงว่า Submission ไม่สำเร็จ ข้อมูลหาย ต้องการให้ตรวจสอบด่วนเพราะมีการเรียนเพิ่มเติมพรุ่งนี้',
  },
  {
    id: 'TKT-003',
    subject: 'ลืมรหัสผ่านและ Email ที่ใช้สมัคร',
    userName: 'นางสาวพิมพ์ใจ ชาญฟิสิกส์',
    email: 'pimjai@olympicphysics.com',
    tenant: 'OPT',
    status: 'resolved',
    priority: 'medium',
    createdAt: '2026-05-12 14:00',
    lastUpdated: '2026-05-12 15:20',
    message: 'ไม่สามารถเข้าสู่ระบบได้ ลืมทั้งรหัสผ่านและ Email ที่ใช้ลงทะเบียน',
  },
  {
    id: 'TKT-004',
    subject: 'ขอเพิ่มจำนวนผู้ใช้งานในแพ็กเกจ',
    userName: 'อาจารย์ปิยะ ศรีวิทยา',
    email: 'piya@mwit.ac.th',
    tenant: 'MWIT',
    status: 'open',
    priority: 'low',
    createdAt: '2026-05-15 11:30',
    lastUpdated: '2026-05-15 11:30',
    message:
      'ต้องการเพิ่ม Seat จาก 2,000 เป็น 2,500 คน เนื่องจากรับนักเรียนใหม่ภาคการศึกษาหน้า',
  },
  {
    id: 'TKT-005',
    subject: 'กราฟสถิติในหน้า Dashboard แสดงผิดพลาด',
    userName: 'อาจารย์วิชัย คิดเลข',
    email: 'vichai@kvis.ac.th',
    tenant: 'KVIS',
    status: 'in_progress',
    priority: 'medium',
    createdAt: '2026-05-13 09:00',
    lastUpdated: '2026-05-14 16:45',
    message:
      'กราฟใน Dashboard แสดงข้อมูล Submission เป็น 0 ทั้งหมด ทั้งที่มีนักเรียนส่งงานแล้วหลายชิ้น',
  },
]

const TICKET_STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; cls: string; icon: React.ElementType }
> = {
  open: {
    label: 'รอการตอบกลับ',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    icon: Clock,
  },
  in_progress: {
    label: 'กำลังดำเนินการ',
    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    icon: MessageSquare,
  },
  resolved: {
    label: 'แก้ไขแล้ว',
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    icon: CheckCircle2,
  },
}

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; cls: string }> = {
  critical: {
    label: 'Critical',
    cls: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400',
  },
  high: {
    label: 'High',
    cls: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-400',
  },
  medium: {
    label: 'Medium',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
  },
  low: {
    label: 'Low',
    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  },
}

const ROLE_LABEL: Record<UserRole, string> = {
  teacher: 'ครู',
  student: 'นักเรียน',
  admin: 'Admin',
}

function UserRow({ user }: { user: AppUser }) {
  const [suspended, setSuspended] = useState(user.status === 'suspended')

  return (
    <tr className="border-t border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-white">{user.name}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{user.email}</p>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
        {ROLE_LABEL[user.role]}
      </td>
      <td className="px-4 py-3 text-xs font-medium text-indigo-600 dark:text-indigo-400">
        {user.tenant}
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            suspended
              ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'
              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
          )}
        >
          {suspended ? 'Suspended' : 'Active'}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">
        {user.lastSeen}
      </td>
      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
        {user.submissions.toLocaleString()}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            title="Log in as user (Impersonate)"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
            onClick={() =>
              alert(
                `[Impersonate] กำลังเข้าสู่ระบบในนามของ ${user.email}\n\nในระบบจริงจะสร้าง signed impersonation token และ redirect`,
              )
            }
          >
            <Drama className="h-3 w-3" />
            Log in as
          </button>
          <button
            onClick={() => setSuspended((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
              suspended
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400',
            )}
          >
            {suspended ? (
              <>
                <UserCheck className="h-3 w-3" /> Unsuspend
              </>
            ) : (
              <>
                <UserX className="h-3 w-3" /> Suspend
              </>
            )}
          </button>
        </div>
      </td>
    </tr>
  )
}

function TicketCard({ ticket }: { ticket: SupportTicket }) {
  const [expanded, setExpanded] = useState(false)
  const sc = TICKET_STATUS_CONFIG[ticket.status]
  const pc = PRIORITY_CONFIG[ticket.priority]
  const StatusIcon = sc.icon

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700/60 dark:bg-slate-900 overflow-hidden">
      <div
        className="flex items-start gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <StatusIcon className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
              {ticket.subject}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  pc.cls,
                )}
              >
                {pc.label}
              </span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  sc.cls,
                )}
              >
                {sc.label}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {ticket.id} · {ticket.userName} · {ticket.tenant} · {ticket.createdAt}
          </p>
          {expanded && (
            <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {ticket.message}
              </p>
              <div className="mt-3 flex gap-2">
                <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors">
                  ตอบกลับ
                </button>
                <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  เปลี่ยนสถานะ
                </button>
              </div>
            </div>
          )}
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-slate-400 transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </div>
    </div>
  )
}

export function UserSupport() {
  const [userSearch, setUserSearch] = useState('')
  const [ticketStatus, setTicketStatus] = useState<TicketStatus | 'All'>('All')

  const filteredUsers = USERS.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.tenant.toLowerCase().includes(userSearch.toLowerCase()),
  )

  const filteredTickets = TICKETS.filter(
    (t) => ticketStatus === 'All' || t.status === ticketStatus,
  )

  const openCount = TICKETS.filter((t) => t.status === 'open').length
  const inProgressCount = TICKETS.filter((t) => t.status === 'in_progress').length
  const resolvedCount = TICKETS.filter((t) => t.status === 'resolved').length

  return (
    <div className="space-y-8">
      {/* Users Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              ผู้ใช้งานทั้งหมด
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              จัดการบัญชี · Suspend · Impersonate
            </p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="ค้นหาชื่อ อีเมล หรือ Tenant"
            className="w-full max-w-sm rounded-lg border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
          <table className="w-full text-sm bg-white dark:bg-slate-900">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60">
                {['ผู้ใช้', 'บทบาท', 'Tenant', 'สถานะ', 'เข้าล่าสุด', 'Submissions', 'การจัดการ'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <UserRow key={u.id} user={u} />
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-sm text-slate-400"
                  >
                    ไม่พบผู้ใช้งานที่ตรงกับเงื่อนไข
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Support Tickets Section */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Support Tickets
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            คำร้องเรียนและปัญหาจากลูกค้า
          </p>
        </div>

        {/* Ticket Status Summary */}
        <div className="grid grid-cols-3 gap-3 sm:max-w-lg">
          {[
            { label: 'รอการตอบกลับ', count: openCount, status: 'open' as TicketStatus, cls: 'text-amber-600 dark:text-amber-400' },
            { label: 'กำลังดำเนินการ', count: inProgressCount, status: 'in_progress' as TicketStatus, cls: 'text-blue-600 dark:text-blue-400' },
            { label: 'แก้ไขแล้ว', count: resolvedCount, status: 'resolved' as TicketStatus, cls: 'text-emerald-600 dark:text-emerald-400' },
          ].map((item) => (
            <button
              key={item.status}
              onClick={() =>
                setTicketStatus((v) => (v === item.status ? 'All' : item.status))
              }
              className={cn(
                'rounded-xl border p-3 text-left transition-all',
                ticketStatus === item.status
                  ? 'border-indigo-400 ring-2 ring-indigo-100 dark:ring-indigo-900/50'
                  : 'border-slate-200 dark:border-slate-700/60',
                'bg-white dark:bg-slate-900',
              )}
            >
              <p className={cn('text-2xl font-bold', item.cls)}>{item.count}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {item.label}
              </p>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {filteredTickets.map((t) => (
            <TicketCard key={t.id} ticket={t} />
          ))}
          {filteredTickets.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-700/60 dark:bg-slate-900">
              <p className="text-sm text-slate-400">ไม่มี Ticket ในสถานะนี้</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
