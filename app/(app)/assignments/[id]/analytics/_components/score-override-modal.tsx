'use client'

import { useState } from 'react'
import { X, Pencil, History, Save, AlertCircle } from 'lucide-react'
import type { ScoreOverride } from './analytics-client'

interface Props {
  submissionId: string
  studentName: string
  currentScore: number
  maxScore: number
  overrides: ScoreOverride[]
  teacherName: string
  onSave: (entry: ScoreOverride) => void
  onClose: () => void
}

type ModalTab = 'edit' | 'history'

export function ScoreOverrideModal({
  submissionId,
  studentName,
  currentScore,
  maxScore,
  overrides,
  teacherName,
  onSave,
  onClose,
}: Props) {
  const [tab, setTab] = useState<ModalTab>('edit')
  const [newScore, setNewScore] = useState<string>(String(currentScore))
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const studentOverrides = overrides.filter(o => o.submissionId === submissionId)

  function handleSave() {
    const parsed = Number(newScore)
    if (isNaN(parsed) || parsed < 0) {
      setError('กรุณากรอกคะแนนที่ถูกต้อง (ตัวเลขบวก)')
      return
    }
    if (parsed > maxScore) {
      setError(`คะแนนต้องไม่เกิน ${maxScore}`)
      return
    }
    if (!reason.trim()) {
      setError('กรุณากรอกเหตุผลในการแก้ไข')
      return
    }

    onSave({
      submissionId,
      fromScore: currentScore,
      newScore: parsed,
      reason: reason.trim(),
      by: teacherName,
      at: new Date().toISOString(),
    })

    setSaved(true)
    setError('')
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 1200)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-bold text-gray-900">แก้ไขคะแนน</p>
            <p className="text-xs text-gray-400 mt-0.5">{studentName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors text-gray-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {([
            { key: 'edit' as ModalTab, label: 'แก้ไขคะแนน', icon: Pencil },
            { key: 'history' as ModalTab, label: `ประวัติการแก้ไข (${studentOverrides.length})`, icon: History },
          ]).map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Edit tab */}
        {tab === 'edit' && (
          <div className="p-5 space-y-4">
            {/* Current score display */}
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-0.5">คะแนนปัจจุบัน</p>
                <p className="text-2xl font-black text-gray-900 tabular-nums">{currentScore}</p>
                <p className="text-xs text-gray-400">/{maxScore}</p>
              </div>
              <div className="text-gray-300 text-xl">→</div>
              <div className="text-center flex-1">
                <p className="text-xs text-gray-400 mb-0.5">คะแนนใหม่</p>
                <input
                  type="number"
                  min={0}
                  max={maxScore}
                  value={newScore}
                  onChange={e => { setNewScore(e.target.value); setError('') }}
                  className="w-24 text-2xl font-black text-blue-600 tabular-nums text-center bg-white border-2 border-blue-200 rounded-xl px-2 py-1 focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-400">/{maxScore}</p>
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                เหตุผลในการแก้ไข <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={e => { setReason(e.target.value); setError('') }}
                placeholder="เช่น นักเรียนแสดงวิธีทำถูกต้องแต่ระบบตรวจคะแนนผิดพลาด..."
                rows={3}
                className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-gray-400 resize-none placeholder:text-gray-300"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={saved}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-xl transition-all ${
                  saved
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}
              >
                <Save className="w-4 h-4" />
                {saved ? 'บันทึกแล้ว ✓' : 'บันทึกการแก้ไข'}
              </button>
            </div>
          </div>
        )}

        {/* History tab */}
        {tab === 'history' && (
          <div className="p-5">
            {studentOverrides.length === 0 ? (
              <div className="text-center py-8">
                <History className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">ยังไม่มีประวัติการแก้ไข</p>
              </div>
            ) : (
              <div className="space-y-0 overflow-hidden rounded-xl border border-gray-100">
                <div className="grid grid-cols-[1fr_auto_auto_1fr] text-[10px] font-medium text-gray-400 uppercase tracking-wide px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <span>ผู้แก้ไข</span>
                  <span className="text-right pr-3">ก่อน</span>
                  <span className="text-right pr-3">หลัง</span>
                  <span className="text-right">วันเวลา</span>
                </div>
                {[...studentOverrides].reverse().map((entry, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_auto_1fr] items-start px-4 py-3 border-b border-gray-50 last:border-0 text-xs gap-1">
                    <div>
                      <p className="font-medium text-gray-900">{entry.by}</p>
                      <p className="text-gray-400 text-[10px] mt-0.5 leading-relaxed">{entry.reason}</p>
                    </div>
                    <span className="font-mono text-gray-400 pr-3 pt-0.5">{entry.fromScore}</span>
                    <span className="font-mono font-bold text-blue-600 pr-3 pt-0.5">{entry.newScore}</span>
                    <p className="text-right text-gray-400 text-[10px] pt-0.5">
                      {new Date(entry.at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
