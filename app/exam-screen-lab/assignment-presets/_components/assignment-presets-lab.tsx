'use client'

import { useMemo, useRef, useState, type ComponentProps } from 'react'
import {
  CreateAssignmentForm, type AssignmentCopyPreset, type AssignmentQuestionOption,
} from '@/components/assignments/create-assignment-form'
import type { AssignmentPresetActions } from '@/components/assignments/assignment-setting-presets'
import {
  assignmentPresetDefaults, assignmentPresetSettingsSchema,
  type AssignmentPresetBootstrap, type AssignmentSettingPreset,
} from '@/lib/assignment-setting-presets'
import type { AssignmentType } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { NativeSelect } from '@/components/ui/native-select'

const ROOM = '00000000-0000-4000-8000-000000000001'
const questions: AssignmentQuestionOption[] = Array.from({ length: 6 }, (_, i) => ({
  id: `00000000-0000-4000-8100-${String(i + 1).padStart(12, '0')}`,
  title: `โจทย์จำลองข้อ ${i + 1}`, question_text: `<p>คำถามจำลองข้อ ${i + 1}</p>`,
  question_type: 'mcq', difficulty: 'easy', tags: [], sub_question_count: 1,
  default_points: 1, has_random_values: false,
}))

function initialData(): Record<AssignmentType, AssignmentPresetBootstrap> {
  const exercise: AssignmentSettingPreset = {
    id: '00000000-0000-4000-8500-000000000001', assignment_type: 'exercise',
    slot: 1, name: 'ฝึกสุ่มห้าข้อ', revision: 1, updated_at: new Date().toISOString(),
    settings: { ...assignmentPresetDefaults('exercise'), duration_minutes: 15, random_question_count: 5 },
  }
  const exam: AssignmentSettingPreset = {
    id: '00000000-0000-4000-8500-000000000002', assignment_type: 'exam',
    slot: 1, name: 'สอบครึ่งชั่วโมง', revision: 1, updated_at: new Date().toISOString(),
    settings: { ...assignmentPresetDefaults('exam'), duration_minutes: 30, questions_per_page: 3 },
  }
  return {
    exercise: { presets: [exercise], defaultPresetId: exercise.id, error: null },
    exam: { presets: [exam], defaultPresetId: exam.id, error: null },
  }
}

function copiedAssignment(type: AssignmentType): AssignmentCopyPreset {
  return {
    ...assignmentPresetDefaults(type), id: '00000000-0000-4000-8600-000000000001',
    title: 'งานต้นฉบับจำลอง', description: 'คำอธิบายจำลองที่ชุดการตั้งค่าห้ามทับ',
    question_ids: questions.map(question => question.id), question_points: { [questions[0].id]: 7 },
    display_max_score: 20, sections: [], show_sections: true,
    start_at: '2026-10-08T02:00:00.000Z', due_at: null, late_bands: [], end_at: '2026-10-10T09:00:00.000Z',
    duration_minutes: 7, type, shared_random_seed: null, random_question_count: null,
    streak_target: null, streak_question_cap: null, access_code: 'LAB-ONLY',
  }
}

/** Local memory-only integration harness. No Supabase or production mutations. */
export function AssignmentPresetsLab() {
  const store = useRef(initialData())
  const nextId = useRef(10)
  const failNext = useRef(false)
  const [type, setType] = useState<AssignmentType>('exercise')
  const [copy, setCopy] = useState(false)
  const [generation, setGeneration] = useState(0)
  const [bootstrapError, setBootstrapError] = useState(false)
  const [captured, setCaptured] = useState('')
  const [storeSummary, setStoreSummary] = useState('')

  const presetActions = useMemo<AssignmentPresetActions>(() => {
    function result(currentType: AssignmentType) {
      setStoreSummary((['exercise', 'exam'] as const).map(kind => `${kind}: ${store.current[kind].presets.map(item => `${item.name} (r${item.revision})`).join(', ')} · default=${store.current[kind].defaultPresetId ?? 'system'}`).join('\n'))
      return { data: structuredClone(store.current[currentType]) }
    }
    async function fail() {
      await new Promise(resolve => setTimeout(resolve, 100))
      if (!failNext.current) return false
      failNext.current = false
      return true
    }
    return {
      async load(kind) {
        if (await fail()) return { error: '(จำลอง) โหลดรายการไม่สำเร็จ ค่าของงานยังอยู่' }
        return result(kind)
      },
      async save(input) {
        if (await fail()) return { error: '(จำลอง) การเชื่อมต่อขัดข้อง กรุณาโหลดรายการก่อนลองซ้ำ' }
        const data = store.current[input.type]
        if (!assignmentPresetSettingsSchema.safeParse(input.settings).success) return { error: '(จำลอง) การตั้งค่าไม่ถูกต้อง' }
        if (data.presets.some(item => item.id !== input.id && item.name.toLocaleLowerCase() === input.name.trim().toLocaleLowerCase())) return { error: '(จำลอง) ชื่อชุดซ้ำ' }
        if (input.id) {
          const item = data.presets.find(preset => preset.id === input.id)
          if (!item || item.revision !== input.expectedRevision) return { error: '(จำลอง) ข้อมูลถูกแก้ไขจากหน้าต่างอื่น กรุณาโหลดใหม่' }
          Object.assign(item, { name: input.name.trim(), settings: structuredClone(input.settings), revision: item.revision + 1, updated_at: new Date().toISOString() })
        } else {
          if (data.presets.length >= 3) return { error: '(จำลอง) ครบสามชุดแล้ว' }
          const slot = [1, 2, 3].find(candidate => !data.presets.some(preset => preset.slot === candidate))!
          data.presets.push({ id: `00000000-0000-4000-8500-${String(nextId.current++).padStart(12, '0')}`,
            assignment_type: input.type, slot, name: input.name.trim(), settings: structuredClone(input.settings),
            revision: 1, updated_at: new Date().toISOString() })
          data.presets.sort((a, b) => a.slot - b.slot)
        }
        return result(input.type)
      },
      async rename(input) {
        if (await fail()) return { error: '(จำลอง) เปลี่ยนชื่อไม่สำเร็จ' }
        const data = store.current[input.type]
        const item = data.presets.find(preset => preset.id === input.id)
        if (!item || item.revision !== input.expectedRevision) return { error: '(จำลอง) ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่' }
        if (data.presets.some(preset => preset.id !== item.id && preset.name.toLocaleLowerCase() === input.name.toLocaleLowerCase())) return { error: '(จำลอง) ชื่อชุดซ้ำ' }
        Object.assign(item, { name: input.name.trim(), revision: item.revision + 1, updated_at: new Date().toISOString() })
        return result(input.type)
      },
      async delete(input) {
        if (await fail()) return { error: '(จำลอง) ลบชุดไม่สำเร็จ' }
        const data = store.current[input.type]
        const item = data.presets.find(preset => preset.id === input.id)
        if (!item || item.revision !== input.expectedRevision) return { error: '(จำลอง) ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่' }
        data.presets = data.presets.filter(preset => preset.id !== input.id)
        if (data.defaultPresetId === input.id) data.defaultPresetId = null
        return result(input.type)
      },
      async setDefault(input) {
        if (await fail()) return { error: '(จำลอง) ตั้งค่าเริ่มต้นไม่สำเร็จ' }
        const data = store.current[input.type]
        if (input.id && !data.presets.some(preset => preset.id === input.id && preset.revision === input.expectedRevision)) return { error: '(จำลอง) ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่' }
        data.defaultPresetId = input.id
        return result(input.type)
      },
    }
  }, [])

  const assignmentActions = useMemo<NonNullable<ComponentProps<typeof CreateAssignmentForm>['actions']>>(() => ({
    async createQuestionSet() { return { error: '(จำลอง) ไม่บันทึกแฟ้มในฐานข้อมูล' } },
    async createAssignment(input) {
      setCaptured(JSON.stringify(input, null, 2))
      return { error: '(จำลอง) รับข้อมูลแล้ว ไม่มีการมอบหมายหรือบันทึกฐานข้อมูล' }
    },
    async getQuestionPreviewDetails(ids) {
      return { data: questions.filter(question => ids.includes(question.id)).map(question => ({
        id: question.id, title: question.title, question_text: question.question_text,
        question_type: question.question_type, is_random: false, variables: [],
        answer_parts: [], image_urls: [], extra_data: {},
        mcq_options: [{ text: 'ก', is_correct: true }, { text: 'ข', is_correct: false }],
      })) }
    },
  }), [])

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <Card padding="md" className="flex flex-col gap-3">
        <h1 className="font-semibold">ห้องทดลองชุดการตั้งค่า · ข้อมูลจำลองในหน่วยความจำเท่านั้น</h1>
        <p className="text-sm text-muted-foreground">ไม่มีการเรียกฐานข้อมูล บันทึกหรือมอบหมายงานจริง การรีโหลดแท็บล้างข้อมูลจำลอง</p>
        <FieldGroup>
          <Field><FieldLabel htmlFor="lab-preset-type">ประเภทที่ทดลอง</FieldLabel>
            <NativeSelect id="lab-preset-type" value={type} onChange={event => { setType(event.target.value as AssignmentType); setGeneration(value => value + 1) }}>
              <option value="exercise">แบบฝึกหัด</option><option value="exam">ข้อสอบ</option>
            </NativeSelect>
          </Field>
        </FieldGroup>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setGeneration(value => value + 1)}>เริ่มงานใหม่จากค่าเริ่มต้นที่บันทึก</Button>
          <Button type="button" variant="outline" onClick={() => { setCopy(value => !value); setGeneration(value => value + 1) }}>{copy ? 'กลับไปสร้างงานใหม่' : 'ลองทำสำเนางาน'}</Button>
          <Button type="button" variant="outline" onClick={() => { setBootstrapError(value => !value); setGeneration(value => value + 1) }}>สลับโหลดเริ่มต้นล้มเหลว</Button>
          <Button type="button" variant="outline" onClick={() => { failNext.current = true }}>จำลองคำสั่งถัดไปล้มเหลว</Button>
        </div>
      </Card>
      <CreateAssignmentForm key={`${type}-${copy}-${generation}`}
        classrooms={[{ id: ROOM, name: 'ห้องจำลอง', description: null }]} questions={questions}
        preselectedAssignmentType={type} preselectedClassroomId={ROOM}
        preselectedSet={{ id: '00000000-0000-4000-8400-000000000001', title: 'แฟ้มจำลองหกข้อ', description: 'คำอธิบายที่ชุดการตั้งค่าห้ามทับ', question_ids: questions.map(question => question.id), sections: [] }}
        copySource={copy ? copiedAssignment(type) : undefined}
        presetBootstrap={bootstrapError ? { presets: [], defaultPresetId: null, error: '(จำลอง) โหลดชุดเริ่มต้นไม่สำเร็จ' } : structuredClone(store.current[type])}
        presetActions={presetActions} actions={assignmentActions}
      />
      <Card padding="md" className="flex flex-col gap-2">
        <h2 className="font-semibold">ผลที่รับในหน่วยความจำ · จำลอง</h2>
        <output aria-label="ชุดการตั้งค่าจำลองที่บันทึก" className="whitespace-pre-wrap break-all text-sm">{storeSummary}</output>
        <output aria-label="งานจำลองที่รับ" className="whitespace-pre-wrap break-all text-sm">{captured}</output>
      </Card>
    </main>
  )
}
