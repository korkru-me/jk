'use client'

import { SampleTable } from './sample-table'
import { Info } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { TrialSummary } from '@/lib/math/evaluator'
import type { LogicRule, PythagoreanGroup, Variable } from '@/lib/types'
import { Card } from '@/components/ui/card'

// ─── TestRunPanel ─────────────────────────────────────────────────────────────

export function TestRunPanel({ variables, logicRules, formula, answerStep, pythagoreanGroups }: {
  variables: Variable[]
  logicRules: LogicRule[]
  formula: string
  answerStep: number
  pythagoreanGroups: PythagoreanGroup[]
}) {
  const [summary, setSummary] = useState<TrialSummary | null>(null)
  const [running, setRunning] = useState(false)

  // The evaluator carries mathjs (638 KB) and nothing on this form needs it
  // until the teacher asks for a trial run. Fetching it inside the handler,
  // where `running` already shows a busy state and the work was deferred by a
  // timeout anyway, keeps the page light without changing what the click does.
  async function run() {
    if (!formula.trim()) { toast.error('กรอกสมการก่อนทดสอบ'); return }
    setRunning(true)
    setSummary(null)
    let runTrials: typeof import('@/lib/math/evaluator').runTrials
    try {
      ({ runTrials } = await import('@/lib/math/evaluator'))
    } catch {
      toast.error('โหลดตัวคำนวณไม่สำเร็จ ลองใหม่อีกครั้ง')
      setRunning(false)
      return
    }
    setTimeout(() => {
      const result = runTrials(variables, logicRules, formula, {
        answerStep,
        pythagoreanGroups,
        trialCount: 200,
      })
      setSummary(result)
      setRunning(false)
    }, 10)
  }

  const inputVarNames = variables
    .filter(v => !v.is_answer && v.type !== 'reference')
    .map(v => v.name)

  const nicePercent = summary ? Math.round(summary.niceCount / summary.total * 100) : 0

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium border-2 border-dashed rounded-xl transition-colors border-primary/20 text-primary hover:bg-primary/10 hover:border-primary disabled:opacity-60"
      >
        {running ? '⏳ กำลังทดสอบ 200 รอบ...' : '🎲 ทดสอบการสุ่ม (200 รอบ)'}
      </button>

      {summary && (
        <Card radius="md" elevation="sm" className="overflow-hidden">
          <div className="p-4 space-y-3 bg-muted border-b border-border">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-muted-foreground">คำตอบลงตัว</span>
                <span className={`font-bold tabular-nums ${nicePercent >= 50 ? 'text-success' : 'text-destructive'}`}>
                  {summary.niceCount} / {summary.total} ({nicePercent}%)
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${nicePercent >= 50 ? 'bg-success' : 'bg-destructive'}`}
                  style={{ width: `${nicePercent}%` }}
                />
              </div>
            </div>

            {summary.messyCount > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-warning">⚠ มีเลขยากระหว่างคำนวณ</span>
                  <span className="font-bold text-warning tabular-nums">
                    {summary.messyCount} ชุด จาก {summary.niceCount} ชุดที่ดี
                  </span>
                </div>
                <div className="h-2 bg-warning/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-warning rounded-full"
                    style={{ width: `${summary.niceCount > 0 ? summary.messyCount / summary.niceCount * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {summary.niceCount === 0 && (
              <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2 mt-2">
                <Info className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                <p className="text-xs text-destructive font-medium">
                  ไม่พบชุดคำตอบที่ตรงเงื่อนไข — ลองขยายช่วงค่าตัวแปร หรือปรับขนาดก้าวคำตอบ
                </p>
              </div>
            )}
          </div>

          {(summary.niceSamples.length > 0 || summary.warningSamples.length > 0 || summary.badSamples.length > 0) && (
            <div className="p-4 space-y-4">
              {summary.niceSamples.length > 0 && (
                <SampleTable title="ตัวอย่างชุดที่ดี" samples={summary.niceSamples} varNames={inputVarNames} type="good" />
              )}
              {summary.warningSamples.length > 0 && (
                <SampleTable title="ตัวอย่างชุดที่ดี (แต่มีเลขยากระหว่างคำนวณ)" samples={summary.warningSamples} varNames={inputVarNames} type="warn" />
              )}
              {summary.badSamples.length > 0 && (
                <SampleTable title="ตัวอย่างชุดที่ไม่ผ่านขนาดก้าว" samples={summary.badSamples} varNames={inputVarNames} type="bad" />
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
