'use client'

import { useState } from 'react'
import {
  Megaphone,
  Send,
  CheckCircle2,
  Gift,
  TrendingUp,
  Users,
  Clock,
  AlertCircle,
  BarChart3,
  Star,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

type AnnouncementType = 'maintenance' | 'feature' | 'promo' | 'urgent'
type AnnouncementStatus = 'active' | 'scheduled' | 'expired'

interface Announcement {
  id: string
  message: string
  type: AnnouncementType
  status: AnnouncementStatus
  sentAt: string
  expiresAt: string
  viewCount: number
}

interface ReferralEntry {
  id: string
  referrer: string
  email: string
  tenant: string
  code: string
  referrals: number
  earnedDays: number
  status: 'active' | 'expired'
  lastReferral: string
}

const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'ANN001',
    message:
      'ระบบจะปิดปรับปรุงชั่วคราว วันเสาร์ที่ 17 พ.ค. 2569 เวลา 02:00 - 04:00 น. ขออภัยในความไม่สะดวก',
    type: 'maintenance',
    status: 'scheduled',
    sentAt: '2026-05-15 16:00',
    expiresAt: '2026-05-18 00:00',
    viewCount: 0,
  },
  {
    id: 'ANN002',
    message:
      'ฟีเจอร์ใหม่: ระบบออกข้อสอบสุ่มตัวเลขพร้อม Template พร้อมใช้งานแล้ว! ลองใช้ได้ที่เมนูสร้างข้อสอบ',
    type: 'feature',
    status: 'active',
    sentAt: '2026-05-10 09:00',
    expiresAt: '2026-05-24 23:59',
    viewCount: 3847,
  },
  {
    id: 'ANN003',
    message:
      'โปรโมชั่นพิเศษ: สมัคร Pro Plan ก่อน 31 พ.ค. 2569 ลด 20% พร้อม Storage ฟรีเพิ่ม 2GB',
    type: 'promo',
    status: 'active',
    sentAt: '2026-05-05 10:00',
    expiresAt: '2026-05-31 23:59',
    viewCount: 5612,
  },
  {
    id: 'ANN004',
    message:
      'แจ้งเตือนด่วน: พบปัญหาการแสดงผลสูตรคณิตศาสตร์บน Safari iOS 18.2 ทีมกำลังแก้ไข คาดว่าจะเสร็จภายใน 24 ชั่วโมง',
    type: 'urgent',
    status: 'expired',
    sentAt: '2026-05-01 11:00',
    expiresAt: '2026-05-02 11:00',
    viewCount: 2198,
  },
]

const REFERRALS: ReferralEntry[] = [
  {
    id: 'REF001',
    referrer: 'อาจารย์มานะ ฟิสิกส์',
    email: 'mana@olympicphysics.com',
    tenant: 'OPT',
    code: 'MANA2025',
    referrals: 7,
    earnedDays: 210,
    status: 'active',
    lastReferral: '2026-05-12',
  },
  {
    id: 'REF002',
    referrer: 'อาจารย์สมชาย วิทยาศาสตร์',
    email: 'somchai@pccr.ac.th',
    tenant: 'PCCR',
    code: 'SOMCHAI24',
    referrals: 5,
    earnedDays: 150,
    status: 'active',
    lastReferral: '2026-04-28',
  },
  {
    id: 'REF003',
    referrer: 'อาจารย์ปิยะ ศรีวิทยา',
    email: 'piya@mwit.ac.th',
    tenant: 'MWIT',
    code: 'PIYA_MWIT',
    referrals: 12,
    earnedDays: 360,
    status: 'active',
    lastReferral: '2026-05-14',
  },
  {
    id: 'REF004',
    referrer: 'อาจารย์วิชัย คิดเลข',
    email: 'vichai@kvis.ac.th',
    tenant: 'KVIS',
    code: 'VICHAI_K',
    referrals: 3,
    earnedDays: 90,
    status: 'active',
    lastReferral: '2026-03-20',
  },
  {
    id: 'REF005',
    referrer: 'owner@tutorplusphysics.com',
    email: 'owner@tutorplusphysics.com',
    tenant: 'TPP',
    code: 'TPP2025',
    referrals: 2,
    earnedDays: 60,
    status: 'expired',
    lastReferral: '2026-01-15',
  },
]

const REFERRAL_CHART_DATA = [
  { month: 'ม.ค.', referrals: 4 },
  { month: 'ก.พ.', referrals: 7 },
  { month: 'มี.ค.', referrals: 5 },
  { month: 'เม.ย.', referrals: 11 },
  { month: 'พ.ค.', referrals: 9 },
]

const ANN_TYPE_CONFIG: Record<
  AnnouncementType,
  { label: string; cls: string; icon: React.ElementType }
> = {
  maintenance: {
    label: 'ปิดปรับปรุง',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
    icon: Clock,
  },
  feature: {
    label: 'ฟีเจอร์ใหม่',
    cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
    icon: Star,
  },
  promo: {
    label: 'โปรโมชั่น',
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
    icon: Gift,
  },
  urgent: {
    label: 'ด่วน',
    cls: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400',
    icon: AlertCircle,
  },
}

const ANN_STATUS_CONFIG: Record<
  AnnouncementStatus,
  { label: string; cls: string }
> = {
  active: {
    label: 'กำลังแสดง',
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
  },
  scheduled: {
    label: 'กำหนดการ',
    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  },
  expired: {
    label: 'หมดอายุ',
    cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
  },
}

export function MarketingGrowth() {
  const [announcements, setAnnouncements] = useState(ANNOUNCEMENTS)
  const [newMessage, setNewMessage] = useState('')
  const [newType, setNewType] = useState<AnnouncementType>('feature')
  const [newExpires, setNewExpires] = useState('2026-05-30')
  const [sent, setSent] = useState(false)

  function handleSendAnnouncement() {
    if (!newMessage.trim()) return
    const newAnn: Announcement = {
      id: `ANN${Date.now()}`,
      message: newMessage.trim(),
      type: newType,
      status: 'active',
      sentAt: new Date().toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      expiresAt: newExpires,
      viewCount: 0,
    }
    setAnnouncements((prev) => [newAnn, ...prev])
    setNewMessage('')
    setSent(true)
    setTimeout(() => setSent(false), 3000)
  }

  const totalReferrals = REFERRALS.reduce((s, r) => s + r.referrals, 0)
  const totalEarnedDays = REFERRALS.reduce((s, r) => s + r.earnedDays, 0)
  const activeReferrers = REFERRALS.filter((r) => r.status === 'active').length

  return (
    <div className="space-y-8">
      {/* === Announcements Section === */}
      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Global Announcements
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            ส่งข้อความประกาศขึ้นแบนเนอร์ด้านบนสุดสำหรับผู้ใช้ทุกคน
          </p>
        </div>

        {/* Compose Form */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700/60 dark:bg-slate-900 space-y-4">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-indigo-500" />
            สร้างประกาศใหม่
          </h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                ประเภท
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as AnnouncementType)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="feature">ฟีเจอร์ใหม่</option>
                <option value="maintenance">ปิดปรับปรุง</option>
                <option value="promo">โปรโมชั่น</option>
                <option value="urgent">ด่วน</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                หมดอายุ
              </label>
              <input
                type="date"
                value={newExpires}
                onChange={(e) => setNewExpires(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              ข้อความประกาศ
            </label>
            <textarea
              rows={3}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="พิมพ์ข้อความที่จะแสดงเป็นแบนเนอร์บนหน้าจอของผู้ใช้ทุกคน"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSendAnnouncement}
              disabled={!newMessage.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-4 w-4" />
              ส่งประกาศทันที
            </button>
            {sent && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                ส่งประกาศสำเร็จแล้ว
              </span>
            )}
          </div>
        </div>

        {/* Announcement List */}
        <div className="space-y-2">
          {announcements.map((ann) => {
            const tc = ANN_TYPE_CONFIG[ann.type]
            const sc = ANN_STATUS_CONFIG[ann.status]
            const TypeIcon = tc.icon
            return (
              <div
                key={ann.id}
                className={cn(
                  'rounded-xl border p-4',
                  ann.status === 'expired'
                    ? 'border-slate-200 bg-slate-50/80 opacity-60 dark:border-slate-700/40 dark:bg-slate-900/40'
                    : 'border-slate-200 bg-white dark:border-slate-700/60 dark:bg-slate-900',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      className={cn(
                        'shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                        tc.cls,
                      )}
                    >
                      <TypeIcon className="h-3 w-3" />
                      {tc.label}
                    </span>
                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                      {ann.message}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                      sc.cls,
                    )}
                  >
                    {sc.label}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
                  <span>ส่งเมื่อ {ann.sentAt}</span>
                  <span>หมดอายุ {ann.expiresAt}</span>
                  {ann.viewCount > 0 && (
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {ann.viewCount.toLocaleString()} views
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* === Referral Engine Section === */}
      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Automated Referral Engine
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            ระบบการตลาดแบบบอกต่อ — ติดตามรหัสเชิญชวนและวันที่ต่ออายุแพ็กเกจฟรี
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'ผู้แนะนำที่ Active', value: activeReferrers.toString(), icon: Users },
            { label: 'Referrals รวม', value: totalReferrals.toString(), icon: TrendingUp },
            { label: 'วันต่ออายุฟรีรวม', value: `${totalEarnedDays} วัน`, icon: Gift },
            {
              label: 'อัตรา Conversion',
              value: '34.2%',
              icon: BarChart3,
            },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700/60 dark:bg-slate-900"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-4 w-4 text-indigo-500" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">{item.label}</p>
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {item.value}
                </p>
              </div>
            )
          })}
        </div>

        {/* Referral Chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700/60 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-4">
            Referrals รายเดือน (ปี 2569)
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={REFERRAL_CHART_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v) => [Number(v), 'Referrals']}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="referrals" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Referral Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
          <table className="w-full text-sm bg-white dark:bg-slate-900">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60">
                {[
                  'ผู้แนะนำ',
                  'Tenant',
                  'รหัสเชิญ',
                  'จำนวนที่ชวนสำเร็จ',
                  'วันต่ออายุฟรี',
                  'สถานะ',
                  'Referral ล่าสุด',
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {REFERRALS.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {r.referrer}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{r.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                    {r.tenant}
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {r.code}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                        {r.referrals}
                      </span>
                      <span className="text-xs text-slate-400">คน</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Gift className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        +{r.earnedDays}
                      </span>
                      <span className="text-xs text-slate-400">วัน</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        r.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
                      )}
                    >
                      {r.status === 'active' ? 'Active' : 'Expired'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">
                    {r.lastReferral}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
