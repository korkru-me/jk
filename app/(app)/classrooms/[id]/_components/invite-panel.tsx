'use client'

import { useState, useRef } from 'react'
import { Link2, Hash, Upload, Copy, Check, FileText, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface Props {
  classCode: string
  classroomId: string
}

export function InvitePanel({ classCode, classroomId }: Props) {
  const [tab, setTab] = useState<'link' | 'code' | 'csv'>('code')
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const inviteLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/join-org?code=${classCode}`

  function copy(text: string, which: 'link' | 'code') {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which)
      toast.success('คัดลอกแล้ว!')
      setTimeout(() => setCopied(null), 2000)
    })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.csv')) { setCsvFile(file); toast.success(`เลือกไฟล์: ${file.name}`) }
    else toast.error('กรุณาอัปโหลดไฟล์ .csv เท่านั้น')
  }

  const TABS = [
    { key: 'code', label: 'รหัสห้องเรียน', icon: Hash },
    { key: 'link', label: 'ลิงก์เชิญ', icon: Link2 },
    { key: 'csv', label: 'นำเข้า CSV', icon: Upload },
  ] as const

  return (
    <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-gray-100">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="p-6">
        {/* Tab: Code */}
        {tab === 'code' && (
          <div className="text-center space-y-4">
            <p className="text-sm text-gray-500">แชร์รหัสนี้ให้นักเรียนกรอกในหน้าเข้าร่วม</p>
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl py-8">
              <p className="text-5xl font-mono font-black text-gray-900 tracking-[0.4em] select-all">
                {classCode}
              </p>
              <p className="text-xs text-gray-400 mt-3">กดที่รหัสเพื่อเลือก แล้วคัดลอก</p>
            </div>
            <Button
              onClick={() => copy(classCode, 'code')}
              className="w-full gap-2"
            >
              {copied === 'code' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied === 'code' ? 'คัดลอกแล้ว!' : 'คัดลอกรหัส'}
            </Button>
          </div>
        )}

        {/* Tab: Link */}
        {tab === 'link' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">นักเรียนคลิกลิงก์นี้เพื่อเข้าร่วมโดยตรง</p>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
              <Link2 className="w-4 h-4 text-gray-400 shrink-0" />
              <p className="text-sm text-gray-600 truncate flex-1 font-mono text-xs">{inviteLink}</p>
            </div>
            <Button onClick={() => copy(inviteLink, 'link')} className="w-full gap-2">
              {copied === 'link' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied === 'link' ? 'คัดลอกแล้ว!' : 'คัดลอกลิงก์'}
            </Button>
            <p className="text-xs text-gray-400 text-center">
              ลิงก์นี้ใช้ได้ถาวร สามารถแชร์ผ่าน Line, Email ได้เลย
            </p>
          </div>
        )}

        {/* Tab: CSV */}
        {tab === 'csv' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              อัปโหลดไฟล์รายชื่อนักเรียน รูปแบบ: ชื่อ, อีเมล (หัวตารางไม่บังคับ)
            </p>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-blue-400 bg-blue-50'
                  : csvFile
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) { setCsvFile(f); toast.success(`เลือกไฟล์: ${f.name}`) }
                }}
              />
              {csvFile ? (
                <div className="flex items-center justify-center gap-3">
                  <FileText className="w-8 h-8 text-emerald-500" />
                  <div className="text-left">
                    <p className="font-semibold text-emerald-700 text-sm">{csvFile.name}</p>
                    <p className="text-xs text-emerald-600">{(csvFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setCsvFile(null) }}
                    className="ml-2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className={`w-10 h-10 mx-auto mb-3 ${dragOver ? 'text-blue-500' : 'text-gray-300'}`} />
                  <p className="text-sm font-medium text-gray-600">ลากไฟล์มาวางที่นี่</p>
                  <p className="text-xs text-gray-400 mt-1">หรือคลิกเพื่อเลือกไฟล์ .csv</p>
                </>
              )}
            </div>

            {/* Sample format */}
            <div className="bg-gray-50 rounded-xl p-3 font-mono text-xs text-gray-500 space-y-0.5">
              <p className="text-gray-400 font-sans text-[10px] mb-1">ตัวอย่างรูปแบบไฟล์:</p>
              <p>ธนภัทร สุขใส,thanaphat@school.ac.th</p>
              <p>พิมพ์ชนก รักดี,pimchanok@school.ac.th</p>
            </div>

            <Button disabled={!csvFile} className="w-full" onClick={() => toast.success('ฟีเจอร์กำลังพัฒนา')}>
              นำเข้ารายชื่อ
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
