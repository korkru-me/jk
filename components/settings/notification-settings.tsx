'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Bell, Mail, BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-card shadow-sm transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  )
}

// ─── Notification rows ────────────────────────────────────────────────────────

const NOTIFICATION_ITEMS = [
  {
    id: 'submission',
    icon: '📝',
    label: 'มีนักเรียนส่งข้อสอบใหม่',
    description: 'แจ้งเตือนทันทีเมื่อนักเรียนส่งชุดข้อสอบที่คุณสร้าง',
  },
  {
    id: 'weekly_report',
    icon: '📊',
    label: 'รายงานสรุปสถิติรายสัปดาห์',
    description: 'สรุปการใช้งาน คะแนนเฉลี่ย และข้อสังเกตสำคัญ ส่งทุกวันจันทร์',
  },
  {
    id: 'invoice',
    icon: '🧾',
    label: 'ใบเสร็จรับเงินเมื่อมีการชำระค่าบริการ',
    description: 'รับสำเนาใบเสร็จและยืนยันการชำระทุกครั้ง',
  },
]

type NotifState = Record<string, { email: boolean; inapp: boolean }>

const LS_KEY = 'korkru_notification_prefs'

function loadPrefs(): NotifState {
  if (typeof window === 'undefined') {
    return Object.fromEntries(NOTIFICATION_ITEMS.map(i => [i.id, { email: true, inapp: true }]))
  }
  try {
    const saved = localStorage.getItem(LS_KEY)
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return Object.fromEntries(NOTIFICATION_ITEMS.map(i => [i.id, { email: true, inapp: true }]))
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotifState>(loadPrefs)

  useEffect(() => {
    setPrefs(loadPrefs())
  }, [])

  function toggle(id: string, channel: 'email' | 'inapp') {
    setPrefs(prev => ({
      ...prev,
      [id]: { ...prev[id], [channel]: !prev[id][channel] },
    }))
  }

  function setAll(channel: 'email' | 'inapp', value: boolean) {
    setPrefs(prev => {
      const next = { ...prev }
      for (const id of Object.keys(next)) {
        next[id] = { ...next[id], [channel]: value }
      }
      return next
    })
  }

  function handleSave() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(prefs))
      toast.success('บันทึกการตั้งค่าการแจ้งเตือนสำเร็จ ✓')
    } catch {
      toast.error('ไม่สามารถบันทึกได้')
    }
  }

  const emailAllOn  = NOTIFICATION_ITEMS.every(i => prefs[i.id]?.email)
  const inappAllOn  = NOTIFICATION_ITEMS.every(i => prefs[i.id]?.inapp)

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-muted/20 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bell size={15} className="text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">การแจ้งเตือน</h2>
            <p className="text-xs text-muted-foreground">เลือกประเภทการแจ้งเตือนที่ต้องการรับ</p>
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_100px_100px] items-center px-6 py-3 border-b bg-muted/10">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">ประเภทการแจ้งเตือน</p>
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1.5">
              <Mail size={12} className="text-muted-foreground" />
              <p className="text-xs font-bold text-muted-foreground">อีเมล</p>
            </div>
            <Button variant="link" size="sm"
              type="button"
              onClick={() => setAll('email', !emailAllOn)} className="text-[10px]">
              {emailAllOn ? 'ปิดทั้งหมด' : 'เปิดทั้งหมด'}
            </Button>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1.5">
              <BellRing size={12} className="text-muted-foreground" />
              <p className="text-xs font-bold text-muted-foreground">ในระบบ</p>
            </div>
            <Button variant="link" size="sm"
              type="button"
              onClick={() => setAll('inapp', !inappAllOn)} className="text-[10px]">
              {inappAllOn ? 'ปิดทั้งหมด' : 'เปิดทั้งหมด'}
            </Button>
          </div>
        </div>

        {/* Rows */}
        <div className="divide-y">
          {NOTIFICATION_ITEMS.map(item => (
            <div key={item.id} className="grid grid-cols-[1fr_100px_100px] items-center px-6 py-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-start gap-3 pr-4">
                <span className="text-lg shrink-0 mt-0.5">{item.icon}</span>
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
              </div>
              <div className="flex justify-center">
                <Toggle
                  checked={prefs[item.id]?.email ?? true}
                  onChange={() => toggle(item.id, 'email')}
                />
              </div>
              <div className="flex justify-center">
                <Toggle
                  checked={prefs[item.id]?.inapp ?? true}
                  onChange={() => toggle(item.id, 'inapp')}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Info box */}
      <div className="bg-primary/8 border border-primary/20 rounded-xl px-5 py-4 flex items-start gap-3">
        <Bell size={15} className="text-primary mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-primary">การแจ้งเตือนในระบบ</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            การแจ้งเตือนในระบบจะปรากฏที่ไอคอนกระดิ่งมุมบนขวา และในหน้าจอล็อกอิน
            การแจ้งเตือนทางอีเมลจะใช้อีเมลที่ลงทะเบียนไว้กับบัญชีของคุณ
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} className="min-w-[140px]">
          บันทึกการตั้งค่า
        </Button>
      </div>
    </div>
  )
}
