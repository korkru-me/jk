'use client'

import { X, RotateCcw, Clock, Trash2 } from 'lucide-react'
import type { DraftRevision } from '@/hooks/use-auto-draft'

interface Props<T> {
  revisions: DraftRevision<T>[]
  onRestore: (id: string) => void
  onClear: () => void
  onClose: () => void
}

export function RevisionHistoryModal<T>({
  revisions,
  onRestore,
  onClear,
  onClose,
}: Props<T>) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" />
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">ประวัติการบันทึก</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
          {revisions.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">ยังไม่มีประวัติ — บันทึกอัตโนมัติทุก 3 วินาที</p>
            </div>
          ) : (
            revisions.map((rev, idx) => (
              <div
                key={rev.id}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 group"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                      {revisions.length - idx}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{rev.label}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {new Date(rev.savedAt).toLocaleString('th-TH', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => { onRestore(rev.id); onClose() }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 font-medium transition-colors shrink-0 ml-3 opacity-0 group-hover:opacity-100"
                >
                  <RotateCcw className="w-3 h-3" />
                  กู้คืน
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {revisions.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 shrink-0">
            <button
              type="button"
              onClick={() => { onClear(); onClose() }}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              ล้างประวัติทั้งหมด ({revisions.length} รายการ)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
