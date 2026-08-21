'use client'

import { useState } from 'react'
import { Plus, Lock, Unlock, Trash2, ChevronRight, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Card } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'

interface Rule {
  id: string
  conditionAssignment: string
  conditionScore: number
  unlockAssignment: string
}

const MOCK_ASSIGNMENTS = [
  'อนุภาคมูลฐาน (แบบจำลองมาตรฐาน)',
  'โครงการ CERN และเครื่องเร่งอนุภาค',
  'กลศาสตร์นิวตัน บทที่ 1–3',
  'คลื่นแม่เหล็กไฟฟ้า',
  'ฟิสิกส์ควอนตัม บทนำ',
  'สัมพัทธภาพพิเศษ',
]

const INITIAL_RULES: Rule[] = [
  {
    id: '1',
    conditionAssignment: 'อนุภาคมูลฐาน (แบบจำลองมาตรฐาน)',
    conditionScore: 60,
    unlockAssignment: 'โครงการ CERN และเครื่องเร่งอนุภาค',
  },
  {
    id: '2',
    conditionAssignment: 'กลศาสตร์นิวตัน บทที่ 1–3',
    conditionScore: 70,
    unlockAssignment: 'คลื่นแม่เหล็กไฟฟ้า',
  },
]

export function LearningPaths() {
  const [rules, setRules] = useState<Rule[]>(INITIAL_RULES)

  function addRule() {
    const newRule: Rule = {
      id: Date.now().toString(),
      conditionAssignment: MOCK_ASSIGNMENTS[0],
      conditionScore: 60,
      unlockAssignment: MOCK_ASSIGNMENTS[1],
    }
    setRules(prev => [...prev, newRule])
  }

  function updateRule(id: string, field: keyof Rule, value: string | number) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  function deleteRule(id: string) {
    setRules(prev => prev.filter(r => r.id !== id))
    toast.success('ลบเงื่อนไขแล้ว')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">กำหนดเงื่อนไขการปลดล็อกชุดข้อสอบ เพื่อสร้างเส้นทางการเรียนรู้ที่ต่อเนื่อง</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={addRule}>
          <Plus className="w-3.5 h-3.5" /> เพิ่มเงื่อนไข
        </Button>
      </div>

      {rules.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-border rounded-2xl">
          <Lock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">ยังไม่มีเงื่อนไข</p>
          <p className="text-xs text-muted-foreground/40 mt-1 mb-4">กดเพิ่มเงื่อนไขเพื่อสร้างเส้นทางการเรียน</p>
          <Button size="sm" onClick={addRule}><Plus className="w-3.5 h-3.5 mr-1" /> เพิ่มเงื่อนไข</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule, idx) => (
            <Card edge="ring" padding="md" key={rule.id}>
              <div className="flex items-start gap-3">
                {/* Step number */}
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </div>
                <div className="flex-1 space-y-3">
                  {/* Condition */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-1 rounded-lg whitespace-nowrap">ถ้าสอบผ่าน</span>
                    <NativeSelect
                      value={rule.conditionAssignment}
                      onChange={e => updateRule(rule.id, 'conditionAssignment', e.target.value)} className="flex-1 min-w-[160px]"
                    >
                      {MOCK_ASSIGNMENTS.map(a => <option key={a} value={a}>{a}</option>)}
                    </NativeSelect>
                  </div>

                  {/* Score condition */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-1 rounded-lg whitespace-nowrap">ด้วยคะแนนเกิน</span>
                    <div className="flex items-center gap-1 border border-border rounded-xl overflow-hidden">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={rule.conditionScore}
                        onChange={e => updateRule(rule.id, 'conditionScore', parseInt(e.target.value) || 0)} className="w-14 text-center"
                      />
                      <span className="text-xs text-muted-foreground pr-2">%</span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                    <Zap className="w-3.5 h-3.5 text-success" />
                    <span className="text-xs font-semibold text-success bg-success/10 px-2 py-1 rounded-lg whitespace-nowrap">ปลดล็อก</span>
                    <NativeSelect
                      value={rule.unlockAssignment}
                      onChange={e => updateRule(rule.id, 'unlockAssignment', e.target.value)} className="flex-1 min-w-[160px] border-success/20 bg-success/10"
                    >
                      {MOCK_ASSIGNMENTS.map(a => <option key={a} value={a}>{a}</option>)}
                    </NativeSelect>
                  </div>
                </div>

                <IconButton
                  onClick={() => deleteRule(rule.id)}
                  label="ลบเงื่อนไข"
                  size="sm"
                  className="hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 />
                </IconButton>
              </div>
            </Card>
          ))}
        </div>
      )}

      {rules.length > 0 && (
        <Button
          className="w-full"
          onClick={() => toast.success('บันทึกเส้นทางการเรียนแล้ว (ฟีเจอร์กำลังพัฒนา)')}
        >
          <Unlock className="w-3.5 h-3.5 mr-2" /> บันทึกเส้นทางการเรียน
        </Button>
      )}
    </div>
  )
}
