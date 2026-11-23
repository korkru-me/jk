'use client'

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ExerciseGroupContext, ExerciseGroupSelection } from '@/lib/exercise-group'

export function ExerciseGroupPicker({ context, value, onChange }: {
  context: ExerciseGroupContext
  value: ExerciseGroupSelection
  onChange: (value: ExerciseGroupSelection) => void
}) {
  const [search, setSearch] = useState('')
  const room = context.rooms.find(item => item.id === value.classroomId)
  return <section aria-label="สมาชิกกลุ่ม" className="flex min-w-0 flex-col gap-2 text-left">
    <Field className="gap-1">
      <FieldLabel>สมาชิกกลุ่ม ({value.peers.length + 1} / {context.max} คน)</FieldLabel>
      <FieldDescription>รวมคุณเป็นสมาชิกแล้ว เลือกเพื่อนอีก {context.min - 1}–{context.max - 1} คน ทุกคนได้คะแนนจากคำตอบชุดนี้เท่ากัน</FieldDescription>
    </Field>
    {context.rooms.length > 1 && <Select value={value.classroomId} onValueChange={id => {
      if (id) onChange({ classroomId: id, peers: [] })
    }}>
      <SelectTrigger aria-label="ห้องเรียนของกลุ่ม"><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>{context.rooms.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>}
    <Input aria-label="ค้นหาชื่อเพื่อนในห้อง" placeholder="ค้นหาชื่อเพื่อนในห้อง" value={search} onChange={event => setSearch(event.target.value)} />
    <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
      {room?.students.filter(student => student.name.includes(search)).map(student => {
        const checked = value.peers.includes(student.id)
        return <label key={student.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 hover:bg-muted">
          <Checkbox checked={checked} disabled={!checked && value.peers.length + 1 >= context.max} onCheckedChange={next => {
            onChange({ ...value, peers: next ? [...value.peers, student.id] : value.peers.filter(id => id !== student.id) })
          }} />
          <span className="min-w-0 break-words text-sm">{student.name}</span>
        </label>
      })}
    </div>
    {!room?.students.length && <p className="text-sm text-muted-foreground">ยังไม่มีเพื่อนที่ได้รับมอบหมายในห้องนี้</p>}
    {value.peers.length > 0 && <p className="text-xs text-muted-foreground">เลือกแล้ว {room?.students.filter(student => value.peers.includes(student.id)).map(student => student.name).join(', ')}</p>}
  </section>
}
