'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { COVER_PRESETS } from '@/app/(app)/classrooms/_components/classroom-meta'
import { groupPreset } from '@/app/(app)/classrooms/_components/group-colors'
import type { LateBandColorId } from '@/lib/late-submission'
import { cn } from '@/lib/utils'

export interface LateBandDraft {
  id: string
  startsAt: string
  label: string
  color: LateBandColorId
}

interface Props {
  idPrefix: string
  dueAt: string
  endAt: string
  bands: LateBandDraft[]
  disabled?: boolean
  onDueAtChange: (value: string) => void
  onEndAtChange: (value: string) => void
  onBandsChange: (bands: LateBandDraft[]) => void
}

function makeDraft(startsAt: string, index: number): LateBandDraft {
  return {
    id: crypto.randomUUID(),
    startsAt,
    label: index === 0 ? 'ส่งช้าช่วงแรก' : `ส่งช้าช่วงที่ ${index + 1}`,
    color: index === 0 ? 'amber' : 'red',
  }
}

export function LateSubmissionScheduleFields({
  idPrefix,
  dueAt,
  endAt,
  bands,
  disabled = false,
  onDueAtChange,
  onEndAtChange,
  onBandsChange,
}: Props) {
  function updateDueAt(value: string) {
    onDueAtChange(value)
    if (!value) {
      onBandsChange([])
      return
    }
    if (bands.length === 0) {
      onBandsChange([makeDraft(value, 0)])
      return
    }
    onBandsChange(bands.map((band, index) => (index === 0 ? { ...band, startsAt: value } : band)))
  }

  function updateBand(index: number, patch: Partial<LateBandDraft>) {
    onBandsChange(bands.map((band, position) => position === index ? { ...band, ...patch } : band))
  }

  return (
    <FieldGroup className="gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-due`}>ส่งตรงเวลาภายใน</FieldLabel>
          <Input
            id={`${idPrefix}-due`}
            type="datetime-local"
            value={dueAt}
            disabled={disabled}
            onChange={event => updateDueAt(event.target.value)}
          />
          <FieldDescription>หลังเวลานี้ยังส่งได้ แต่จะติดป้ายสีตามช่วงที่กำหนด</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-end`}>ปิดรับเมื่อ</FieldLabel>
          <Input
            id={`${idPrefix}-end`}
            type="datetime-local"
            value={endAt}
            onChange={event => onEndAtChange(event.target.value)}
          />
          <FieldDescription>เมื่อถึงเวลานี้ นักเรียนจะส่งงานเพิ่มไม่ได้</FieldDescription>
        </Field>
      </div>

      {dueAt && (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
          <div>
            <p className="text-sm font-semibold text-foreground">ช่วงสีของงานที่ส่งช้า</p>
            <p className="text-xs leading-5 text-muted-foreground">
              นักเรียนที่อยู่สีเดียวกันจะกรองและตั้งค่าปรับคะแนนพร้อมกันได้ภายหลัง สีเป็นเพียงป้ายกำกับและไม่หักคะแนนอัตโนมัติ
            </p>
          </div>

          <div className="space-y-2">
            {bands.map((band, index) => {
              const preset = groupPreset(band.color)
              return (
                <div
                  key={band.id}
                  className={cn('grid gap-2 rounded-xl border p-3 lg:grid-cols-[minmax(10rem,1fr)_minmax(11rem,1fr)_9rem_auto]', preset.surface)}
                >
                  <Field>
                    <FieldLabel htmlFor={`${idPrefix}-band-label-${band.id}`}>ชื่อช่วง</FieldLabel>
                    <Input
                      id={`${idPrefix}-band-label-${band.id}`}
                      value={band.label}
                      maxLength={60}
                      disabled={disabled}
                      onChange={event => updateBand(index, { label: event.target.value })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${idPrefix}-band-start-${band.id}`}>
                      {index === 0 ? 'เริ่มหลังเวลาส่ง' : 'เมื่อเกิน'}
                    </FieldLabel>
                    <Input
                      id={`${idPrefix}-band-start-${band.id}`}
                      type="datetime-local"
                      value={index === 0 ? dueAt : band.startsAt}
                      disabled={disabled || index === 0}
                      onChange={event => updateBand(index, { startsAt: event.target.value })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${idPrefix}-band-color-${band.id}`}>สี</FieldLabel>
                    <NativeSelect
                      id={`${idPrefix}-band-color-${band.id}`}
                      value={band.color}
                      disabled={disabled}
                      onChange={event => updateBand(index, { color: event.target.value as LateBandColorId })}
                    >
                      {COVER_PRESETS.map(color => <option key={color.id} value={color.id}>{color.label}</option>)}
                    </NativeSelect>
                  </Field>
                  <div className="flex items-end justify-end">
                    {index > 0 && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={disabled}
                        aria-label={`ลบ${band.label || `ช่วงที่ ${index + 1}`}`}
                        onClick={() => onBandsChange(bands.filter((_, position) => position !== index))}
                      >
                        <Trash2 data-icon="inline-start" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={disabled || bands.length >= 8}
            onClick={() => onBandsChange([...bands, makeDraft('', bands.length)])}
          >
            <Plus data-icon="inline-start" />
            เพิ่มช่วงเวลา
          </Button>
          {bands.length >= 8 && <p className="text-xs text-muted-foreground">กำหนดได้สูงสุด 8 ช่วง</p>}
          {disabled && <p className="text-xs text-muted-foreground">ล็อกช่วงสีแล้ว เพราะมีนักเรียนเริ่มทำงานนี้</p>}
        </div>
      )}
    </FieldGroup>
  )
}
