'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { RichText } from '@/components/ui/rich-text'
import { cn } from '@/lib/utils'
import { saveIocReviewRating, submitIocReview } from '@/lib/actions/ioc-review'
import { iocLinkDaysLeft } from '@/lib/ioc-token'
import type { IocReviewContext } from '@/lib/ioc-review-server'
import type { IocScore } from '@/lib/ioc'
import { SignaturePad } from '@/components/ioc/signature-pad'
import { SignatureUpload } from '@/components/ioc/signature-upload'

type Screen = 'rating' | 'review' | 'done'

interface DraftRating {
  score: IocScore | null
  comment: string
}

const SCORE_CHOICES: { value: IocScore; label: string; short: string }[] = [
  { value: 1, label: 'แน่ใจว่าสอดคล้องกับตัวชี้วัด', short: '+1' },
  { value: 0, label: 'ไม่แน่ใจ', short: '0' },
  { value: -1, label: 'แน่ใจว่าไม่สอดคล้อง', short: '−1' },
]

export function IocReviewClient({ token, context }: { token: string; context: IocReviewContext }) {
  const { expert, form, items, standards } = context
  const standardById = useMemo(
    () => new Map(standards.map(standard => [standard.id, standard])),
    [standards],
  )

  const [drafts, setDrafts] = useState<Record<string, DraftRating>>(() => {
    const initial: Record<string, DraftRating> = {}
    for (const item of items) initial[item.id] = { score: null, comment: '' }
    for (const rating of context.ratings) {
      initial[rating.item_id] = { score: rating.score, comment: rating.comment ?? '' }
    }
    return initial
  })
  const [index, setIndex] = useState(0)
  const [screen, setScreen] = useState<Screen>(context.alreadySubmitted ? 'done' : 'rating')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const answered = items.filter(item => drafts[item.id]?.score !== null).length
  const daysLeft = iocLinkDaysLeft(expert.token_expires_at)
  const item = items[index]
  const standard = item?.standard_id ? standardById.get(item.standard_id) : undefined

  const persist = useCallback(
    async (itemId: string, draft: DraftRating) => {
      if (draft.score === null) return
      setSaving(true)
      const result = await saveIocReviewRating({
        token,
        item_id: itemId,
        score: draft.score,
        comment: draft.comment,
      })
      setSaving(false)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      setSavedAt(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }))
    },
    [token],
  )

  function setScore(itemId: string, score: IocScore) {
    const next = { ...(drafts[itemId] ?? { score: null, comment: '' }), score }
    setDrafts(current => ({ ...current, [itemId]: next }))
    void persist(itemId, next)
  }

  // A comment is saved a moment after typing stops, so a long suggestion is not
  // one request per keystroke and is never lost by moving to the next item.
  const commentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function setComment(itemId: string, comment: string) {
    const next = { ...(drafts[itemId] ?? { score: null, comment: '' }), comment }
    setDrafts(current => ({ ...current, [itemId]: next }))
    if (commentTimer.current) clearTimeout(commentTimer.current)
    commentTimer.current = setTimeout(() => void persist(itemId, next), 900)
  }

  useEffect(() => () => {
    if (commentTimer.current) clearTimeout(commentTimer.current)
  }, [])

  if (screen === 'done') {
    return <SubmittedScreen context={context} />
  }

  return (
    <main className="min-h-screen bg-muted pb-10">
      <header className="bg-surface-inverse px-4 py-4 text-surface-inverse-foreground">
        <div className="mx-auto max-w-3xl space-y-1">
          <p className="text-sm font-bold">🔒 ประเมินความสอดคล้อง (IOC)</p>
          <p className="text-xs text-surface-inverse-muted">{form.exam_title}</p>
          <p className="text-xs text-surface-inverse-muted">
            ผู้ประเมินคนที่ {expert.expert_order} · {expert.display_name}
            {daysLeft !== null ? ` · ลิงก์ใช้ได้อีก ${daysLeft} วัน` : ''}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-accent">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${items.length === 0 ? 0 : (answered / items.length) * 100}%` }}
            />
          </div>
          <span className="text-xs font-bold text-muted-foreground">
            ประเมินแล้ว {answered} จาก {items.length} ข้อ
          </span>
        </div>

        <p className="text-right text-xs font-semibold text-success" aria-live="polite">
          {saving ? 'กำลังบันทึก…' : savedAt ? `✓ บันทึกร่างแล้ว ${savedAt}` : 'บันทึกร่างอัตโนมัติ'}
        </p>

        {screen === 'review' ? (
          <ReviewScreen
            token={token}
            context={context}
            drafts={drafts}
            onBack={() => setScreen('rating')}
            onJump={target => {
              setIndex(target)
              setScreen('rating')
            }}
            onSubmitted={() => setScreen('done')}
          />
        ) : item ? (
          <>
            <Card padding="lg" className="space-y-3">
              <p className="text-xs font-bold text-muted-foreground">
                ข้อ {item.item_label} จาก {items.length} ข้อ
                {item.section_label ? ` · ${item.section_label}` : ''}
              </p>

              {standard ? (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
                  <p className="font-semibold text-foreground">{standard.code || 'ตัวชี้วัด'}</p>
                  {standard.description ? (
                    <p className="mt-1 leading-relaxed text-muted-foreground">{standard.description}</p>
                  ) : null}
                </div>
              ) : null}

              {item.group_intro ? (
                <div className="rounded-xl bg-muted p-3 text-sm leading-relaxed text-muted-foreground">
                  <RichText text={item.group_intro} />
                </div>
              ) : null}

              <div className="text-base leading-relaxed text-foreground">
                <span className="font-bold">{item.item_label}. </span>
                <RichText text={item.prompt} />
              </div>

              {item.choices.length > 0 ? (
                <ul className="grid grid-cols-1 gap-1 text-sm text-foreground sm:grid-cols-2">
                  {item.choices.map(choice => (
                    <li key={choice}><RichText text={choice} /></li>
                  ))}
                </ul>
              ) : null}

              {item.solution ? (
                <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-sm">
                  <p className="font-semibold text-foreground">แนวคำตอบ</p>
                  <div className="mt-1 leading-relaxed text-muted-foreground"><RichText text={item.solution} /></div>
                </div>
              ) : null}
            </Card>

            <Card padding="lg" className="space-y-3">
              <p className="text-sm font-bold text-foreground">ความเห็นของท่าน</p>
              {SCORE_CHOICES.map(choice => {
                const selected = drafts[item.id]?.score === choice.value
                return (
                  <Button
                    key={choice.value}
                    variant={selected ? 'default' : 'outline'}
                    onClick={() => setScore(item.id, choice.value)}
                    aria-pressed={selected}
                    className="h-auto w-full justify-start gap-3 py-3 text-left text-sm font-semibold"
                  >
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
                        selected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-accent text-muted-foreground',
                      )}
                    >
                      {choice.short}
                    </span>
                    {choice.label}
                  </Button>
                )
              })}

              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground" htmlFor="ioc-item-comment">
                  ข้อเสนอแนะสำหรับข้อนี้
                </label>
                <Textarea
                  id="ioc-item-comment"
                  rows={3}
                  placeholder="ไม่บังคับ · ข้อความนี้จะอยู่ในคอลัมน์ข้อเสนอแนะของเอกสาร"
                  value={drafts[item.id]?.comment ?? ''}
                  onChange={event => setComment(item.id, event.target.value)}
                />
              </div>
            </Card>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={index === 0}
                onClick={() => setIndex(current => Math.max(0, current - 1))}
              >
                ← ข้อก่อนหน้า
              </Button>
              {index < items.length - 1 ? (
                <Button className="flex-1" onClick={() => setIndex(current => current + 1)}>
                  ข้อถัดไป →
                </Button>
              ) : (
                <Button className="flex-1" onClick={() => setScreen('review')}>
                  ตรวจทานก่อนส่ง
                </Button>
              )}
            </div>

            <Button variant="ghost" className="w-full" onClick={() => setScreen('review')}>
              ดูภาพรวมทั้ง {items.length} ข้อ
            </Button>
          </>
        ) : null}
      </div>
    </main>
  )
}

function ReviewScreen({
  token,
  context,
  drafts,
  onBack,
  onJump,
  onSubmitted,
}: {
  token: string
  context: IocReviewContext
  drafts: Record<string, DraftRating>
  onBack: () => void
  onJump: (index: number) => void
  onSubmitted: () => void
}) {
  const { items } = context
  const [overall, setOverall] = useState(context.expert.overall_comment)
  const [mode, setMode] = useState<'drawn' | 'uploaded' | 'typed' | 'none'>('drawn')
  const [signature, setSignature] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [pending, startTransition] = useTransition()

  const missing = items.filter(item => drafts[item.id]?.score === null)

  function submit() {
    if (missing.length > 0) {
      toast.error(`ยังประเมินไม่ครบ เหลือข้อ ${missing.map(item => item.item_label).join(', ')}`)
      return
    }
    if (mode !== 'none' && !consent) {
      toast.error('กรุณาติ๊กยอมรับการใช้ลายเซ็นก่อนส่ง')
      return
    }
    if ((mode === 'drawn' || mode === 'uploaded') && !signature) {
      toast.error(mode === 'drawn' ? 'ยังไม่ได้เซ็น กรุณาเซ็นในกรอบก่อน' : 'ยังไม่ได้เลือกรูปลายเซ็น')
      return
    }

    startTransition(async () => {
      const result = await submitIocReview({
        token,
        overall_comment: overall,
        signature_mode: mode,
        signature_data_url: mode === 'drawn' || mode === 'uploaded' ? signature : null,
        consent,
      })
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      onSubmitted()
    })
  }

  return (
    <div className="space-y-4">
      <Card padding="none" className="overflow-hidden">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold text-foreground">ตรวจทานก่อนส่ง</h2>
          <p className="mt-1 text-sm text-muted-foreground">แตะที่ข้อเพื่อกลับไปแก้</p>
        </div>
        <ul className="divide-y">
          {items.map((item, itemIndex) => {
            const draft = drafts[item.id]
            return (
              <li key={item.id}>
                <Button
                  variant="ghost"
                  onClick={() => onJump(itemIndex)}
                  className="h-auto w-full justify-start gap-3 rounded-none px-4 py-3 text-left font-normal"
                >
                  <span className="w-8 shrink-0 text-sm font-bold text-muted-foreground">{item.item_label}</span>
                  <span className="flex-1 truncate text-sm text-foreground">
                    {item.prompt.replace(/<[^>]*>/g, ' ').trim().slice(0, 60) || '(ไม่มีข้อความโจทย์)'}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-lg px-2 py-1 text-xs font-bold',
                      draft?.score === null ? 'bg-warning/20 text-warning' : 'bg-success/15 text-success',
                    )}
                  >
                    {draft?.score === null ? 'ยังไม่ประเมิน' : draft?.score === 1 ? '+1' : draft?.score === 0 ? '0' : '−1'}
                  </span>
                </Button>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card padding="lg" className="space-y-3">
        <label className="text-sm font-bold text-foreground" htmlFor="ioc-overall">ข้อเสนอแนะภาพรวม</label>
        <Textarea
          id="ioc-overall"
          rows={4}
          placeholder="ไม่บังคับ · จะพิมพ์อยู่ท้ายฉบับของท่าน"
          value={overall}
          onChange={event => setOverall(event.target.value)}
        />
      </Card>

      <Card padding="lg" className="space-y-3">
        <div>
          <p className="text-sm font-bold text-foreground">ลงนาม</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            เลือกเซ็นในเว็บ หรือเว้นไว้เซ็นด้วยปากกาบนเอกสารที่พิมพ์ออกมา
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            { value: 'drawn', label: 'เซ็นด้วยนิ้ว/เมาส์' },
            { value: 'uploaded', label: 'อัปโหลดรูป' },
            { value: 'typed', label: 'พิมพ์ชื่อ' },
            { value: 'none', label: 'เว้นไว้เซ็นเอง' },
          ] as const).map(choice => (
            <Button
              key={choice.value}
              variant={mode === choice.value ? 'default' : 'outline'}
              onClick={() => { setMode(choice.value); setSignature(null) }}
              aria-pressed={mode === choice.value}
              className="h-auto py-3 text-sm font-semibold"
            >
              {choice.label}
            </Button>
          ))}
        </div>

        {mode === 'drawn' ? <SignaturePad onChange={setSignature} /> : null}
        {mode === 'uploaded' ? <SignatureUpload onChange={setSignature} /> : null}
        {mode === 'typed' ? (
          <p className="rounded-xl bg-muted p-3 text-center text-lg text-foreground">
            {context.expert.display_name}
          </p>
        ) : null}

        {mode !== 'none' ? (
          <label className="flex items-start gap-3 text-xs leading-relaxed text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={consent}
              onChange={event => setConsent(event.target.checked)}
            />
            <span>
              ข้าพเจ้ายินยอมให้ใช้ลายเซ็นนี้ในเอกสารผลการประเมินความสอดคล้องฉบับนี้
            </span>
          </label>
        ) : null}
      </Card>

      <Card padding="lg" className="space-y-3">
        <p className="text-sm text-muted-foreground">
          เมื่อส่งแล้วจะแก้ไม่ได้ เว้นแต่ครูผู้ออกข้อสอบเปิดให้แก้อีกครั้ง
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onBack}>← กลับไปแก้</Button>
          <Button className="flex-1" onClick={submit} disabled={pending}>
            {pending ? 'กำลังส่ง…' : 'ส่งผลประเมิน'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

function SubmittedScreen({ context }: { context: IocReviewContext }) {
  const { expert, form } = context
  return (
    <main className="flex min-h-screen items-start justify-center bg-muted px-4 py-12">
      <Card padding="2xl" className="w-full max-w-lg space-y-3 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-success/15 text-2xl" aria-hidden="true">
          ✓
        </div>
        <h1 className="text-lg font-semibold text-foreground">ส่งผลประเมินเรียบร้อยแล้ว</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          ขอบพระคุณสำหรับการประเมิน {form.exam_title} จำนวน {context.items.length} ข้อ
          {expert.submitted_at
            ? ` · ส่งเมื่อ ${new Date(expert.submitted_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}`
            : ''}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          ครูผู้ออกข้อสอบจะเห็นผลของท่านทันที หากต้องการแก้ไข กรุณาแจ้งครูให้เปิดให้แก้อีกครั้ง
        </p>
      </Card>
    </main>
  )
}
