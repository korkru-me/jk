'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { chartColors, chartSeries } from '@/lib/chart-colors'
import type { Question } from '@/lib/types'

function seedRand(seed: string, index: number): number {
  const h = [...seed].reduce((a, c, j) => a + c.charCodeAt(0) * (j + 1), 0)
  return (((h * (index + 7) * 2654435761) >>> 0) % 1000) / 1000
}

const CHOICE_LABELS = ['ก.', 'ข.', 'ค.', 'ง.']
// Distractors only — the correct choice is always drawn in chartColors.success.
const COLORS = [chartColors.primary, chartColors.warning, chartColors.danger, chartSeries[3]]
const DISTRACTOR_NOTES_WRONG = [
  'ตัวลวงที่สร้างความสับสนเรื่องทิศทางของเวกเตอร์',
  'ตัวลวงหลักที่ดักความเข้าใจผิดเรื่องการหาพื้นที่ใต้กราฟ v-t',
  'ตัวลวงจากการนำสูตรไม่ถูกต้อง',
]

interface Props {
  question: Question
  qLabel: string
  assignmentId: string
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const item = payload[0]
  const note = item.payload.isCorrect
    ? 'คำตอบที่ถูกต้อง'
    : DISTRACTOR_NOTES_WRONG[item.payload.distractorIdx % DISTRACTOR_NOTES_WRONG.length]
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg text-xs max-w-[200px]">
      <p className="font-bold text-foreground mb-1">{item.name}: {item.value}%</p>
      <p className="text-muted-foreground leading-relaxed">{note}</p>
    </div>
  )
}

const CustomLegend = ({ payload }: any) => (
  <div className="flex flex-col gap-1.5 mt-2">
    {payload?.map((entry: any, i: number) => (
      <div key={i} className="flex items-center gap-2 text-xs">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: entry.color }} />
        <span className="text-muted-foreground">{entry.value}: <strong>{entry.payload.value}%</strong></span>
      </div>
    ))}
  </div>
)

export function DistractorChart({ question, qLabel, assignmentId }: Props) {
  // Determine which option is correct (index 0–3)
  const correctIdx = (() => {
    if (question.mcq_options) {
      const idx = (question.mcq_options as any[]).findIndex((o: any) => o.is_correct)
      return idx >= 0 ? idx : 2
    }
    return Math.floor(seedRand(question.id + 'correct', 0) * 4)
  })()

  // Generate realistic distractor distribution
  // Correct answer should have fewer picks when error rate is high
  const rawWeights = CHOICE_LABELS.map((_, i) => {
    const base = seedRand(question.id + assignmentId + 'dist', i)
    if (i === correctIdx) return 0.15 + base * 0.2  // 15–35%
    return 0.1 + base * 0.5  // 10–60%
  })
  const total = rawWeights.reduce((a, b) => a + b, 0)
  const pcts = rawWeights.map(w => Math.round((w / total) * 100))

  // Fix rounding to sum to 100
  const diff = 100 - pcts.reduce((a, b) => a + b, 0)
  pcts[0] += diff

  // distractorIdx counts only the wrong options (0, 1, 2...) for picking a note
  let distractorCounter = 0
  const data = CHOICE_LABELS.map((label, i) => {
    const isCorrect = i === correctIdx
    const distractorIdx = isCorrect ? -1 : distractorCounter++
    return { name: label, value: pcts[i], isCorrect, distractorIdx }
  })

  const topDistractor = data.filter(d => !d.isCorrect).sort((a, b) => b.value - a.value)[0]

  return (
    <div className="bg-card rounded-2xl ring-1 ring-border p-5 h-full">
      <p className="text-sm font-semibold text-foreground mb-0.5">Distractor Analysis</p>
      <p className="text-xs text-muted-foreground mb-1">{qLabel} — สัดส่วนการเลือกตอบ</p>

      {/* Correct answer badge */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-xs text-muted-foreground">เฉลย:</span>
        <span className="text-xs font-bold bg-success/10 text-success px-2 py-0.5 rounded-full">
          {CHOICE_LABELS[correctIdx]}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={75}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.isCorrect ? chartColors.success : COLORS[i % COLORS.length]}
                stroke={entry.isCorrect ? chartColors.success : 'transparent'}
                strokeWidth={entry.isCorrect ? 2 : 0}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Insight note */}
      {topDistractor && (
        <div className="mt-3 p-3 bg-warning/10 rounded-xl">
          <p className="text-xs text-warning leading-relaxed">
            <span className="font-bold">{topDistractor.name}</span> ถูกเลือก{' '}
            <span className="font-bold">{topDistractor.value}%</span>{' '}
            — {DISTRACTOR_NOTES_WRONG[topDistractor.distractorIdx % DISTRACTOR_NOTES_WRONG.length]}
          </p>
        </div>
      )}
    </div>
  )
}
