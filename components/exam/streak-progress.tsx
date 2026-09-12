'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { StreakEnding } from '@/lib/streak-run'

/**
 * The two pieces of chrome a "ถูกติดต่อกัน" attempt needs that no other attempt
 * has: a meter for a run, and an ending screen for a งาน whose length was an
 * outcome.
 *
 * Kept out of exam-client.tsx deliberately. That file carries every answer
 * input and is 3,000 lines; this mode needs new UI, not a rewrite of that, and
 * the less of it that lands in the contested file the better.
 */

export interface StreakView {
  target: number
  current: number
  best: number
  reached: boolean
  /** ข้อ handed out so far in this attempt. */
  askedCount: number
  questionCap: number | null
}

/**
 * Dots rather than "3/5": a run is a thing you can lose, and a row of filled
 * dots emptying out says that in a way a fraction does not. Above eight the
 * dots stop being countable at a glance and the number carries it instead.
 */
const MAX_DOTS = 8

export function StreakMeter({ streak, lastVerdict }: {
  streak: StreakView
  /** Colours the meter right after a check. null = nothing checked yet. */
  lastVerdict?: 'correct' | 'wrong' | 'pending' | null
}) {
  const showDots = streak.target <= MAX_DOTS
  const justMissed = lastVerdict === 'wrong' && streak.current === 0

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {showDots && (
        <div className="flex items-center gap-1.5" role="img" aria-label={`ถูกติดต่อกัน ${streak.current} จาก ${streak.target} ข้อ`}>
          {Array.from({ length: streak.target }, (_, i) => {
            const filled = i < streak.current
            return (
              <span
                key={i}
                className={`w-3 h-3 rounded-full border-2 ${
                  filled
                    ? 'bg-success border-success'
                    : justMissed && i === 0
                      ? 'bg-warning/20 border-warning'
                      : 'border-border'
                }`}
              />
            )
          })}
        </div>
      )}
      <p className="text-sm font-medium text-foreground tabular-nums">
        {streak.reached
          ? `ผ่านแล้ว — ถูกติดต่อกัน ${streak.target} ข้อ`
          : `ถูกติดต่อกัน ${streak.current} / ${streak.target}`}
      </p>
      <p className="text-xs text-muted-foreground tabular-nums">
        ทำไปแล้ว {streak.askedCount} ข้อ
        {streak.questionCap != null && ` / หยุดที่ ${streak.questionCap}`}
        {streak.best > streak.current && ` · ติดกันมากสุด ${streak.best}`}
      </p>
    </div>
  )
}

/** What a student sees when the run — or the attempt — is over. */
export function StreakEndScreen({ ending, streak, submitting, onFinish, onKeepPracticing }: {
  ending: Exclude<StreakEnding, null>
  streak: StreakView
  submitting: boolean
  onFinish: () => void
  /** Absent when practising on is impossible (the pool ran dry, or the cap hit). */
  onKeepPracticing?: () => void
}) {
  const passed = ending === 'reached'

  // Each ending is a different thing to tell a student, and the wrong one is
  // worse than none: "ทำครบเพดานแล้ว" to someone who just passed, or a
  // congratulation to someone who ran out of โจทย์.
  const copy = passed
    ? {
        icon: '🎉',
        title: `ถูกติดต่อกัน ${streak.target} ข้อแล้ว!`,
        body: 'ผ่านเกณฑ์ของงานนี้แล้ว กดจบเพื่อบันทึกผล หรือฝึกต่อได้ตามใจ — ผลที่ผ่านแล้วไม่หายไป',
      }
    : ending === 'question_cap'
      ? {
          icon: '⏸️',
          title: `ทำครบ ${streak.askedCount} ข้อแล้ว`,
          body: `ยังไม่ถูกติดต่อกันครบ ${streak.target} ข้อ — ติดกันมากสุดที่ทำได้คือ ${streak.best} ข้อ พักก่อนแล้วค่อยกลับมาลองใหม่ได้`,
        }
      : {
          icon: '📭',
          title: 'ทำโจทย์ในชุดนี้ครบแล้ว',
          body: `ยังไม่ถูกติดต่อกันครบ ${streak.target} ข้อ — ติดกันมากสุดที่ทำได้คือ ${streak.best} ข้อ ครูตั้งให้ไม่วนโจทย์ซ้ำ งานนี้จึงจบที่นี่`,
        }

  return (
    <Card padding="xl" className={`space-y-4 text-center ${passed ? 'border-success' : 'border-warning'}`}>
      <p className="text-4xl" aria-hidden="true">{copy.icon}</p>
      <h2 className={`font-bold text-lg ${passed ? 'text-success' : 'text-warning'}`}>{copy.title}</h2>
      <p className="text-sm text-muted-foreground max-w-prose mx-auto">{copy.body}</p>
      <p className="text-xs text-muted-foreground tabular-nums">
        ทำไปทั้งหมด {streak.askedCount} ข้อ · ติดกันมากสุด {streak.best} ข้อ
      </p>
      <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
        {onKeepPracticing && (
          <Button type="button" variant="outline" onClick={onKeepPracticing} disabled={submitting}>
            ฝึกต่ออีก
          </Button>
        )}
        <Button type="button" onClick={onFinish} disabled={submitting}>
          {submitting ? 'กำลังบันทึก...' : 'จบแล้ว บันทึกผล'}
        </Button>
      </div>
    </Card>
  )
}
