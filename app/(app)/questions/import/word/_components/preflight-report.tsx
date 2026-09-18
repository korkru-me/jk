'use client'

import { Check, CircleAlert, Download, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { PreflightCheck, PreflightReport } from '@/lib/docx-import/preflight'
import type { ImportProfile } from '@/lib/docx-import/profiles'

/**
 * What the file turned out to be, said against the rules the teacher just read.
 *
 * Each line names the rule by the number it carries on the guide beside it, so
 * "กฎข้อ 2" is something to look up rather than something to guess at. The
 * detail underneath is what was actually found — which ข้อ, how many — because
 * a teacher fixing a worksheet needs a place to put the cursor, not a verdict.
 */
function ruleIndex(profile: ImportProfile, ruleId: string): number {
  return profile.rules.findIndex(rule => rule.id === ruleId) + 1
}

const ICONS = {
  pass: Check,
  warn: TriangleAlert,
  fail: CircleAlert,
} as const

const TONES = {
  pass: 'text-success',
  warn: 'text-warning',
  fail: 'text-destructive',
} as const

function CheckRow({ profile, check }: { profile: ImportProfile; check: PreflightCheck }) {
  const Icon = ICONS[check.status]
  const rule = profile.rules.find(item => item.id === check.ruleId)

  return (
    <li className="flex gap-2.5 text-xs leading-relaxed">
      <Icon className={`mt-0.5 size-4 shrink-0 ${TONES[check.status]}`} aria-hidden />
      <div className="min-w-0">
        <p className="font-medium text-foreground">
          กฎข้อ {ruleIndex(profile, check.ruleId)}: {rule?.text}
        </p>
        <p className={check.status === 'pass' ? 'text-muted-foreground' : TONES[check.status]}>
          {check.detail}
        </p>
      </div>
    </li>
  )
}

/**
 * The screen for a file nothing could be read from.
 *
 * It replaces a single line — "อ่านไฟล์ได้ แต่ไม่พบข้อไหนเลย" — that named the
 * symptom and not the cause. A teacher at this point already has the file and
 * is deciding between reformatting it and giving up on the feature, so the
 * cause, the rule it belongs to, and the example file all have to be right
 * here.
 */
export function PreflightFailure({
  profile,
  report,
  fileName,
}: {
  profile: ImportProfile
  report: PreflightReport
  fileName: string
}) {
  return (
    <Card padding="lg" className="space-y-3 border-destructive/30 bg-destructive/5">
      <div className="flex gap-2.5">
        <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            ยังอ่านโจทย์จาก {fileName} ไม่ได้
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            ไฟล์เปิดได้ปกติ แต่ยังไม่ตรงรูปแบบที่ระบบอ่านออก — แก้ตามข้างล่างนี้แล้วเลือกไฟล์ใหม่อีกครั้ง
          </p>
        </div>
      </div>

      <ul className="space-y-2 border-t border-destructive/20 pt-3">
        {report.checks.map(check => (
          <CheckRow key={check.ruleId} profile={profile} check={check} />
        ))}
      </ul>

      <div className="border-t border-destructive/20 pt-3">
        <a href={`/api/questions/import-sample/${profile.slug}`} download>
          <Button type="button" variant="outline" size="sm">
            <Download aria-hidden /> ดาวน์โหลดไฟล์ตัวอย่างมาเทียบ
          </Button>
        </a>
        <p className="mt-2 text-xs text-muted-foreground">
          วิธีที่เร็วที่สุดคือเปิดไฟล์ตัวอย่าง แล้วพิมพ์โจทย์ของคุณทับลงไป รูปแบบจะถูกอยู่แล้ว
        </p>
      </div>
    </Card>
  )
}

/** The same account, for a file that did come apart into โจทย์. */
export function PreflightSummary({
  profile,
  report,
}: {
  profile: ImportProfile
  report: PreflightReport
}) {
  // A file where everything passed needs no list: the โจทย์ themselves are the
  // answer, and a wall of green ticks only pushes them further down the page.
  const notable = report.checks.filter(check => check.status !== 'pass')
  if (notable.length === 0) return null

  return (
    <ul className="space-y-2 border-t border-border pt-3">
      {notable.map(check => (
        <CheckRow key={check.ruleId} profile={profile} check={check} />
      ))}
    </ul>
  )
}
