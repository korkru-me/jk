'use client'

import type { TrialSample } from '@/lib/math/evaluator'

// ─── SampleTable ──────────────────────────────────────────────────────────────

export function SampleTable({ title, samples, varNames, type }: {
  title: string
  samples: TrialSample[]
  varNames: string[]
  type: 'good' | 'warn' | 'bad'
}) {
  const dotColor = { good: 'bg-success', warn: 'bg-warning', bad: 'bg-destructive' }[type]
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
        <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="text-xs w-full">
          <thead>
            <tr className="bg-muted">
              {varNames.map(n => (
                <th key={n} className="px-3 py-1.5 text-left font-mono font-semibold text-muted-foreground border-b border-border">
                  {'{' + n + '}'}
                </th>
              ))}
              <th className="px-3 py-1.5 text-left font-semibold text-muted-foreground border-b border-border">คำตอบ</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((s, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/50'}>
                {varNames.map(n => (
                  <td key={n} className="px-3 py-1.5 font-mono text-muted-foreground">{s.values[n] ?? '—'}</td>
                ))}
                <td className="px-3 py-1.5 font-mono font-bold text-foreground">{s.answer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
