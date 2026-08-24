'use client'

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clipboard,
  Clock3,
  Download,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { chartColors, chartTooltipStyle } from '@/lib/chart-colors'
import type { CriterionAnalysis, PairedAnalysis, StatisticalTestResult } from '@/lib/education-research-statistics'
import { cn } from '@/lib/utils'
import { HelpBubble } from './research-help-bubble'

interface SharedPanelProps {
  maxScore: number | null
  significanceLevel: number
  latestScoreUpdatedAt: string | null
}

export function PairedAnalysisPanel({
  analysis,
  excludedCount,
  maxScore,
  significanceLevel,
  latestScoreUpdatedAt,
}: SharedPanelProps & {
  analysis: PairedAnalysis
  excludedCount: number
}) {
  const reportText = pairedReportText(analysis, significanceLevel)
  const chartData = [
    { name: 'ก่อนเรียน', mean: analysis.pretest.mean ?? 0, sd: analysis.pretest.sampleSd ?? 0, fill: chartColors.primary },
    { name: 'หลังเรียน', mean: analysis.posttest.mean ?? 0, sd: analysis.posttest.sampleSd ?? 0, fill: chartColors.success },
  ]

  return (
    <div className="space-y-4">
      <AnalysisReadyBanner
        ready={analysis.test.status === 'calculated'}
        title={analysis.test.status === 'calculated' ? `วิเคราะห์จากคู่คะแนนสมบูรณ์ ${analysis.pretest.n} คู่` : `มีคู่คะแนนสมบูรณ์ ${analysis.pretest.n} คู่`}
        description={excludedCount > 0
          ? `นักเรียน ${excludedCount} คนที่คะแนนไม่ครบคู่ไม่ถูกรวมในการคำนวณ`
          : 'นักเรียนทุกคนที่มีทั้งคะแนนก่อนและหลังเรียนถูกรวมในการคำนวณ'}
        helpTitle="คู่คะแนนสมบูรณ์คืออะไร"
        helpText="นักเรียนคนเดียวกันต้องมีทั้งคะแนนก่อนเรียนและหลังเรียน จึงจะใช้ในการเปรียบเทียบแบบจับคู่ได้ ช่องว่างจะไม่ถูกแทนด้วย 0"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="ก่อนเรียน" value={formatNumber(analysis.pretest.mean)} detail={`S.D. ${formatNumber(analysis.pretest.sampleSd)}`} icon={Clock3} tone="primary" />
        <MetricCard label="หลังเรียน" value={formatNumber(analysis.posttest.mean)} detail={`S.D. ${formatNumber(analysis.posttest.sampleSd)}`} icon={CheckCircle2} tone="success" />
        <MetricCard label="ผลต่างเฉลี่ย" value={formatSigned(analysis.meanDifference)} detail="หลังเรียน − ก่อนเรียน" icon={TrendingUp} tone="accent" />
        <MetricCard label="ขนาดอิทธิพล" value={analysis.test.status === 'calculated' ? `dz = ${formatNumber(analysis.test.effectSize)}` : 'ยังคำนวณไม่ได้'} detail="Cohen’s dz" icon={Target} tone="teal" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <StatisticsCard
          title="ผลสัมฤทธิ์ก่อนและหลังเรียน"
          rows={[
            { label: 'ก่อนเรียน', n: analysis.pretest.n, mean: analysis.pretest.mean, sd: analysis.pretest.sampleSd },
            { label: 'หลังเรียน', n: analysis.posttest.n, mean: analysis.posttest.mean, sd: analysis.posttest.sampleSd },
          ]}
          testLabel="Paired-samples t-test (สองด้าน)"
          test={analysis.test}
          effectLabel="Cohen’s dz"
          significanceLevel={significanceLevel}
        />
        <ScoreChart
          title="เปรียบเทียบคะแนนเฉลี่ย"
          data={chartData}
          hasData={analysis.pretest.n > 0}
          maxScore={maxScore}
          bars={[
            { dataKey: 'mean', fill: chartColors.primary },
          ]}
        />
      </div>

      {analysis.test.status === 'calculated' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <ReportSummary
            text={reportText}
            conclusion={pairedConclusion(analysis.test, significanceLevel)}
            download={{
              fileName: 'korkru-research-paired-statistics.csv',
              rows: [
                ['ช่วงการวัด', 'n', 'ค่าเฉลี่ย', 'S.D.'],
                ['ก่อนเรียน', String(analysis.pretest.n), formatNumber(analysis.pretest.mean), formatNumber(analysis.pretest.sampleSd)],
                ['หลังเรียน', String(analysis.posttest.n), formatNumber(analysis.posttest.mean), formatNumber(analysis.posttest.sampleSd)],
                [],
                ['การทดสอบ', 'ผลต่างเฉลี่ย', `${Math.round(analysis.test.confidenceLevel * 100)}% CI`, `t(${analysis.test.df})`, 'p', "Cohen's dz"],
                ['Paired-samples t-test (สองด้าน)', formatNumber(analysis.test.meanDifference), `[${formatNumber(analysis.test.confidenceInterval[0])}, ${formatNumber(analysis.test.confidenceInterval[1])}]`, formatNumber(analysis.test.t), formatPValue(analysis.test.p), formatNumber(analysis.test.effectSize)],
              ],
            }}
          />
          <CautionCard title="ข้อควรระวังในการแปลผล">
            งานแบบกลุ่มเดียววัดก่อน–หลังบอกได้ว่าคะแนนเปลี่ยนแปลงหลังเรียน แต่ยังตัดคำอธิบายอื่นหรือยืนยันไม่ได้ว่าแผนการสอนเป็นสาเหตุเพียงอย่างเดียว การทดสอบนี้อาศัยการกระจายของคะแนนผลต่าง
          </CautionCard>
        </div>
      ) : (
        <UnavailableCard message={analysis.test.message} />
      )}

      <UpdatedAt value={latestScoreUpdatedAt} />
    </div>
  )
}

export function CriterionAnalysisPanel({
  analysis,
  participantCount,
  pairedCount,
  passedCount,
  thresholdPercent,
  maxScore,
  significanceLevel,
  latestScoreUpdatedAt,
}: SharedPanelProps & {
  analysis: CriterionAnalysis
  participantCount: number
  pairedCount: number
  passedCount: number
  thresholdPercent: number
}) {
  const reportText = criterionReportText(analysis, significanceLevel, passedCount)
  const usedCount = analysis.posttest.n
  const passPercent = usedCount > 0 ? (passedCount / usedCount) * 100 : null
  const criterionAvailable = maxScore !== null && analysis.criterionScore > 0
  const chartData = [{
    name: 'หลังเรียน',
    mean: analysis.posttest.mean ?? 0,
    sd: analysis.posttest.sampleSd ?? 0,
    fill: chartColors.success,
  }]

  return (
    <div className="space-y-4">
      <AnalysisReadyBanner
        ready={analysis.test.status === 'calculated'}
        title={analysis.test.status === 'calculated' ? `วิเคราะห์จากคะแนนหลังเรียน ${usedCount} คน` : `มีคะแนนหลังเรียน ${usedCount} คน`}
        description={usedCount !== pairedCount
          ? `ใช้ทุกคนที่มีคะแนนหลังเรียน จึงมี n ต่างจากผลก่อน–หลัง ${Math.abs(usedCount - pairedCount)} คน`
          : `ใช้คะแนนหลังเรียนที่มีข้อมูลจากผู้เข้าร่วม ${participantCount} คน โดยไม่บังคับว่าต้องมีคะแนนก่อนเรียน`}
        helpTitle={`ทำไม n จึงเท่ากับ ${usedCount}`}
        helpText="การเทียบเกณฑ์ใช้คะแนนหลังเรียนเท่านั้น นักเรียนที่ไม่มีคะแนนก่อนเรียนยังรวมได้หากมีคะแนนหลังเรียน ส่วนช่องว่างหลังเรียนจะไม่ถูกแทนด้วย 0"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={`เกณฑ์ ${formatPercent(thresholdPercent)}`} value={criterionAvailable ? formatNumber(analysis.criterionScore) : '—'} detail={`จากคะแนนเต็ม ${formatNumber(maxScore)}`} icon={Target} tone="primary" />
        <MetricCard label="หลังเรียน" value={formatNumber(analysis.posttest.mean)} detail={`S.D. ${formatNumber(analysis.posttest.sampleSd)}`} icon={CheckCircle2} tone="success" />
        <MetricCard label="ผลต่างจากเกณฑ์" value={formatSigned(analysis.meanDifference)} detail="ค่าเฉลี่ยกลุ่ม − เกณฑ์" icon={TrendingUp} tone="accent" />
        <MetricCard label="ผ่านเกณฑ์รายบุคคล" value={criterionAvailable ? `${passedCount}/${usedCount}` : '—'} detail={!criterionAvailable ? 'ยังไม่ได้กำหนดคะแนนเต็ม' : passPercent === null ? 'ยังไม่มีคะแนนหลังเรียน' : `${formatNumber(passPercent)}%`} icon={Users} tone="teal" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <StatisticsCard
          title="ผลสัมฤทธิ์หลังเรียนเทียบเกณฑ์"
          rows={[{ label: 'หลังเรียน', n: usedCount, mean: analysis.posttest.mean, sd: analysis.posttest.sampleSd, criterion: criterionAvailable ? analysis.criterionScore : undefined }]}
          testLabel="One-sample t-test (สองด้าน)"
          test={analysis.test}
          effectLabel="Cohen’s d"
          significanceLevel={significanceLevel}
          showCriterion
        />
        <ScoreChart
          title="คะแนนหลังเรียนกับเกณฑ์"
          data={chartData}
          hasData={usedCount > 0}
          maxScore={maxScore}
          bars={[{ dataKey: 'mean', fill: chartColors.success }]}
          criterion={{ score: analysis.criterionScore, label: `เกณฑ์ ${formatPercent(thresholdPercent)} = ${formatNumber(analysis.criterionScore)}` }}
        />
      </div>

      {analysis.test.status === 'calculated' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <ReportSummary
            text={reportText}
            conclusion={criterionConclusion(analysis.test, significanceLevel)}
            download={{
              fileName: 'korkru-research-criterion-statistics.csv',
              rows: [
                ['ข้อมูล', 'n', 'เกณฑ์', 'ค่าเฉลี่ย', 'S.D.', 'ผ่านเกณฑ์รายบุคคล'],
                ['หลังเรียน', String(usedCount), formatNumber(analysis.criterionScore), formatNumber(analysis.posttest.mean), formatNumber(analysis.posttest.sampleSd), `${passedCount}/${usedCount} (${formatNumber(passPercent)}%)`],
                [],
                ['การทดสอบ', 'ผลต่างเฉลี่ย', `${Math.round(analysis.test.confidenceLevel * 100)}% CI`, `t(${analysis.test.df})`, 'p', "Cohen's d"],
                ['One-sample t-test (สองด้าน)', formatNumber(analysis.test.meanDifference), `[${formatNumber(analysis.test.confidenceInterval[0])}, ${formatNumber(analysis.test.confidenceInterval[1])}]`, formatNumber(analysis.test.t), formatPValue(analysis.test.p), formatNumber(analysis.test.effectSize)],
              ],
            }}
          />
          <CautionCard title="ค่าเฉลี่ยกลุ่มไม่เท่ากับทุกคนผ่าน">
            t-test ตอบคำถามระดับค่าเฉลี่ยของกลุ่ม ส่วนผลผ่านเกณฑ์ {passedCount}/{usedCount} คน ({formatNumber(passPercent)}%) เป็นสถิติเชิงพรรณนารายบุคคล ค่าเฉลี่ยกลุ่มอาจสูงกว่าเกณฑ์แม้ยังมีนักเรียนบางคนไม่ผ่าน
          </CautionCard>
        </div>
      ) : (
        <UnavailableCard message={analysis.test.message} />
      )}

      <Card padding="md" className="border-warning/30 bg-warning/5">
        <p className="text-sm text-muted-foreground">เกณฑ์ {formatPercent(thresholdPercent)} ใช้ค่าจริง {formatNumber(analysis.criterionScore)} คะแนนในการทดสอบโดยไม่ปัดเป็นจำนวนเต็ม และโครงการนี้กำหนดการทดสอบสองด้านไว้ล่วงหน้า</p>
      </Card>
      <UpdatedAt value={latestScoreUpdatedAt} />
    </div>
  )
}

function AnalysisReadyBanner({ ready, title, description, helpTitle, helpText }: { ready: boolean; title: string; description: string; helpTitle: string; helpText: string }) {
  return (
    <Card padding="md" className={ready ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'}>
      <div className="flex items-start gap-3">
        {ready ? <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-6 shrink-0 text-warning" aria-hidden="true" />}
        <div className="min-w-0 flex-1"><p className="font-semibold text-foreground">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
        <HelpBubble title={helpTitle} text={helpText} />
      </div>
    </Card>
  )
}

function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Target; tone: 'primary' | 'success' | 'accent' | 'teal' }) {
  const toneClass = tone === 'success'
    ? 'bg-success/10 text-success'
    : tone === 'accent'
      ? 'bg-primary/10 text-primary'
      : tone === 'teal'
        ? 'bg-tint-3 text-foreground'
        : 'bg-tint-1 text-foreground'
  return (
    <Card padding="lg">
      <div className="flex items-start gap-3">
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', toneClass)}><Icon className="size-5" aria-hidden="true" /></div>
        <div className="min-w-0"><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
      </div>
    </Card>
  )
}

function StatisticsCard({ title, rows, testLabel, test, effectLabel, significanceLevel, showCriterion = false }: {
  title: string
  rows: Array<{ label: string; n: number; mean: number | null; sd: number | null; criterion?: number }>
  testLabel: string
  test: PairedAnalysis['test']
  effectLabel: string
  significanceLevel: number
  showCriterion?: boolean
}) {
  return (
    <Card padding="lg">
      <h2 className="font-semibold text-foreground">{title}</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-muted/70 text-muted-foreground"><tr><th className="px-3 py-2 text-left font-medium">ช่วงการวัด</th><th className="px-3 py-2 text-right font-medium">n</th>{showCriterion && <th className="px-3 py-2 text-right font-medium">เกณฑ์</th>}<th className="px-3 py-2 text-right font-medium">ค่าเฉลี่ย</th><th className="px-3 py-2 text-right font-medium">S.D.</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.label} className="border-t border-border"><td className="px-3 py-2 font-medium text-foreground">{row.label}</td><td className="px-3 py-2 text-right">{row.n}</td>{showCriterion && <td className="px-3 py-2 text-right">{formatNumber(row.criterion)}</td>}<td className="px-3 py-2 text-right">{formatNumber(row.mean)}</td><td className="px-3 py-2 text-right">{formatNumber(row.sd)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="mt-5 border-t border-border pt-4">
        <div className="flex items-center gap-2"><BarChart3 className="size-4 text-primary" aria-hidden="true" /><h3 className="font-semibold text-foreground">{testLabel}</h3></div>
        {test.status === 'calculated' ? (
          <div className="mt-3 grid gap-2 rounded-xl bg-muted/50 p-3 sm:grid-cols-2 lg:grid-cols-5">
            <TestMetric label="ผลต่างเฉลี่ย" value={formatNumber(test.meanDifference)} />
            <TestMetric label={`${Math.round(test.confidenceLevel * 100)}% CI`} value={`[${formatNumber(test.confidenceInterval[0])}, ${formatNumber(test.confidenceInterval[1])}]`} />
            <TestMetric label={`t(${test.df})`} value={formatNumber(test.t)} />
            <TestMetric label="p" value={formatPValue(test.p).replace('p ', '')} />
            <TestMetric label={effectLabel} value={formatNumber(test.effectSize)} />
          </div>
        ) : <p className="mt-3 rounded-xl bg-warning/10 p-3 text-sm text-warning">ยังคำนวณไม่ได้: {test.message}</p>}
        <p className="mt-3 text-xs text-muted-foreground">ทดสอบสองด้านที่ระดับนัยสำคัญ {formatAlpha(significanceLevel)}</p>
      </div>
    </Card>
  )
}

function TestMetric({ label, value }: { label: string; value: string }) {
  return <div className="text-center"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-bold text-foreground">{value}</p></div>
}

function ScoreChart({ title, data, hasData, maxScore, bars, criterion }: {
  title: string
  data: Array<{ name: string; mean: number; sd: number; fill: string }>
  hasData: boolean
  maxScore: number | null
  bars: Array<{ dataKey: 'mean'; fill: string }>
  criterion?: { score: number; label: string }
}) {
  if (maxScore === null || maxScore <= 0 || !hasData) {
    return <Card padding="lg"><h2 className="font-semibold text-foreground">{title}</h2><div className="flex h-72 items-center justify-center text-sm text-muted-foreground">ยังไม่มีข้อมูลเพียงพอสำหรับแสดงกราฟ</div></Card>
  }
  return (
    <Card padding="lg">
      <h2 className="font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">แกนเริ่มที่ 0 ถึงคะแนนเต็ม · เส้นกำกับบนแท่งคือ S.D.</p>
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 20, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: chartColors.axisStrong }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, maxScore]} allowDataOverflow tick={{ fontSize: 11, fill: chartColors.axis }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(value, name) => [formatNumber(Number(value)), name === 'mean' ? 'ค่าเฉลี่ย' : String(name)]} />
            {criterion && <ReferenceLine y={criterion.score} stroke={chartColors.danger} strokeDasharray="5 4" label={{ value: criterion.label, fill: chartColors.danger, fontSize: 11, position: 'insideTopRight' }} />}
            {bars.map(bar => <Bar key={bar.dataKey} dataKey={bar.dataKey} fill={bar.fill} radius={[8, 8, 0, 0]} maxBarSize={120}>{data.map(item => <Cell key={item.name} fill={item.fill} />)}<ErrorBar dataKey="sd" width={10} strokeWidth={2} stroke={chartColors.axisStrong} /></Bar>)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function ReportSummary({ text, conclusion, download }: { text: string; conclusion: string; download: { fileName: string; rows: string[][] } }) {
  async function copyReport() {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('คัดลอกสรุปผลแล้ว')
    } catch {
      toast.error('คัดลอกไม่สำเร็จ กรุณาลองอีกครั้ง')
    }
  }
  function downloadSummary() {
    const csv = download.rows.map(row => row.map(csvCell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = download.fileName
    anchor.click()
    URL.revokeObjectURL(url)
    toast.success('ดาวน์โหลดตารางสรุปแล้ว')
  }
  return (
    <Card padding="lg" className="border-success/30 bg-success/5">
      <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" /><div className="min-w-0 flex-1"><h2 className="font-semibold text-foreground">สรุปผลสำหรับรายงาน</h2><p className="mt-2 text-sm leading-relaxed text-foreground">{text}</p><div className="mt-4 flex flex-wrap items-center justify-between gap-2"><span className="rounded-lg bg-success/10 px-2.5 py-1 text-xs font-medium text-success">{conclusion}</span><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={copyReport}><Clipboard aria-hidden="true" />คัดลอกข้อความ</Button><Button type="button" variant="outline" onClick={downloadSummary}><Download aria-hidden="true" />ดาวน์โหลดตาราง</Button></div></div></div></div>
    </Card>
  )
}

function CautionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card padding="lg" className="border-warning/30 bg-warning/5"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" /><div><h2 className="font-semibold text-foreground">{title}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p></div></div></Card>
}

function UnavailableCard({ message }: { message: string }) {
  return <Card padding="lg" className="border-warning/30 bg-warning/5"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" /><div><h2 className="font-semibold text-foreground">ยังคำนวณผลทดสอบไม่ได้</h2><p className="mt-1 text-sm text-muted-foreground">{message}</p><p className="mt-2 text-sm text-muted-foreground">ตรวจคะแนนในแท็บ “ข้อมูลที่ใช้” แล้วกลับไปแก้ในหน้าข้อมูลคะแนน ระบบจะคำนวณใหม่จากข้อมูลล่าสุด</p></div></div></Card>
}

function UpdatedAt({ value }: { value: string | null }) {
  return <p className="text-right text-xs text-muted-foreground">{value ? `คำนวณจากคะแนนล่าสุดเมื่อ ${formatThaiDate(value)}` : 'ยังไม่มีคะแนนที่บันทึกไว้'}</p>
}

function pairedReportText(analysis: PairedAnalysis, alpha: number): string {
  if (analysis.test.status !== 'calculated' || analysis.pretest.mean === null || analysis.posttest.mean === null) return ''
  const test = analysis.test
  const direction = test.meanDifference > 0 ? 'สูงกว่าก่อนเรียน' : test.meanDifference < 0 ? 'ต่ำกว่าก่อนเรียน' : 'เท่ากับก่อนเรียน'
  const significance = test.p < alpha ? 'แตกต่างอย่างมีนัยสำคัญทางสถิติ' : 'ไม่พบความแตกต่างอย่างมีนัยสำคัญทางสถิติ'
  return `คะแนนหลังเรียน (M = ${formatNumber(analysis.posttest.mean)}, S.D. = ${formatNumber(analysis.posttest.sampleSd)}) ${direction} ${Math.abs(test.meanDifference).toFixed(2)} คะแนน เมื่อเทียบกับคะแนนก่อนเรียน (M = ${formatNumber(analysis.pretest.mean)}, S.D. = ${formatNumber(analysis.pretest.sampleSd)}) และ${significance}ที่ระดับ ${formatAlpha(alpha)}, t(${test.df}) = ${formatNumber(test.t)}, ${formatPValue(test.p)}, Cohen’s dz = ${formatNumber(test.effectSize)}`
}

function criterionReportText(analysis: CriterionAnalysis, alpha: number, passedCount: number): string {
  if (analysis.test.status !== 'calculated' || analysis.posttest.mean === null) return ''
  const test = analysis.test
  const passPercent = analysis.posttest.n > 0 ? (passedCount / analysis.posttest.n) * 100 : 0
  const inferentialResult = test.confidenceInterval[0] > 0
    ? `สูงกว่าเกณฑ์ ${formatNumber(analysis.criterionScore)} คะแนนอยู่ ${Math.abs(test.meanDifference).toFixed(2)} คะแนน และแตกต่างอย่างมีนัยสำคัญทางสถิติ`
    : test.confidenceInterval[1] < 0
      ? `ต่ำกว่าเกณฑ์ ${formatNumber(analysis.criterionScore)} คะแนนอยู่ ${Math.abs(test.meanDifference).toFixed(2)} คะแนน และแตกต่างอย่างมีนัยสำคัญทางสถิติ`
      : `ต่างจากเกณฑ์ ${formatNumber(analysis.criterionScore)} คะแนนอยู่ ${Math.abs(test.meanDifference).toFixed(2)} คะแนน แต่ไม่พบความแตกต่างอย่างมีนัยสำคัญทางสถิติ`
  return `ค่าเฉลี่ยคะแนนหลังเรียน (M = ${formatNumber(analysis.posttest.mean)}, S.D. = ${formatNumber(analysis.posttest.sampleSd)}) ${inferentialResult}ที่ระดับ ${formatAlpha(alpha)}, t(${test.df}) = ${formatNumber(test.t)}, ${formatPValue(test.p)}, Cohen’s d = ${formatNumber(test.effectSize)} โดยมีนักเรียนผ่านเกณฑ์รายบุคคล ${passedCount}/${analysis.posttest.n} คน (${formatNumber(passPercent)}%)`
}

function pairedConclusion(test: StatisticalTestResult, alpha: number): string {
  if (test.p >= alpha) return 'ยังไม่พบความแตกต่างอย่างมีนัยสำคัญ'
  return test.meanDifference > 0 ? 'คะแนนสูงขึ้นหลังเรียน' : 'คะแนนลดลงหลังเรียน'
}

function criterionConclusion(test: StatisticalTestResult, alpha: number): string {
  if (test.p >= alpha) return 'ยังไม่พบความแตกต่างอย่างมีนัยสำคัญ'
  return test.meanDifference > 0 ? 'ค่าเฉลี่ยสูงกว่าเกณฑ์' : 'ค่าเฉลี่ยต่ำกว่าเกณฑ์'
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toFixed(2)
}

function formatSigned(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)} คะแนน`
}

function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(2)}%`
}

function formatAlpha(value: number): string {
  return value.toFixed(3).replace(/^0/, '').replace(/0+$/, '').replace(/\.$/, '')
}

function formatPValue(value: number): string {
  if (!Number.isFinite(value)) return 'ยังคำนวณไม่ได้'
  if (value < 0.001) return 'p < .001'
  return `p = ${value.toFixed(3).replace(/^0/, '')}`
}

function formatThaiDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}
