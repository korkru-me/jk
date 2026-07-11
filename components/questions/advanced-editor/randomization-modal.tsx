'use client'

import { useState } from 'react'
import { X, RefreshCw, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { runTrials } from '@/lib/math/evaluator'
import type { Variable, LogicRule, PythagoreanGroup } from '@/lib/types'

interface Props {
  variables: Variable[]
  logicRules: LogicRule[]
  formula: string
  answerStep: number
  pythagoreanGroups: PythagoreanGroup[]
  onClose: () => void
}

const SAMPLE_COUNT = 10

export function RandomizationModal({
  variables,
  logicRules,
  formula,
  answerStep,
  pythagoreanGroups,
  onClose,
}: Props) {
  const [trials, setTrials] = useState(() =>
    runTrials(variables, logicRules, formula, {
      answerStep,
      pythagoreanGroups,
      trialCount: 200,
    })
  )

  function refresh() {
    setTrials(
      runTrials(variables, logicRules, formula, {
        answerStep,
        pythagoreanGroups,
        trialCount: 200,
      })
    )
  }

  const varNames = variables
    .filter(v => v.type !== 'reference' && !v.is_answer)
    .map(v => v.name)

  const allSamples = [
    ...trials.niceSamples,
    ...trials.warningSamples,
    ...trials.badSamples,
  ].slice(0, SAMPLE_COUNT)

  const niceRatio = trials.total > 0 ? Math.round((trials.niceCount / trials.total) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">ทดสอบสถิติการสุ่ม</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              จำลอง {trials.total} รอบ — แสดง {SAMPLE_COUNT} ตัวอย่างตัวแทน
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={refresh}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              สุ่มใหม่
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats summary */}
        <div className="px-6 py-4 grid grid-cols-3 gap-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <StatCard
            icon={<CheckCircle className="w-5 h-5 text-emerald-500" />}
            label="คำตอบลงตัว"
            value={`${trials.niceCount} / ${trials.total}`}
            sub={`${niceRatio}%`}
            color="emerald"
          />
          <StatCard
            icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
            label="ลงตัว แต่กลางทางซับซ้อน"
            value={`${trials.messyCount}`}
            sub="มีเลขทศนิยมระหว่างคำนวณ"
            color="amber"
          />
          <StatCard
            icon={<XCircle className="w-5 h-5 text-red-500" />}
            label="คำตอบไม่ลงตัว"
            value={`${trials.total - trials.niceCount}`}
            sub={`${100 - niceRatio}%`}
            color="red"
          />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {allSamples.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">ไม่มีตัวอย่างให้แสดง — ตรวจสอบสูตรและตัวแปร</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 w-8">#</th>
                  {varNames.map(name => (
                    <th key={name} className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 font-mono">
                      {'{' + name + '}'}
                    </th>
                  ))}
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400">คำตอบ</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {allSamples.map((sample, idx) => (
                  <tr
                    key={idx}
                    className={
                      !sample.isNice
                        ? 'bg-red-50 dark:bg-red-950/20'
                        : sample.hasMessy
                        ? 'bg-amber-50 dark:bg-amber-950/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }
                  >
                    <td className="py-2 px-3 text-gray-400 text-xs">{idx + 1}</td>
                    {varNames.map(name => (
                      <td key={name} className="py-2 px-3 font-mono text-gray-800 dark:text-gray-200">
                        {sample.values[name] !== undefined
                          ? String(sample.values[name])
                          : '—'}
                      </td>
                    ))}
                    <td className="py-2 px-3 font-mono font-bold text-gray-900 dark:text-gray-100">
                      {typeof sample.answer === 'number'
                        ? parseFloat(sample.answer.toPrecision(6)).toString()
                        : sample.answer}
                    </td>
                    <td className="py-2 px-3">
                      {!sample.isNice ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium">
                          <XCircle className="w-3.5 h-3.5" />
                          ไม่ลงตัว
                        </span>
                      ) : sample.hasMessy ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          กลางทางซับซ้อน
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle className="w-3.5 h-3.5" />
                          ลงตัว
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl shrink-0">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            ✓ ลงตัว = คำตอบหารด้วยขนาดก้าวที่ตั้งไว้ลงตัว | ⚠ กลางทางซับซ้อน = ระหว่างคำนวณมีทศนิยมเกิน 2 ตำแหน่ง | ✗ ไม่ลงตัว = คำตอบไม่ลงตัวตามเงื่อนไข
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  color: 'emerald' | 'amber' | 'red'
}) {
  const bg = color === 'emerald' ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
    : color === 'amber' ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
    : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'

  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</span></div>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}
