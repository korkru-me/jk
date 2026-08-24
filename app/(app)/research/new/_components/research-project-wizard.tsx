'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ClipboardCheck,
  Eye,
  FileSpreadsheet,
  FlaskConical,
  Folder,
  HelpCircle,
  Keyboard,
  LockKeyhole,
  MonitorCheck,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { QuestionPreviewContent } from '@/components/questions/question-preview'
import { getQuestionClientDetail } from '@/lib/actions/questions'
import { createEducationResearchProject } from '@/lib/actions/education-research'
import {
  selectedResearchMaxScore,
  type CreateEducationResearchProjectInput,
  type ResearchClassroomOption,
  type ResearchMeasurementDraft,
  type ResearchOnlineMeasurementDraft,
  type ResearchQuestionOption,
  type ResearchQuestionSelectionMode,
  type ResearchQuestionSetOption,
} from '@/lib/education-research'
import { cn } from '@/lib/utils'
import type {
  CompositeConfig,
  FileUploadConfig,
  FillBlankConfig,
  MatchingPair,
  MCQOption,
  OrderingConfig,
  RandomQuestionConfig,
  TrueFalseConfig,
} from '@/lib/types'
import type { QuestionSetSection } from '@/lib/question-set-sections'

const STEPS = ['ข้อมูลโครงการ', 'ก่อนเรียน', 'หลังเรียน', 'ตรวจสอบ']

function emptyOnlineMeasurement(): ResearchOnlineMeasurementDraft {
  return {
    source_type: 'korkru_exam',
    question_ids: [],
    selection_mode: 'individual',
    source_set_id: null,
    source_sections: [],
    duration_minutes: 30,
    publish_mode: 'draft',
    start_at: null,
    end_at: null,
    access_code: null,
  }
}

function toIso(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function randomAccessCode(suffix: 'PRE' | 'POST'): string {
  const bytes = new Uint8Array(3)
  crypto.getRandomValues(bytes)
  const code = Array.from(bytes, byte => (byte % 36).toString(36)).join('').toUpperCase()
  return `${suffix}-${code}`
}

export function ResearchProjectWizard({
  classrooms,
  questions,
  questionSets,
}: {
  classrooms: ResearchClassroomOption[]
  questions: ResearchQuestionOption[]
  questionSets: ResearchQuestionSetOption[]
}) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [classroomId, setClassroomId] = useState('')
  const [threshold, setThreshold] = useState('70')
  const [pretest, setPretest] = useState<ResearchMeasurementDraft>(emptyOnlineMeasurement)
  const [posttest, setPosttest] = useState<ResearchMeasurementDraft>(() => ({
    ...emptyOnlineMeasurement(),
    reuse_pretest_snapshot: true,
  }))
  const [confirmed, setConfirmed] = useState(false)
  const [pickerTarget, setPickerTarget] = useState<'pretest' | 'posttest' | null>(null)
  const [previewIds, setPreviewIds] = useState<string[] | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const selectedClassroom = classrooms.find(classroom => classroom.id === classroomId)
  const pretestMax = measurementMax(pretest, questions)
  const posttestMax = measurementMax(posttest, questions, pretest)

  function moveNext() {
    if (step === 0) {
      if (!title.trim()) return toast.error('กรุณากรอกชื่อโครงการวิจัย')
      if (!topic.trim()) return toast.error('กรุณากรอกเรื่องหรือหน่วยการเรียนรู้')
      if (!selectedClassroom) return toast.error('กรุณาเลือกห้องเรียน')
      if (selectedClassroom.student_count === 0) return toast.error('ห้องเรียนต้องมีนักเรียนที่สมัคร KorKru อย่างน้อย 1 คน')
      const value = Number(threshold)
      if (!Number.isFinite(value) || value <= 0 || value > 100) return toast.error('เกณฑ์ผ่านต้องอยู่ระหว่าง 0 ถึง 100')
    }

    if (step === 1 && !measurementReady(pretest, pretestMax)) {
      return toast.error(pretest.source_type === 'korkru_exam' ? 'กรุณาเลือกข้อสอบก่อนเรียน' : 'กรุณากรอกคะแนนเต็มก่อนเรียน')
    }

    if (step === 2) {
      if (!measurementReady(posttest, posttestMax)) {
        return toast.error(posttest.source_type === 'korkru_exam' ? 'กรุณาเลือกข้อสอบหลังเรียน' : 'กรุณากรอกคะแนนเต็มหลังเรียน')
      }
      if (pretestMax !== posttestMax) return toast.error('คะแนนเต็มก่อนเรียนและหลังเรียนต้องเท่ากัน')
    }

    setStep(current => Math.min(3, current + 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCreate() {
    if (!confirmed) return toast.error('กรุณายืนยันว่าตรวจสอบข้อมูลแล้ว')
    if (!selectedClassroom) return toast.error('ไม่พบห้องเรียนที่เลือก')

    const input: CreateEducationResearchProjectInput = {
      title: title.trim(),
      topic: topic.trim(),
      classroom_id: selectedClassroom.id,
      passing_threshold_percent: Number(threshold),
      pretest: prepareMeasurement(pretest),
      posttest: prepareMeasurement(posttest, pretest),
    }

    startTransition(async () => {
      const result = await createEducationResearchProject(input)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('สร้างโครงการวิจัยแล้ว')
      router.push(`/research/${result.project_id}`)
    })
  }

  const currentPickerMeasurement = pickerTarget === 'pretest' ? pretest : posttest

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">วิจัยการศึกษา / สร้างโครงการ</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">
          {step === 0 ? 'สร้างโครงการวิจัย' : step === 1 ? 'ตั้งค่าคะแนนก่อนเรียน' : step === 2 ? 'ตั้งค่าคะแนนหลังเรียน' : 'ตรวจสอบและสร้างโครงการ'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {step === 0 ? 'เริ่มจากข้อมูลพื้นฐานและห้องเรียนจริง' : step === 3 ? 'ตรวจข้อมูลและกำหนดการก่อนสร้างงานในห้องเรียน' : 'เลือกวิธีเก็บคะแนนและเครื่องมือวัดที่ใช้จริง'}
        </p>
      </div>

      <StepIndicator current={step} />

      {step === 0 && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Card padding="xl" className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-foreground">รูปแบบการวิจัย</p>
              <div className="mt-2 flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <FlaskConical className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-foreground">กลุ่มเดียว วัดก่อน–หลังเรียน</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">ติดตามคะแนนนักเรียนกลุ่มเดิมหลังใช้แผนการจัดการเรียนรู้</p>
                </div>
              </div>
            </div>

            <Field label="ชื่อโครงการวิจัย" htmlFor="research-title" required>
              <Input id="research-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} placeholder="เช่น การพัฒนาผลสัมฤทธิ์ เรื่องการเคลื่อนที่แบบโพรเจกไทล์" autoFocus />
            </Field>
            <Field label="เรื่อง / หน่วยการเรียนรู้" htmlFor="research-topic" required>
              <Input id="research-topic" value={topic} onChange={event => setTopic(event.target.value)} maxLength={200} placeholder="เช่น การเคลื่อนที่แบบโพรเจกไทล์" />
            </Field>

            <div className="space-y-2">
              <Label>เลือกห้องเรียน <span className="text-destructive">*</span></Label>
              {classrooms.length === 0 ? (
                <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
                  ยังไม่มีห้องเรียนรายวิชาที่คุณจัดการได้ กรุณาสร้างห้องเรียนและให้นักเรียนเข้าร่วมก่อน
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {classrooms.map(classroom => {
                    const selected = classroom.id === classroomId
                    return (
                      <Button
                        key={classroom.id}
                        type="button"
                        variant="outline"
                        disabled={classroom.student_count === 0}
                        onClick={() => setClassroomId(classroom.id)}
                        className={cn(
                          'h-auto justify-start whitespace-normal rounded-xl p-4 text-left',
                          selected ? 'border-primary bg-primary/5' : 'border-border hover:border-ring',
                          classroom.student_count === 0 && 'cursor-not-allowed opacity-60',
                        )}
                      >
                        <span className="flex items-start gap-3">
                          <span className={cn('mt-0.5 flex size-5 items-center justify-center rounded-full border', selected && 'border-primary bg-primary text-primary-foreground')}>
                            {selected && <Check className="size-3" aria-hidden="true" />}
                          </span>
                          <span>
                            <span className="block font-semibold text-foreground">{classroom.name}</span>
                            <span className="mt-1 block text-sm text-muted-foreground">{classroom.student_count} นักเรียนที่สมัคร KorKru</span>
                            {classroom.student_count === 0 && <span className="mt-1 block text-xs text-warning">ยังใช้ทำวิจัยไม่ได้</span>}
                          </span>
                        </span>
                      </Button>
                    )
                  })}
                </div>
              )}
            </div>

            <Field label="เกณฑ์ผ่านหลังเรียน" htmlFor="research-threshold" required>
              <div className="flex max-w-48 items-center gap-2">
                <Input id="research-threshold" type="number" min="0.01" max="100" step="0.01" value={threshold} onChange={event => setThreshold(event.target.value)} />
                <span className="text-sm font-medium text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">ใช้วิเคราะห์ว่าคะแนนหลังเรียนของกลุ่มสูงกว่าเกณฑ์ที่กำหนดหรือไม่</p>
            </Field>
          </Card>

          <ProjectSummary classroom={selectedClassroom} threshold={threshold} />
        </div>
      )}

      {step === 1 && (
        <MeasurementStep
          label="ก่อนเรียน"
          measurement={pretest}
          maxScore={pretestMax}
          selectedLabel={selectionLabel(pretest, questionSets)}
          onChange={setPretest}
          onOpenPicker={() => setPickerTarget('pretest')}
          onPreview={() => pretest.source_type === 'korkru_exam' && setPreviewIds(pretest.question_ids)}
        />
      )}

      {step === 2 && (
        <MeasurementStep
          label="หลังเรียน"
          measurement={posttest}
          maxScore={posttestMax}
          selectedLabel={selectionLabel(posttest, questionSets, pretest)}
          onChange={setPosttest}
          onOpenPicker={() => setPickerTarget('posttest')}
          onPreview={() => {
            if (posttest.source_type !== 'korkru_exam') return
            const ids = posttest.reuse_pretest_snapshot && pretest.source_type === 'korkru_exam'
              ? pretest.question_ids
              : posttest.question_ids
            setPreviewIds(ids)
          }}
          pretest={pretest}
          expectedMax={pretestMax}
        />
      )}

      {step === 3 && selectedClassroom && (
        <ReviewStep
          title={title}
          topic={topic}
          classroom={selectedClassroom}
          threshold={Number(threshold)}
          pretest={pretest}
          posttest={posttest}
          pretestMax={pretestMax}
          posttestMax={posttestMax}
          questionSets={questionSets}
          confirmed={confirmed}
          onConfirmedChange={setConfirmed}
          onPretestChange={setPretest}
          onPosttestChange={setPosttest}
          onPreview={ids => setPreviewIds(ids)}
          onHelp={() => setHelpOpen(true)}
        />
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={() => step === 0 ? router.push('/research') : setStep(current => current - 1)} disabled={pending}>
          <ArrowLeft aria-hidden="true" /> {step === 0 ? 'ยกเลิก' : 'ย้อนกลับ'}
        </Button>
        {step < 3 ? (
          <Button onClick={moveNext}>
            ถัดไป: {STEPS[step + 1]} <ArrowRight aria-hidden="true" />
          </Button>
        ) : (
          <Button onClick={handleCreate} disabled={pending || !confirmed}>
            <ClipboardCheck aria-hidden="true" /> {pending ? 'กำลังสร้างโครงการ…' : 'สร้างโครงการวิจัย'}
          </Button>
        )}
      </div>

      <ExamPickerDialog
        open={pickerTarget !== null}
        onOpenChange={open => !open && setPickerTarget(null)}
        initial={currentPickerMeasurement?.source_type === 'korkru_exam' ? currentPickerMeasurement : emptyOnlineMeasurement()}
        questions={questions}
        questionSets={questionSets}
        onConfirm={selection => {
          if (pickerTarget === 'pretest') setPretest(selection)
          if (pickerTarget === 'posttest') setPosttest({ ...selection, reuse_pretest_snapshot: false })
          setPickerTarget(null)
        }}
      />

      <ExamPreviewDialog ids={previewIds ?? []} open={previewIds !== null} onOpenChange={open => !open && setPreviewIds(null)} />

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>สำเนาข้อสอบที่ตรึงไว้คืออะไร?</DialogTitle>
            <DialogDescription>ระบบเก็บข้อสอบฉบับที่ใช้ในโครงการแยกจากต้นฉบับในคลัง</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>การแก้โจทย์ต้นฉบับภายหลังจะไม่เปลี่ยนเนื้อหา คะแนนเต็ม หรือเครื่องมือวัดของโครงการย้อนหลัง</p>
            <p>ถ้าใช้ชุดเดิมก่อน–หลัง ระบบใช้สำเนาเดียวกัน แต่โจทย์ชนิดสุ่มจะสุ่มค่าใหม่ในแต่ละครั้งที่นักเรียนเริ่มทำข้อสอบ</p>
            <p>สิ่งนี้ช่วยให้ครูตรวจสอบย้อนหลังได้ว่าคะแนนวิจัยมาจากข้อสอบฉบับใดอย่างสม่ำเสมอ</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="ขั้นตอนสร้างโครงการ">
      {STEPS.map((label, index) => (
        <li key={label} className="flex items-center gap-2">
          <span className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
            index < current ? 'border-success bg-success/10 text-success' : index === current ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground',
          )}>
            {index < current ? <Check className="size-4" aria-hidden="true" /> : index + 1}
          </span>
          <span className={cn('hidden text-sm sm:block', index === current ? 'font-semibold text-primary' : 'text-muted-foreground')}>{label}</span>
        </li>
      ))}
    </ol>
  )
}

function Field({ label, htmlFor, required, children }: { label: string; htmlFor: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label} {required && <span className="text-destructive">*</span>}</Label>
      {children}
    </div>
  )
}

function ProjectSummary({ classroom, threshold }: { classroom?: ResearchClassroomOption; threshold: string }) {
  return (
    <Card padding="lg" className="h-fit space-y-4 lg:sticky lg:top-4">
      <h2 className="font-semibold text-foreground">สรุปโครงการ</h2>
      <SummaryRow label="รูปแบบ" value="กลุ่มเดียว ก่อน–หลัง" />
      <SummaryRow label="ห้องเรียน" value={classroom?.name ?? 'ยังไม่ได้เลือก'} />
      <SummaryRow label="ผู้เรียน" value={classroom ? `${classroom.student_count} คน` : '—'} />
      <SummaryRow label="เกณฑ์ผ่าน" value={threshold ? `${threshold}%` : '—'} />
      <div className="flex gap-2 border-t border-border pt-4 text-sm text-success">
        <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
        <span>ใช้รายชื่อบัญชีจริงจากห้องเรียน</span>
      </div>
    </Card>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium text-foreground">{value}</span></div>
}

function MeasurementStep({
  label,
  measurement,
  maxScore,
  selectedLabel,
  onChange,
  onOpenPicker,
  onPreview,
  pretest,
  expectedMax,
}: {
  label: 'ก่อนเรียน' | 'หลังเรียน'
  measurement: ResearchMeasurementDraft
  maxScore: number
  selectedLabel: string
  onChange: (value: ResearchMeasurementDraft) => void
  onOpenPicker: () => void
  onPreview: () => void
  pretest?: ResearchMeasurementDraft
  expectedMax?: number
}) {
  const isPosttest = label === 'หลังเรียน'
  const canReuse = isPosttest && pretest?.source_type === 'korkru_exam'
  const reuse = measurement.source_type === 'korkru_exam' && measurement.reuse_pretest_snapshot === true

  function changeSource(source: ResearchMeasurementDraft['source_type']) {
    if (source === 'korkru_exam') {
      const next = emptyOnlineMeasurement()
      onChange(canReuse ? { ...next, reuse_pretest_snapshot: true } : next)
    } else {
      onChange({ source_type: source, max_score: expectedMax || 0 })
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card padding="xl" className="space-y-5">
        <div>
          <h2 className="font-semibold text-foreground">เลือกแหล่งคะแนน{label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">เลือกได้ 1 วิธี และเปลี่ยนได้ก่อนเริ่มมีคะแนน</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <SourceButton active={measurement.source_type === 'korkru_exam'} icon={MonitorCheck} title="ข้อสอบออนไลน์ KorKru" description="สร้างงานในห้องเรียน" onClick={() => changeSource('korkru_exam')} />
          <SourceButton active={measurement.source_type === 'manual'} icon={Keyboard} title="กรอกคะแนนบนเว็บ" description="กรอกตามรายชื่อนักเรียน" onClick={() => changeSource('manual')} />
          <SourceButton active={measurement.source_type === 'excel'} icon={FileSpreadsheet} title="แม่แบบ Excel" description="ดาวน์โหลด กรอก และอัปโหลด" onClick={() => changeSource('excel')} />
        </div>

        {measurement.source_type === 'korkru_exam' ? (
          <div className="space-y-4 border-t border-border pt-5">
            {canReuse && (
              <div className="grid gap-3 sm:grid-cols-2">
                <ChoiceButton active={reuse} title="ใช้ชุดเดียวกับก่อนเรียน" description="ใช้สำเนาเดิมและสุ่มค่าใหม่เมื่อรองรับ" onClick={() => onChange({ ...emptyOnlineMeasurement(), reuse_pretest_snapshot: true })} />
                <ChoiceButton active={!reuse} title="เลือกข้อสอบหลังเรียนชุดใหม่" description="ใช้ข้อสอบคู่ขนานที่คะแนนเต็มเท่ากัน" onClick={() => onChange({ ...emptyOnlineMeasurement(), reuse_pretest_snapshot: false })} />
              </div>
            )}

            {!reuse && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-foreground">ข้อสอบ{label}</p>
                  <p className="text-sm text-muted-foreground">{measurement.question_ids.length > 0 ? `${selectedLabel} · ${measurement.question_ids.length} ข้อ` : 'ยังไม่ได้เลือกข้อสอบ'}</p>
                </div>
                <Button variant="outline" onClick={onOpenPicker}><Folder aria-hidden="true" /> เลือกจากคลังและแฟ้ม</Button>
              </div>
            )}

            {(reuse || measurement.question_ids.length > 0) && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{reuse ? 'ใช้สำเนาข้อสอบก่อนเรียน' : selectedLabel}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{reuse && pretest?.source_type === 'korkru_exam' ? pretest.question_ids.length : measurement.question_ids.length} ข้อ · คะแนนเต็ม {maxScore} คะแนน</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={onPreview}><Eye aria-hidden="true" /> ดูมุมมองนักเรียน</Button>
                </div>
              </div>
            )}

            <Field label="เวลาทำข้อสอบ" htmlFor={`duration-${label}`} required>
              <div className="flex max-w-48 items-center gap-2">
                <Input id={`duration-${label}`} type="number" min="1" max="600" value={measurement.duration_minutes} onChange={event => onChange({ ...measurement, duration_minutes: Number(event.target.value) })} />
                <span className="text-sm text-muted-foreground">นาที</span>
              </div>
            </Field>
            <p className="text-xs text-muted-foreground">ข้อสอบวิจัยทำได้ 1 ครั้ง ระบบจะสร้างงานในห้องเรียนเมื่อยืนยันโครงการ</p>
          </div>
        ) : (
          <div className="border-t border-border pt-5">
            <Field label={`คะแนนเต็ม${label}`} htmlFor={`offline-max-${label}`} required>
              <Input id={`offline-max-${label}`} className="max-w-48" type="number" min="0.01" step="0.01" value={measurement.max_score || ''} onChange={event => onChange({ ...measurement, max_score: Number(event.target.value) })} />
              <p className="text-xs text-muted-foreground">คะแนนเต็มก่อนและหลังต้องเท่ากัน ระบบรับคะแนนจริงในระยะข้อมูลคะแนน</p>
            </Field>
          </div>
        )}
      </Card>

      <Card padding="lg" className="h-fit space-y-4">
        <h2 className="font-semibold text-foreground">สรุป{label}</h2>
        <SummaryRow label="แหล่งคะแนน" value={sourceLabel(measurement.source_type)} />
        <SummaryRow label="จำนวนข้อ" value={measurement.source_type === 'korkru_exam' ? `${reuse && pretest?.source_type === 'korkru_exam' ? pretest.question_ids.length : measurement.question_ids.length} ข้อ` : '—'} />
        <SummaryRow label="คะแนนเต็ม" value={maxScore > 0 ? `${maxScore} คะแนน` : '—'} />
        <div className={cn('flex gap-2 border-t border-border pt-4 text-sm', measurementReady(measurement, maxScore) ? 'text-success' : 'text-warning')}>
          {measurementReady(measurement, maxScore) ? <ShieldCheck className="size-4" aria-hidden="true" /> : <HelpCircle className="size-4" aria-hidden="true" />}
          <span>{measurementReady(measurement, maxScore) ? 'การตั้งค่ารอบนี้พร้อมแล้ว' : 'ยังต้องกรอกข้อมูลให้ครบ'}</span>
        </div>
      </Card>
    </div>
  )
}

function SourceButton({ active, icon: Icon, title, description, onClick }: { active: boolean; icon: typeof MonitorCheck; title: string; description: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onClick} className={cn('h-auto flex-col whitespace-normal rounded-xl p-4 text-center', active ? 'border-primary bg-primary/5' : 'border-border hover:border-ring')}>
      <Icon className={cn('mx-auto size-6', active ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
      <span className="mt-2 block text-sm font-semibold text-foreground">{title}</span>
      <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
    </Button>
  )
}

function ChoiceButton({ active, title, description, onClick }: { active: boolean; title: string; description: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onClick} className={cn('h-auto justify-start whitespace-normal rounded-xl p-4 text-left', active ? 'border-primary bg-primary/5' : 'border-border hover:border-ring')}>
      <span className="flex items-start gap-3">
        <span className={cn('mt-0.5 flex size-5 items-center justify-center rounded-full border', active && 'border-primary bg-primary text-primary-foreground')}>{active && <Check className="size-3" aria-hidden="true" />}</span>
        <span><span className="block text-sm font-semibold text-foreground">{title}</span><span className="mt-1 block text-xs text-muted-foreground">{description}</span></span>
      </span>
    </Button>
  )
}

function ReviewStep({
  title,
  topic,
  classroom,
  threshold,
  pretest,
  posttest,
  pretestMax,
  posttestMax,
  questionSets,
  confirmed,
  onConfirmedChange,
  onPretestChange,
  onPosttestChange,
  onPreview,
  onHelp,
}: {
  title: string
  topic: string
  classroom: ResearchClassroomOption
  threshold: number
  pretest: ResearchMeasurementDraft
  posttest: ResearchMeasurementDraft
  pretestMax: number
  posttestMax: number
  questionSets: ResearchQuestionSetOption[]
  confirmed: boolean
  onConfirmedChange: (value: boolean) => void
  onPretestChange: (value: ResearchMeasurementDraft) => void
  onPosttestChange: (value: ResearchMeasurementDraft) => void
  onPreview: (ids: string[]) => void
  onHelp: () => void
}) {
  const postIds = posttest.source_type === 'korkru_exam' && posttest.reuse_pretest_snapshot && pretest.source_type === 'korkru_exam' ? pretest.question_ids : posttest.source_type === 'korkru_exam' ? posttest.question_ids : []
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-5">
        <Card padding="lg" className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="font-semibold text-foreground">ข้อมูลโครงการ</h2><p className="mt-1 text-lg font-semibold text-foreground">{title}</p></div>
          </div>
          <p className="text-sm text-muted-foreground">เรื่อง {topic}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span>กลุ่มเดียว วัดก่อน–หลังเรียน</span><span>ห้อง {classroom.name}</span><span>{classroom.student_count} นักเรียน</span><span>เกณฑ์ผ่าน {threshold}%</span>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <ReviewMeasurementCard label="ข้อสอบก่อนเรียน" measurement={pretest} maxScore={pretestMax} selectionLabel={selectionLabel(pretest, questionSets)} onChange={onPretestChange} onPreview={() => pretest.source_type === 'korkru_exam' && onPreview(pretest.question_ids)} />
          <ReviewMeasurementCard label="ข้อสอบหลังเรียน" measurement={posttest} maxScore={posttestMax} selectionLabel={selectionLabel(posttest, questionSets, pretest)} onChange={onPosttestChange} onPreview={() => postIds.length > 0 && onPreview(postIds)} />
        </div>

        <Card padding="md" className="border-primary/20 bg-primary/5">
          <div className="flex gap-3"><BookOpen className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" /><div><p className="font-semibold text-foreground">ระบบจะสร้างงานตามรอบที่เลือกในห้อง {classroom.name}</p><p className="mt-1 text-sm text-muted-foreground">ข้อสอบออนไลน์ควบคุมกำหนดการจากโครงการวิจัย แต่นักเรียนจะเห็นและทำผ่านห้องเรียนตามปกติ</p></div></div>
        </Card>
      </div>

      <Card padding="lg" className="h-fit space-y-4">
        <h2 className="font-semibold text-foreground">ความพร้อม</h2>
        <ReadinessItem ready={classroom.student_count > 0} label={`นักเรียนมีบัญชี KorKru ${classroom.student_count} คน`} />
        <ReadinessItem ready={pretestMax === posttestMax && pretestMax > 0} label="คะแนนเต็มก่อน–หลังตรงกัน" />
        <ReadinessItem ready label="ข้อสอบออนไลน์ทำได้ 1 ครั้ง" />
        <div className="flex items-start gap-2">
          <ReadinessItem ready label="สำเนาข้อสอบพร้อมตรึง" />
          <Button variant="ghost" size="icon-xs" onClick={onHelp} title="อธิบายสำเนาข้อสอบที่ตรึงไว้"><HelpCircle aria-hidden="true" /><span className="sr-only">อธิบายสำเนาข้อสอบที่ตรึงไว้</span></Button>
        </div>
        <label className="flex cursor-pointer items-start gap-2 border-t border-border pt-4 text-sm text-foreground">
          <input type="checkbox" checked={confirmed} onChange={event => onConfirmedChange(event.target.checked)} className="mt-0.5 size-4 accent-primary" />
          <span>ฉันตรวจสอบห้องเรียน ข้อสอบ คะแนนเต็ม และกำหนดการแล้ว</span>
        </label>
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">ข้อสอบที่เลือก “ฉบับร่าง” จะยังไม่แสดงให้นักเรียนเห็นหลังสร้างโครงการ</p>
      </Card>
    </div>
  )
}

function ReviewMeasurementCard({ label, measurement, maxScore, selectionLabel: selectedLabel, onChange, onPreview }: { label: string; measurement: ResearchMeasurementDraft; maxScore: number; selectionLabel: string; onChange: (value: ResearchMeasurementDraft) => void; onPreview: () => void }) {
  const online = measurement.source_type === 'korkru_exam'
  return (
    <Card padding="lg" className="space-y-4">
      <div><p className="font-semibold text-foreground">{label}</p><p className="mt-1 text-sm text-muted-foreground">{sourceLabel(measurement.source_type)} · {maxScore} คะแนน</p>{online && <p className="mt-1 text-xs text-muted-foreground">{selectedLabel}</p>}</div>
      {online && (
        <>
          <div className="flex items-center justify-between gap-2"><span className="text-xs text-success">สำเนาข้อสอบที่ตรึงไว้</span><Button variant="outline" size="xs" onClick={onPreview}><Eye aria-hidden="true" /> มุมมองนักเรียน</Button></div>
          <ScheduleEditor measurement={measurement} suffix={label.includes('ก่อน') ? 'PRE' : 'POST'} onChange={value => onChange(value)} />
        </>
      )}
    </Card>
  )
}

function ScheduleEditor({ measurement, suffix, onChange }: { measurement: ResearchOnlineMeasurementDraft; suffix: 'PRE' | 'POST'; onChange: (value: ResearchOnlineMeasurementDraft) => void }) {
  const codeEnabled = measurement.access_code !== null
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <Field label="การเผยแพร่" htmlFor={`publish-${suffix}`}>
        <NativeSelect id={`publish-${suffix}`} value={measurement.publish_mode} onChange={event => onChange({ ...measurement, publish_mode: event.target.value as ResearchOnlineMeasurementDraft['publish_mode'] })}>
          <option value="draft">เก็บเป็นฉบับร่าง</option><option value="immediate">เผยแพร่ทันที</option><option value="scheduled">กำหนดเวลา</option>
        </NativeSelect>
      </Field>
      {measurement.publish_mode === 'scheduled' && (
        <div className="grid gap-2">
          <Field label="เปิด" htmlFor={`start-${suffix}`}><Input id={`start-${suffix}`} type="datetime-local" value={measurement.start_at ?? ''} onChange={event => onChange({ ...measurement, start_at: event.target.value || null })} /></Field>
          <Field label="ปิด" htmlFor={`end-${suffix}`}><Input id={`end-${suffix}`} type="datetime-local" value={measurement.end_at ?? ''} onChange={event => onChange({ ...measurement, end_at: event.target.value || null })} /></Field>
        </div>
      )}
      {measurement.publish_mode === 'immediate' && <Field label="ปิดรับ (ไม่บังคับ)" htmlFor={`end-${suffix}`}><Input id={`end-${suffix}`} type="datetime-local" value={measurement.end_at ?? ''} onChange={event => onChange({ ...measurement, end_at: event.target.value || null })} /></Field>}
      <label className="flex items-center justify-between gap-3 text-sm text-foreground"><span className="flex items-center gap-2"><LockKeyhole className="size-4 text-muted-foreground" aria-hidden="true" /> ใช้รหัสเข้าข้อสอบ <span className="text-xs text-primary">แนะนำ</span></span><input type="checkbox" checked={codeEnabled} onChange={event => onChange({ ...measurement, access_code: event.target.checked ? randomAccessCode(suffix) : null })} className="size-4 accent-primary" /></label>
      {codeEnabled && <div className="flex gap-2"><Input aria-label={`รหัสเข้าข้อสอบ${suffix}`} value={measurement.access_code ?? ''} maxLength={12} onChange={event => onChange({ ...measurement, access_code: event.target.value.toUpperCase() })} /><Button variant="outline" size="icon" onClick={() => onChange({ ...measurement, access_code: randomAccessCode(suffix) })} title="สร้างรหัสสุ่ม"><RefreshCw aria-hidden="true" /><span className="sr-only">สร้างรหัสสุ่ม</span></Button></div>}
    </div>
  )
}

function ReadinessItem({ ready, label }: { ready: boolean; label: string }) {
  return <div className={cn('flex items-start gap-2 text-sm', ready ? 'text-success' : 'text-warning')}><span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border', ready ? 'border-success' : 'border-warning')}>{ready && <Check className="size-3" aria-hidden="true" />}</span><span>{label}</span></div>
}

function ExamPickerDialog({ open, onOpenChange, initial, questions, questionSets, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; initial: ResearchOnlineMeasurementDraft; questions: ResearchQuestionOption[]; questionSets: ResearchQuestionSetOption[]; onConfirm: (measurement: ResearchOnlineMeasurementDraft) => void }) {
  const [mode, setMode] = useState<'folders' | 'individual'>('folders')
  const [selectedIds, setSelectedIds] = useState<string[]>(initial.question_ids)
  const [selectionMode, setSelectionMode] = useState<ResearchQuestionSelectionMode>(initial.selection_mode)
  const [sourceSetId, setSourceSetId] = useState<string | null>(initial.source_set_id)
  const [sections, setSections] = useState<QuestionSetSection[]>(initial.source_sections)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return
    setSelectedIds(initial.question_ids)
    setSelectionMode(initial.selection_mode)
    setSourceSetId(initial.source_set_id)
    setSections(initial.source_sections)
    setMode(initial.selection_mode === 'individual' ? 'individual' : 'folders')
  }, [open, initial])

  const filteredQuestions = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('th')
    if (!term) return questions
    return questions.filter(question => `${question.title} ${question.question_text} ${(question.tags ?? []).join(' ')}`.toLocaleLowerCase('th').includes(term))
  }, [questions, search])
  const maxScore = selectedResearchMaxScore(selectedIds, questions)

  function selectSet(set: ResearchQuestionSetOption, selectedSections?: QuestionSetSection[]) {
    const nextSections = selectedSections ?? set.sections
    const ids = selectedSections
      ? set.question_ids.filter(id => selectedSections.some(section => section.question_ids.includes(id)))
      : set.question_ids
    setSelectedIds(ids)
    setSelectionMode(selectedSections ? 'sections' : 'set')
    setSourceSetId(set.id)
    setSections(nextSections)
  }

  function toggleQuestion(id: string) {
    setMode('individual')
    setSelectionMode('individual')
    setSourceSetId(null)
    setSections([])
    setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader><DialogTitle>เลือกข้อสอบจากคลังและแฟ้ม</DialogTitle><DialogDescription>เลือกทั้งแฟ้ม แฟ้มย่อย หรือเลือกโจทย์ทีละข้อจากคลังของคุณ</DialogDescription></DialogHeader>
        <div className="flex gap-2 border-b border-border pb-3">
          <Button variant={mode === 'folders' ? 'default' : 'outline'} size="sm" onClick={() => setMode('folders')}><Folder aria-hidden="true" /> แฟ้มและแฟ้มย่อย</Button>
          <Button variant={mode === 'individual' ? 'default' : 'outline'} size="sm" onClick={() => setMode('individual')}><BookOpen aria-hidden="true" /> เลือกทีละข้อ</Button>
        </div>

        {mode === 'folders' ? (
          <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            {questionSets.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">ยังไม่มีแฟ้มโจทย์ที่มีโจทย์พร้อมใช้</p> : questionSets.map(set => (
              <Card key={set.id} padding="md" className={cn(sourceSetId === set.id && 'border-primary/30')}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold text-foreground">{set.title}</p><p className="mt-1 text-xs text-muted-foreground">{set.question_ids.length} ข้อ{set.description ? ` · ${set.description}` : ''}</p></div><Button variant="outline" size="sm" onClick={() => selectSet(set)}>เลือกทั้งแฟ้ม</Button></div>
                {set.sections.length > 0 && <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">{set.sections.map(section => <Button key={section.id} variant="outline" size="xs" onClick={() => selectSet(set, [section])}>{section.title || 'แฟ้มย่อยไม่มีชื่อ'} · {section.question_ids.length} ข้อ</Button>)}</div>}
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="ค้นหาชื่อ เนื้อหา หรือแท็ก" className="pl-9" /></div>
            <div className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
              {filteredQuestions.map(question => {
                const selected = selectedIds.includes(question.id)
                return <label key={question.id} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3', selected ? 'border-primary/30 bg-primary/5' : 'border-transparent hover:bg-muted')}><input type="checkbox" checked={selected} onChange={() => toggleQuestion(question.id)} className="mt-0.5 size-4 accent-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{question.title}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{question.question_type} · {question.max_score} คะแนน</span></span></label>
              })}
              {filteredQuestions.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">ไม่พบโจทย์ที่ตรงกับคำค้น</p>}
            </div>
          </div>
        )}

        <div className="rounded-lg bg-muted p-3 text-sm text-foreground">เลือกแล้ว {selectedIds.length} ข้อ · คะแนนเต็ม {maxScore} คะแนน</div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button disabled={selectedIds.length === 0 || maxScore <= 0} onClick={() => onConfirm({ ...initial, question_ids: selectedIds, selection_mode: selectionMode, source_set_id: sourceSetId, source_sections: sections })}>ยืนยันข้อสอบที่เลือก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ExamPreviewDialog({ ids, open, onOpenChange }: { ids: string[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [index, setIndex] = useState(0)
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getQuestionClientDetail>> | null>(null)

  useEffect(() => {
    if (!open) return
    setIndex(0)
  }, [open, ids])

  useEffect(() => {
    if (!open || !ids[index]) return
    let active = true
    setDetail(null)
    getQuestionClientDetail(ids[index]).then(result => { if (active) setDetail(result) })
    return () => { active = false }
  }, [open, ids, index])

  const question = detail && 'data' in detail ? detail.data : null
  const extraData = question?.extra_data
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>มุมมองนักเรียน</DialogTitle><DialogDescription>ตัวอย่างข้อ {ids.length === 0 ? 0 : index + 1} จาก {ids.length} · คำตอบในตัวอย่างจะไม่ถูกบันทึก</DialogDescription></DialogHeader>
        {!detail && <div className="h-64 animate-pulse rounded-xl bg-muted" />}
        {detail && 'error' in detail && <p className="py-12 text-center text-sm text-destructive">{detail.error}</p>}
        {question && <QuestionPreviewContent key={question.id} questionText={question.question_text} variables={question.variables ?? []} answerParts={question.question_type === 'written' ? (question.answer_parts ?? []) : []} isRandom={question.is_random} questionType={question.question_type} mcqOptions={question.question_type === 'mcq' ? ((question.mcq_options ?? []) as MCQOption[]) : []} matchingPairs={question.question_type === 'matching' ? ((question.mcq_options ?? []) as unknown as MatchingPair[]) : []} imageUrls={question.image_urls ?? []} trueFalseConfig={question.question_type === 'true_false' ? (extraData as TrueFalseConfig) : undefined} fillBlankConfig={question.question_type === 'fill_blank' ? (extraData as FillBlankConfig) : undefined} orderingConfig={question.question_type === 'ordering' ? (extraData as OrderingConfig) : undefined} compositeConfig={question.question_type === 'composite' ? (extraData as CompositeConfig) : undefined} partLabelStyle={(extraData as RandomQuestionConfig)?.part_label_style} attachmentUrls={question.question_type === 'file_upload' ? ((extraData as FileUploadConfig)?.attachment_urls ?? []) : []} />}
        <DialogFooter><Button variant="outline" disabled={index === 0} onClick={() => setIndex(current => current - 1)}><ArrowLeft aria-hidden="true" /> ข้อก่อนหน้า</Button><Button disabled={index >= ids.length - 1} onClick={() => setIndex(current => current + 1)}>ข้อถัดไป <ArrowRight aria-hidden="true" /></Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function measurementMax(measurement: ResearchMeasurementDraft, questions: readonly ResearchQuestionOption[], pretest?: ResearchMeasurementDraft): number {
  if (measurement.source_type !== 'korkru_exam') return Number(measurement.max_score) || 0
  if (measurement.reuse_pretest_snapshot && pretest?.source_type === 'korkru_exam') return selectedResearchMaxScore(pretest.question_ids, questions)
  return selectedResearchMaxScore(measurement.question_ids, questions)
}

function measurementReady(measurement: ResearchMeasurementDraft, maxScore: number): boolean {
  if (measurement.source_type !== 'korkru_exam') return maxScore > 0
  return (measurement.reuse_pretest_snapshot === true || measurement.question_ids.length > 0) && maxScore > 0 && measurement.duration_minutes > 0
}

function prepareMeasurement(measurement: ResearchMeasurementDraft, pretest?: ResearchMeasurementDraft): ResearchMeasurementDraft {
  if (measurement.source_type !== 'korkru_exam') return measurement
  const reuse = measurement.reuse_pretest_snapshot === true && pretest?.source_type === 'korkru_exam'
  return {
    ...measurement,
    question_ids: reuse ? pretest.question_ids : measurement.question_ids,
    selection_mode: reuse ? pretest.selection_mode : measurement.selection_mode,
    source_set_id: reuse ? pretest.source_set_id : measurement.source_set_id,
    source_sections: reuse ? pretest.source_sections : measurement.source_sections,
    start_at: toIso(measurement.start_at),
    end_at: toIso(measurement.end_at),
    access_code: measurement.access_code?.trim().toUpperCase() || null,
  }
}

function sourceLabel(source: ResearchMeasurementDraft['source_type']): string {
  return source === 'korkru_exam' ? 'ข้อสอบ KorKru' : source === 'manual' ? 'กรอกบนเว็บ' : 'แม่แบบ Excel'
}

function selectionLabel(measurement: ResearchMeasurementDraft, sets: ResearchQuestionSetOption[], pretest?: ResearchMeasurementDraft): string {
  if (measurement.source_type !== 'korkru_exam') return sourceLabel(measurement.source_type)
  if (measurement.reuse_pretest_snapshot && pretest?.source_type === 'korkru_exam') return 'ใช้ชุดเดียวกับก่อนเรียน'
  if (measurement.selection_mode === 'individual') return 'เลือกจากคลังทีละข้อ'
  const set = sets.find(item => item.id === measurement.source_set_id)
  if (!set) return 'เลือกจากแฟ้มโจทย์'
  if (measurement.selection_mode === 'sections') return `${set.title} — ${measurement.source_sections.map(section => section.title).filter(Boolean).join(', ')}`
  return set.title
}
