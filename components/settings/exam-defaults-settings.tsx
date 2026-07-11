'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { BookOpen, Shuffle, Hash, Percent, ListOrdered } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label, description }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b last:border-0">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground max-w-sm">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 mt-0.5 ${
          checked ? 'bg-primary' : 'bg-muted-foreground/30'
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`} />
      </button>
    </div>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ title, description, icon: Icon, children }: {
  title: string
  description: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="bg-card border rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b bg-muted/20 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon size={15} className="text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-sm">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="px-6">{children}</div>
    </div>
  )
}

// ─── LS Key ───────────────────────────────────────────────────────────────────

const LS_KEY = 'korkru_exam_defaults'

interface ExamDefaults {
  autoRandomize: boolean
  shuffleChoices: boolean
  decimalPlaces: number
  passingPercent: number
}

function loadDefaults(): ExamDefaults {
  if (typeof window === 'undefined') return { autoRandomize: true, shuffleChoices: false, decimalPlaces: 2, passingPercent: 60 }
  try {
    const saved = localStorage.getItem(LS_KEY)
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return { autoRandomize: true, shuffleChoices: false, decimalPlaces: 2, passingPercent: 60 }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ExamDefaultsSettings() {
  const [defaults, setDefaults] = useState<ExamDefaults>(loadDefaults)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDefaults(loadDefaults())
  }, [])

  function update<K extends keyof ExamDefaults>(key: K, value: ExamDefaults[K]) {
    setDefaults(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  function handleSave() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(defaults))
      setSaved(true)
      toast.success('บันทึกค่าเริ่มต้นข้อสอบสำเร็จ ✓')
    } catch {
      toast.error('ไม่สามารถบันทึกได้')
    }
  }

  return (
    <div className="space-y-5">

      {/* ── Toggle Settings ──────────────────────────────────────────────── */}
      <SectionCard
        title="การสร้างโจทย์อัตโนมัติ"
        description="ค่าเริ่มต้นสำหรับทุกโจทย์ที่สร้างใหม่"
        icon={BookOpen}
      >
        <Toggle
          checked={defaults.autoRandomize}
          onChange={v => update('autoRandomize', v)}
          label="สุ่มตัวเลขตัวแปรอัตโนมัติ"
          description="เปิดระบบสุ่มค่าตัวแปรตามช่วงที่กำหนดโดยอัตโนมัติทุกครั้งที่สร้างโจทย์ใหม่"
        />
        <Toggle
          checked={defaults.shuffleChoices}
          onChange={v => update('shuffleChoices', v)}
          label="สลับลำดับตัวเลือก ก, ข, ค, ง"
          description="สุ่มลำดับตัวเลือกปรนัยใหม่ทุกครั้งที่นักเรียนเปิดข้อสอบ เพื่อลดการลอกคำตอบ"
        />
      </SectionCard>

      {/* ── Numeric Defaults ─────────────────────────────────────────────── */}
      <SectionCard
        title="ค่าตัวเลขเริ่มต้น"
        description="กำหนดค่าเริ่มต้นที่ใช้ในการสร้างและตรวจข้อสอบ"
        icon={Hash}
      >
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 py-5">
          {/* Decimal places */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Hash size={14} className="text-muted-foreground" />
              <p className="text-sm font-medium">จำนวนทศนิยมเริ่มต้น</p>
            </div>
            <select
              value={defaults.decimalPlaces}
              onChange={e => update('decimalPlaces', Number(e.target.value))}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {[0, 1, 2, 3, 4, 5, 6].map(n => (
                <option key={n} value={n}>{n} ตำแหน่งทศนิยม{n === 2 ? ' (ค่าแนะนำ)' : ''}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              ใช้ในการตรวจคำตอบแบบเติมเลข — นักเรียนต้องตอบให้ถูกต้องถึง {defaults.decimalPlaces} ตำแหน่ง
            </p>
            <div className="bg-muted/40 rounded-xl p-3 border">
              <p className="text-xs text-muted-foreground mb-1">ตัวอย่างคำตอบที่ยอมรับ:</p>
              <div className="flex gap-2 flex-wrap">
                {defaults.decimalPlaces === 0
                  ? ['9', '10', '11'].map(v => <code key={v} className="text-xs bg-background border rounded px-2 py-0.5 font-mono">{v}</code>)
                  : [
                      (9.876543).toFixed(defaults.decimalPlaces),
                      (10.0).toFixed(defaults.decimalPlaces),
                    ].map(v => <code key={v} className="text-xs bg-background border rounded px-2 py-0.5 font-mono">{v}</code>)
                }
              </div>
            </div>
          </div>

          {/* Passing percent */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Percent size={14} className="text-muted-foreground" />
              <p className="text-sm font-medium">เกณฑ์สอบผ่านเริ่มต้น</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                value={defaults.passingPercent}
                onChange={e => {
                  const v = Math.max(0, Math.min(100, Number(e.target.value)))
                  update('passingPercent', v)
                }}
                className="w-24 h-10 rounded-xl border border-input bg-background px-3 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring font-mono font-bold"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              นักเรียนต้องได้คะแนนอย่างน้อย {defaults.passingPercent}% จึงจะถือว่าผ่าน
            </p>
            {/* Visual bar */}
            <div className="space-y-1">
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    defaults.passingPercent >= 80 ? 'bg-red-500' :
                    defaults.passingPercent >= 60 ? 'bg-amber-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${defaults.passingPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0%</span>
                <span className={`font-semibold ${
                  defaults.passingPercent >= 80 ? 'text-red-500' :
                  defaults.passingPercent >= 60 ? 'text-amber-500' :
                  'text-green-500'
                }`}>{defaults.passingPercent}%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Quick preset buttons ──────────────────────────────────────────── */}
      <div className="bg-card border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <ListOrdered size={14} className="text-muted-foreground" />
          <p className="text-sm font-medium">ตั้งค่าด่วนตามระดับ</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: '🏫 ม.ต้น (ง่าย)', values: { autoRandomize: true, shuffleChoices: false, decimalPlaces: 1, passingPercent: 50 } },
            { label: '📚 ม.ปลาย (มาตรฐาน)', values: { autoRandomize: true, shuffleChoices: false, decimalPlaces: 2, passingPercent: 60 } },
            { label: '🏆 โอลิมปิก (เข้มข้น)', values: { autoRandomize: true, shuffleChoices: true, decimalPlaces: 3, passingPercent: 75 } },
          ].map(preset => (
            <button
              key={preset.label}
              type="button"
              onClick={() => { setDefaults(prev => ({ ...prev, ...preset.values })); setSaved(false) }}
              className="text-xs px-3 py-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted hover:border-primary/30 transition-colors font-medium"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {saved ? '✓ บันทึกแล้ว' : 'มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก'}
        </p>
        <Button onClick={handleSave} className="min-w-[140px]">
          บันทึกค่าเริ่มต้น
        </Button>
      </div>
    </div>
  )
}
