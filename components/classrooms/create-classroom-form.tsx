'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createClassroom } from '@/lib/actions/classrooms'

export function CreateClassroomForm() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('กรอกชื่อห้องเรียน'); return }
    startTransition(async () => {
      const res = await createClassroom({ name: name.trim(), description: description.trim() })
      if (res?.error) toast.error(res.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      <div className="space-y-1.5">
        <Label htmlFor="name">ชื่อห้องเรียน *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น ฟิสิกส์ ม.5/1"
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">คำอธิบาย (ไม่บังคับ)</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="รายละเอียดเพิ่มเติมเกี่ยวกับห้องเรียนนี้..."
          rows={3}
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? 'กำลังสร้าง...' : 'สร้างห้องเรียน'}
      </Button>
    </form>
  )
}
