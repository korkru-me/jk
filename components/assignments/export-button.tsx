'use client'

interface Submission {
  users?: { full_name?: string; email?: string }
  total_score: number
  max_score: number
}

export function ExportButton({ submissions, title }: { submissions: Submission[]; title: string }) {
  return (
    <button
      onClick={() => {
        const rows: (string | number)[][] = [
          ['ชื่อ', 'อีเมล', 'คะแนน', 'คะแนนเต็ม', '%'],
          ...submissions.map((s) => [
            s.users?.full_name ?? '',
            s.users?.email ?? '',
            s.total_score ?? 0,
            s.max_score ?? 0,
            s.max_score > 0 ? Math.round((s.total_score / s.max_score) * 100) : 0,
          ]),
        ]
        const csv = rows.map(r => r.join(',')).join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${title}.csv`
        a.click()
        URL.revokeObjectURL(url)
      }}
      className="text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
    >
      ⬇️ Export CSV
    </button>
  )
}
