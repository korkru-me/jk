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
import { chartColors, chartTooltipStyle } from '@/lib/chart-colors'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'

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
    cls: 'bg-warning/10 text-warning',
    icon: Clock,
  },
  feature: {
    label: 'ฟีเจอร์ใหม่',
    cls: 'bg-primary/10 text-primary',
    icon: Star,
  },
  promo: {
    label: 'โปรโมชั่น',
    cls: 'bg-success/10 text-success',
    icon: Gift,
  },
  urgent: {
    label: 'ด่วน',
    cls: 'bg-destructive/10 text-destructive',
    icon: AlertCircle,
  },
}

const ANN_STATUS_CONFIG: Record<
  AnnouncementStatus,
  { label: string; cls: string }
> = {
  active: {
    label: 'กำลังแสดง',
    cls: 'bg-success/10 text-success',
  },
  scheduled: {
    label: 'กำหนดการ',
    cls: 'bg-primary/10 text-primary',
  },
  expired: {
    label: 'หมดอายุ',
    cls: 'bg-muted text-muted-foreground',
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
          <h2 className="text-lg font-semibold text-foreground">
            Global Announcements
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            ส่งข้อความประกาศขึ้นแบนเนอร์ด้านบนสุดสำหรับผู้ใช้ทุกคน
          </p>
        </div>

        {/* Compose Form */}
        <Card radius="md" padding="lg" className=" space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            สร้างประกาศใหม่
          </h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                ประเภท
              </label>
              <NativeSelect
                value={newType}
                onChange={(e) => setNewType(e.target.value as AnnouncementType)} className="mt-1 w-full text-muted-foreground"
              >
                <option value="feature">ฟีเจอร์ใหม่</option>
                <option value="maintenance">ปิดปรับปรุง</option>
                <option value="promo">โปรโมชั่น</option>
                <option value="urgent">ด่วน</option>
              </NativeSelect>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                หมดอายุ
              </label>
              <Input
                type="date"
                value={newExpires}
                onChange={(e) => setNewExpires(e.target.value)} className="mt-1 w-full text-muted-foreground"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">
              ข้อความประกาศ
            </label>
            <Textarea
              rows={3}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="พิมพ์ข้อความที่จะแสดงเป็นแบนเนอร์บนหน้าจอของผู้ใช้ทุกคน" className="mt-1 w-full text-foreground dark:placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSendAnnouncement}
              disabled={!newMessage.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-4 w-4" />
              ส่งประกาศทันที
            </button>
            {sent && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
                <CheckCircle2 className="h-4 w-4" />
                ส่งประกาศสำเร็จแล้ว
              </span>
            )}
          </div>
        </Card>

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
                    ? 'border-border bg-muted/80 opacity-60'
                    : 'border-border bg-card',
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
                    <p className="text-sm text-muted-foreground leading-relaxed">
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
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
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
          <h2 className="text-lg font-semibold text-foreground">
            Automated Referral Engine
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
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
              <Card radius="md" padding="md" key={item.label}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-4 w-4 text-primary" />
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {item.value}
                </p>
              </Card>
            )
          })}
        </div>

        {/* Referral Chart */}
        <Card radius="md" padding="lg">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Referrals รายเดือน (ปี 2569)
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={REFERRAL_CHART_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} strokeOpacity={0.5} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: chartColors.axis }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: chartColors.axis }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v) => [Number(v), 'Referrals']}
                contentStyle={chartTooltipStyle}
              />
              <Bar dataKey="referrals" fill={chartColors.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Referral Table */}
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-sm bg-card">
            <thead>
              <tr className="bg-muted/60">
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
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
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
                  className="border-t border-border/60 hover:bg-muted transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-foreground">
                      {r.referrer}
                    </p>
                    <p className="text-xs text-muted-foreground">{r.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-primary">
                    {r.tenant}
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
                      {r.code}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-primary">
                        {r.referrals}
                      </span>
                      <span className="text-xs text-muted-foreground">คน</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Gift className="h-3.5 w-3.5 text-success" />
                      <span className="text-sm font-semibold text-success">
                        +{r.earnedDays}
                      </span>
                      <span className="text-xs text-muted-foreground">วัน</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        r.status === 'active'
                          ? 'bg-success/10 text-success'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {r.status === 'active' ? 'Active' : 'Expired'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
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
