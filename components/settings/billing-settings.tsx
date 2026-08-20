'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CreditCard, Download, Zap, HardDrive, Crown, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ title, description, icon: Icon, children }: {
  title: string
  description: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <Card className="overflow-hidden">
      <div className="px-6 py-4 border-b bg-muted/20 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon size={15} className="text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-sm">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </Card>
  )
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const PLAN_FEATURES = [
  'ข้อสอบไม่จำกัดจำนวน',
  'ครูสูงสุด 10 คน',
  'นักเรียนสูงสุด 500 คน',
  'รายงานวิเคราะห์ขั้นสูง',
  'ส่งออกเป็น PDF และ OMR',
  'พื้นที่จัดเก็บ 1GB',
]

const MOCK_INVOICES = [
  { id: 'INV-2025-004', date: '1 พ.ค. 2568',  amount: '฿1,490', status: 'paid' },
  { id: 'INV-2025-003', date: '1 เม.ย. 2568',  amount: '฿1,490', status: 'paid' },
  { id: 'INV-2025-002', date: '1 มี.ค. 2568',  amount: '฿1,490', status: 'paid' },
  { id: 'INV-2025-001', date: '1 ก.พ. 2568',  amount: '฿1,490', status: 'paid' },
  { id: 'INV-2024-012', date: '1 ม.ค. 2568',  amount: '฿1,290', status: 'paid' },
]

const STORAGE_USED_MB  = 450
const STORAGE_TOTAL_MB = 1024
const STORAGE_PCT      = Math.round((STORAGE_USED_MB / STORAGE_TOTAL_MB) * 100)

const QUESTIONS_USED  = 1847
const QUESTIONS_LIMIT = 'ไม่จำกัด'

const NEXT_BILLING = '1 มิถุนายน 2568'

// ─── Main Component ───────────────────────────────────────────────────────────

export function BillingSettings() {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  function handleUpgrade() {
    toast.success('กำลังเปิดหน้าอัปเกรดแพ็กเกจ...')
  }

  function handleDownloadInvoice(id: string) {
    toast.success(`กำลังดาวน์โหลด ${id}.pdf...`)
  }

  function handleCancelSubscription() {
    setShowCancelConfirm(false)
    toast.info('ส่งคำขอยกเลิกการต่ออายุแล้ว — ทีมงานจะติดต่อกลับภายใน 24 ชั่วโมง')
  }

  return (
    <div className="space-y-5">

      {/* ── Current Plan ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Crown size={16} className="text-amber-300" />
              <span className="text-xs font-bold text-white/70 uppercase tracking-wider">แพ็กเกจปัจจุบัน</span>
            </div>
            <h2 className="text-2xl font-black">Pro Plan</h2>
            <p className="text-sm text-white/70 mt-0.5">สำหรับสถาบันขนาดกลาง (10 ครู / 500 นักเรียน)</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-black">฿1,490</p>
            <p className="text-xs text-white/70">ต่อเดือน</p>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-white/20 grid grid-cols-2 gap-3">
          {PLAN_FEATURES.map(f => (
            <div key={f} className="flex items-center gap-2 text-xs text-white/80">
              <CheckCircle2 size={12} className="text-emerald-300 shrink-0" />
              {f}
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-white/20 flex items-center justify-between">
          <p className="text-xs text-white/60">ต่ออายุอัตโนมัติวันที่ {NEXT_BILLING}</p>
          <span className="text-xs bg-success/20 text-emerald-200 px-2 py-0.5 rounded-full font-medium">
            ✓ ใช้งานอยู่
          </span>
        </div>
      </div>

      {/* ── Usage Stats ──────────────────────────────────────────────────── */}
      <SectionCard title="ปริมาณการใช้งาน" description="ตรวจสอบพื้นที่และการใช้งานทรัพยากรในแพ็กเกจปัจจุบัน" icon={HardDrive}>
        <div className="space-y-5">
          {/* Storage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium">พื้นที่จัดเก็บรูปภาพโจทย์</p>
                <p className="text-xs text-muted-foreground">ใช้ไปแล้ว {STORAGE_USED_MB} MB จาก {STORAGE_TOTAL_MB / 1024} GB</p>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                STORAGE_PCT >= 80
                  ? 'bg-destructive/15 text-destructive'
                  : STORAGE_PCT >= 60
                  ? 'bg-warning/15 text-warning'
                  : 'bg-success/15 text-success'
              }`}>
                {STORAGE_PCT}%
              </span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  STORAGE_PCT >= 80 ? 'bg-destructive' :
                  STORAGE_PCT >= 60 ? 'bg-warning' :
                  'bg-primary'
                }`}
                style={{ width: `${STORAGE_PCT}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">0 MB</span>
              <span className="text-[10px] text-muted-foreground">{STORAGE_TOTAL_MB / 1024} GB</span>
            </div>
          </div>

          {/* Questions count */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/30 rounded-xl p-4 border">
              <p className="text-xs text-muted-foreground">โจทย์ทั้งหมดในระบบ</p>
              <p className="text-2xl font-black mt-1">{QUESTIONS_USED.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">จาก {QUESTIONS_LIMIT}</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-4 border">
              <p className="text-xs text-muted-foreground">สมาชิกในทีม</p>
              <p className="text-2xl font-black mt-1">4</p>
              <p className="text-xs text-muted-foreground">จาก 10 คน</p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Upgrade / Manage ─────────────────────────────────────────────── */}
      <SectionCard title="จัดการแพ็กเกจ" description="อัปเกรดหรือเปลี่ยนแปลงการสมัครสมาชิก" icon={Zap}>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div>
            <p className="text-sm font-medium">ต้องการพื้นที่หรือฟีเจอร์เพิ่มเติม?</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enterprise Plan รองรับครูไม่จำกัด, พื้นที่ 10GB, API Access และ Priority Support
            </p>
          </div>
          <Button onClick={handleUpgrade} className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 border-0 shrink-0">
            <Zap size={14} />
            อัปเกรดเป็น Enterprise
          </Button>
        </div>

        <div className="mt-5 pt-4 border-t">
          {!showCancelConfirm ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">ยกเลิกการต่ออายุอัตโนมัติ</p>
                <p className="text-xs text-muted-foreground/70">การเข้าถึงจะยังคงอยู่จนถึง {NEXT_BILLING}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCancelConfirm(true)}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors underline-offset-2 hover:underline"
              >
                ยกเลิกการต่ออายุ
              </button>
            </div>
          ) : (
            <div className="bg-destructive/8 border border-destructive/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={16} className="text-destructive shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-destructive">ยืนยันการยกเลิก?</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    คุณยังสามารถใช้งานได้จนถึง {NEXT_BILLING} หลังจากนั้นบัญชีจะถูกลดระดับเป็น Free Plan
                    (โจทย์ 50 ข้อ, 1 ครู, 30 นักเรียน)
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={handleCancelSubscription}
                      className="text-xs px-3 py-1.5 bg-destructive hover:bg-destructive/90 text-white rounded-lg transition-colors font-medium"
                    >
                      ยืนยันยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCancelConfirm(false)}
                      className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-muted transition-colors"
                    >
                      ไม่ยกเลิก
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Invoice History ───────────────────────────────────────────────── */}
      <SectionCard title="ประวัติการชำระเงิน" description="ใบเสร็จและรายละเอียดการชำระค่าบริการ" icon={CreditCard}>
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">เลขที่ใบเสร็จ</th>
                <th className="px-4 py-2.5 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">วันที่</th>
                <th className="px-4 py-2.5 text-right text-xs font-bold text-muted-foreground uppercase tracking-wider">จำนวนเงิน</th>
                <th className="px-4 py-2.5 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">สถานะ</th>
                <th className="px-4 py-2.5 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">ดาวน์โหลด</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {MOCK_INVOICES.map(inv => (
                <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{inv.id}</td>
                  <td className="px-4 py-3 text-sm">{inv.date}</td>
                  <td className="px-4 py-3 text-right font-semibold font-mono">{inv.amount}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-xs bg-success/15 text-success px-2 py-0.5 rounded-full font-medium">
                      <CheckCircle2 size={10} />
                      ชำระแล้ว
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleDownloadInvoice(inv.id)}
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium hover:underline underline-offset-2 transition-colors"
                    >
                      <Download size={12} />
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          แสดง 5 รายการล่าสุด · ต้องการใบเสร็จเก่า กรุณาติดต่อ support@korkru.com
        </p>
      </SectionCard>
    </div>
  )
}
