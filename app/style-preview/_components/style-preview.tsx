'use client'

import { useEffect, useState } from 'react'
import { Flag, Trash2, Copy, Share2, Eye, Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DIFF_META } from '@/lib/question-display'

/** Must match the [data-style] blocks at the bottom of app/globals.css. */
const PRESETS = [
  { id: null, label: 'ไม่ใส่ preset', desc: 'ค่าเริ่มต้นของระบบ — indigo · มนปานกลาง' },
  { id: 'soft', label: 'soft', desc: 'มน โปร่ง เงานุ่ม' },
  { id: 'sharp', label: 'sharp', desc: 'เหลี่ยม แน่น ไม่มีเงา' },
  { id: 'warm', label: 'warm', desc: 'โทนอุ่น ครีม' },
  { id: 'minimal', label: 'minimal', desc: 'เกือบขาวดำ น้ำหนักเบา' },
  { id: 'playful', label: 'playful', desc: 'หนา มนมาก เงาทึบ' },
] as const

export function StylePreview() {
  // Start from whatever app/layout.tsx set, so opening this page does not
  // silently show a different style than the app is actually configured with.
  const [preset, setPreset] = useState<string | null>(null)
  const [dark, setDark] = useState(false)
  const [appPreset, setAppPreset] = useState<string | null>(null)

  useEffect(() => {
    const initial = document.documentElement.getAttribute('data-style')
    setAppPreset(initial)
    setPreset(initial)
  }, [])

  useEffect(() => {
    const el = document.documentElement
    if (preset) el.setAttribute('data-style', preset)
    else el.removeAttribute('data-style')
    return () => {
      if (appPreset) el.setAttribute('data-style', appPreset)
      else el.removeAttribute('data-style')
    }
  }, [preset, appPreset])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">ลองสไตล์</h1>
          <p className="text-sm text-muted-foreground">
            ทุกอย่างด้านล่างมาจาก token และ primitive เดียวกับที่แอปใช้จริง — สลับ preset
            แล้วดูว่าเปลี่ยนไปแค่ไหน สีที่มีความหมายจะไม่เปลี่ยนตาม
          </p>
        </header>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              variant={preset === p.id ? 'default' : 'outline'}
              onClick={() => setPreset(p.id)}
              title={p.desc}
            >
              {p.label}
              {p.id === appPreset && <span className="ml-1 opacity-70">· ใช้อยู่</span>}
            </Button>
          ))}
          <Button variant="secondary" onClick={() => setDark((d) => !d)}>
            {dark ? 'โหมดสว่าง' : 'โหมดมืด'}
          </Button>
        </div>

        <Card padding="lg" elevation="md" className="space-y-4">
          <div>
            <p className="text-base font-semibold text-foreground">การ์ดหลัก</p>
            <p className="text-sm text-muted-foreground">
              ระยะห่าง ความมน และเงา มาจาก --spacing / --radius / --elevation
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button>ปุ่มหลัก</Button>
            <Button variant="outline">ปุ่มรอง</Button>
            <Button variant="secondary">ปุ่มที่สาม</Button>
            <Button variant="ghost">ปุ่มโปร่ง</Button>
            <Button variant="destructive">ลบ</Button>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {(['2xs', 'xs', 'sm', 'default', 'lg'] as const).map((s) => (
              <IconButton key={s} label={`ขนาด ${s}`} size={s}>
                <Trash2 />
              </IconButton>
            ))}
            <IconButton label="แชร์" size="sm"><Share2 /></IconButton>
            <IconButton label="คัดลอก" size="sm"><Copy /></IconButton>
            <IconButton label="ดู" size="sm"><Eye /></IconButton>
          </div>

          <div className="space-y-1.5 max-w-xs">
            <Label>ช่องกรอก</Label>
            <Input placeholder="พิมพ์อะไรสักอย่าง" />
          </div>
        </Card>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            สีที่มีความหมาย — ต้องเหมือนกันทุก preset
          </h2>
          <Card padding="md" className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-success/10 px-2.5 py-1 text-success">สำเร็จ</span>
            <span className="rounded-full bg-warning/10 px-2.5 py-1 text-warning">เตือน</span>
            <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-destructive">อันตราย</span>
            <span className="rounded-full bg-flag/10 px-2.5 py-1 text-flag">ถูกรายงาน</span>
            {Object.entries(DIFF_META).map(([key, m]) => (
              <span key={key} className={`rounded-full px-2.5 py-1 ${m.badge}`}>
                {m.label}
              </span>
            ))}
          </Card>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">ขอบทั้งสามแบบ</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {(['border', 'ring', 'dashed'] as const).map((edge) => (
              <Card key={edge} edge={edge} padding="md" elevation="sm">
                <Flag className="mb-2 h-4 w-4 text-primary" />
                <p className="text-sm font-medium text-foreground">edge={edge}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  ตัวอักษรรองใช้ --muted-foreground
                </p>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">สเกลตัวอักษรและน้ำหนัก</h2>
          <Card padding="lg" className="space-y-1">
            <p className="text-2xl font-bold text-foreground">หัวข้อใหญ่ 2xl bold</p>
            <p className="text-lg font-semibold text-foreground">หัวข้อรอง lg semibold</p>
            <p className="text-base font-medium text-foreground">เนื้อหา base medium</p>
            <p className="text-sm text-muted-foreground">คำอธิบาย sm normal</p>
            <p className="text-xs text-muted-foreground">หมายเหตุ xs normal</p>
          </Card>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">สถานะ</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card padding="md" className="flex items-center gap-2">
              <Check className="h-4 w-4 text-success" />
              <span className="text-sm text-foreground">ส่งงานครบแล้ว</span>
            </Card>
            <Card padding="md" edge="border" className="border-flag/30 bg-flag/5 flex items-center gap-2">
              <Flag className="h-4 w-4 text-flag" />
              <span className="text-sm text-foreground">โจทย์ข้อนี้ถูกรายงาน</span>
            </Card>
          </div>
        </section>
      </div>
    </div>
  )
}
