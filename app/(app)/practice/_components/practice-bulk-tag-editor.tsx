'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Tags } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { updatePracticeQuestionTags } from '../_actions'

interface PracticeBulkTagEditorProps {
  libraryId: string
  questionIds: string[]
  questions: Array<{ id: string; title: string }>
  disabled?: boolean
  disabledReason?: string
}

export function PracticeBulkTagEditor({
  libraryId,
  questionIds,
  questions,
  disabled = false,
  disabledReason = 'บันทึกรายการโจทย์ก่อนใช้เครื่องมือนี้',
}: PracticeBulkTagEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [operation, setOperation] = useState<'add' | 'remove'>('add')
  const [tag, setTag] = useState('')
  const [targetIds, setTargetIds] = useState(questionIds)
  const [confirm, confirmDialog] = useConfirm()

  useEffect(() => {
    setTargetIds(questionIds)
  }, [questionIds])

  function toggleTarget(id: string) {
    setTargetIds(current => (
      current.includes(id) ? current.filter(targetId => targetId !== id) : [...current, id]
    ))
  }

  async function submit() {
    if (disabled) return
    const normalizedTag = tag.replace(/\s+/g, ' ').trim()
    if (!normalizedTag || targetIds.length === 0) return
    if (operation === 'remove') {
      const accepted = await confirm({
        title: `เอาแท็ก “${normalizedTag}” ออกจากโจทย์?`,
        description: `ระบบจะตรวจโจทย์ ${targetIds.length} ข้อที่เลือก และเอาแท็กออกจากข้อที่มีแท็กดังกล่าว`,
        confirmLabel: 'เอาแท็กออก',
        variant: 'destructive',
      })
      if (!accepted) return
    }

    startTransition(async () => {
      const result = await updatePracticeQuestionTags({
        libraryId,
        questionIds: targetIds,
        operation,
        tag: normalizedTag,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(operation === 'add' ? 'เพิ่มแท็กให้โจทย์แล้ว' : 'เอาแท็กออกจากโจทย์แล้ว')
      setTag('')
      router.refresh()
    })
  }

  return (
    <>
      <Collapsible>
        <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-y border-border py-1.5">
          <div className="min-w-0">
            <p className="text-sm font-medium">จัดแท็กโจทย์ทั้งชุด</p>
            <p className="text-xs text-muted-foreground">
              {disabled
                ? disabledReason
                : 'แก้ที่โจทย์ต้นฉบับ ไม่ใช่ข้อมูลคะแนน'}
            </p>
          </div>
          <CollapsibleTrigger
            disabled={disabled}
            render={<Button type="button" size="sm" variant="outline" className="min-h-11" disabled={disabled} />}
          >
            <Tags data-icon="inline-start" />
            เปิดเครื่องมือ
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="flex flex-col gap-2 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              เลือกแล้ว {targetIds.length} จาก {questionIds.length} ข้อ
            </p>
            <div className="flex items-center gap-1">
              <Button className="min-h-11" type="button" size="xs" variant="ghost" onClick={() => setTargetIds(questionIds)}>
                เลือกทั้งหมด
              </Button>
              <Button className="min-h-11" type="button" size="xs" variant="ghost" onClick={() => setTargetIds([])}>
                ล้างที่เลือก
              </Button>
            </div>
          </div>
          <div className="grid max-h-40 overflow-y-auto rounded-lg border border-border sm:grid-cols-2">
            {questions.map(question => (
              <label
                key={question.id}
                className="flex min-h-11 cursor-pointer items-center gap-2 border-b border-border px-3 py-1 text-sm last:border-b-0 sm:odd:border-r"
              >
                <input
                  type="checkbox"
                  checked={targetIds.includes(question.id)}
                  onChange={() => toggleTarget(question.id)}
                  className="shrink-0 accent-primary"
                />
                <span className="truncate" title={question.title}>{question.title}</span>
              </label>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-[9rem_minmax(12rem,1fr)_auto] sm:items-end">
            <Field>
              <FieldLabel htmlFor="practice-tag-operation">การเปลี่ยนแปลง</FieldLabel>
              <NativeSelect
                id="practice-tag-operation"
                className="min-h-11"
                value={operation}
                onChange={event => setOperation(event.target.value as 'add' | 'remove')}
              >
                <option value="add">เพิ่มแท็ก</option>
                <option value="remove">เอาแท็กออก</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="practice-bulk-tag">แท็ก</FieldLabel>
              <Input
                id="practice-bulk-tag"
                className="min-h-11"
                value={tag}
                onChange={event => setTag(event.target.value)}
                maxLength={80}
                placeholder="เช่น ไฟฟ้า หรือ สอวน. ค่าย 1"
              />
            </Field>
            <Button
              type="button"
              variant={operation === 'remove' ? 'destructive' : 'default'}
              className="min-h-11"
              onClick={submit}
              disabled={disabled || isPending || !tag.trim() || targetIds.length === 0}
            >
              {isPending ? 'กำลังแก้...' : operation === 'add' ? 'เพิ่มแท็ก' : 'เอาแท็กออก'}
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
      {confirmDialog}
    </>
  )
}
