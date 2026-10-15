'use client'

import { useEffect, useState } from 'react'
import { CreateQuestionSetForm } from '@/components/assignments/create-question-set-form'
import { QuestionSetCard } from '@/components/questions/question-set-card'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { composeQuestionSetDescription, isQuestionSetTheme, questionSetTheme, randomQuestionSetTheme } from '@/lib/question-set-theme'
import type { QuestionSet } from '@/lib/types'
import type { QuestionSetData } from '@/lib/actions/question-sets'

const STORAGE_KEY = 'korkru:question-set-theme-lab:v1'
const INITIAL: QuestionSet = {
  id: '00000000-0000-4000-8000-000000000071', org_id: 'lab-org', created_by: 'lab-owner',
  title: 'การเคลื่อนที่แบบหมุน', description: 'รวบรวมโจทย์เรื่องการหมุนและโมเมนต์ของแรง',
  visibility: 'private', tags: [], question_ids: [],
  sections: [{ id: 'lab-section', title: 'คาน', question_ids: [] }],
  created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:00:00Z',
}

/** All writes are synthetic and confined to browser storage. */
export function QuestionSetThemesLab() {
  const [saved, setSaved] = useState(INITIAL)
  const [snapshot, setSnapshot] = useState(INITIAL)
  const [revision, setRevision] = useState(0)
  const [creating, setCreating] = useState(false)
  const [savedCount, setSavedCount] = useState(0)

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const stored: unknown = JSON.parse(raw)
      if (typeof stored !== 'object' || !stored || !('description' in stored) || !('title' in stored)) return
      if (typeof stored.title !== 'string' || typeof stored.description !== 'string') return
      const next = { ...INITIAL, title: stored.title, description: stored.description }
      setSaved(next); setSnapshot(next); setRevision(value => value + 1)
    } catch { localStorage.removeItem(STORAGE_KEY) }
  }, [])

  function commit(data: QuestionSetData) {
    const theme = isQuestionSetTheme(data.theme) ? data.theme : randomQuestionSetTheme()
    const next: QuestionSet = {
      ...INITIAL, ...data, org_id: data.org_id ?? INITIAL.org_id, sections: data.sections ?? [],
      description: composeQuestionSetDescription(data.description, theme),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ title: next.title, description: next.description }))
    setSaved(next); setSavedCount(value => value + 1)
    return next
  }

  return (
    <main className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
      <Card padding="sm" radius="sm" className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-semibold">ตัวอย่างธีมสีแฟ้มโจทย์ · ข้อมูลจำลอง</h1>
          <p className="text-xs text-muted-foreground">ทดสอบสร้าง/แก้ไขและเปิดซ้ำได้ ข้อมูลตัวอย่างเก็บในเบราว์เซอร์นี้เท่านั้น</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => { setCreating(true); setRevision(value => value + 1) }}>ทดลองสร้างแฟ้ม</Button>
          <Button size="sm" variant="outline" onClick={() => { setCreating(false); setSnapshot(saved); setRevision(value => value + 1) }}>เปิดแฟ้มที่บันทึก</Button>
          <span className="text-xs text-muted-foreground" data-theme-save-count>{savedCount} ครั้ง · {questionSetTheme(saved.id, saved.description)}</span>
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-3">
        {[saved, { ...INITIAL, id: 'legacy-physics', title: 'โมเมนตัมและการชน', description: null }, { ...INITIAL, id: 'legacy-energy', title: 'งานและพลังงาน', description: composeQuestionSetDescription('', 'mint') }].map(set => (
          <QuestionSetCard key={set.id} set={{ ...set, valid_question_count: 30 }} currentUserId="lab-reader" />
        ))}
      </div>
      <CreateQuestionSetForm
        key={revision}
        questions={[]}
        initialSet={creating ? undefined : snapshot}
        teamOptions={[]}
        saveExistingSet={async (_id, data) => { commit(data); return { ok: true } }}
        createSet={async data => {
          const next = commit(data)
          setCreating(false); setSnapshot(next); setRevision(value => value + 1)
          return { id: next.id }
        }}
        onCreated={() => {}}
        deleteExistingSet={async () => ({ error: 'ตัวอย่างสำหรับตรวจสี ไม่ลบแฟ้มจริง' })}
      />
    </main>
  )
}
