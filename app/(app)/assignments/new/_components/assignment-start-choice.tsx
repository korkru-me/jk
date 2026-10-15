import { ExerciseIcon, ExamIcon, PracticeIcon } from '@/lib/assignment-display'
import Link from 'next/link'
import { ArrowLeft, Copy, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface AssignmentStartChoiceProps {
  createHref: string
  reuseHref?: string
}

export function AssignmentStartChoice({ createHref, reuseHref }: AssignmentStartChoiceProps) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">มอบหมายงาน</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          เลือกว่าจะนำงานเดิมกลับมาใช้ หรือเริ่มสร้างงานชิ้นใหม่
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card padding="lg" className="flex min-w-0 flex-col gap-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Copy className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground">นำงานเดิมมาใช้</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                เลือกแบบฝึกหัดหรือข้อสอบจากห้องอื่น แล้วสร้างเป็นแบบร่างในห้องนี้
              </p>
            </div>
          </div>
          {reuseHref ? (
            <Button variant="outline" className="mt-auto w-full" render={<Link href={reuseHref} />}>
              <Copy data-icon="inline-start" /> เลือกงานเดิม
            </Button>
          ) : (
            <Button variant="outline" className="mt-auto w-full" disabled>
              <Copy data-icon="inline-start" /> ต้องมีห้องอื่นที่มีงานก่อน
            </Button>
          )}
        </Card>

        <Card padding="lg" className="flex min-w-0 flex-col gap-5 border-primary/30 bg-primary/5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Plus className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground">สร้างงานใหม่</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                เลือกว่าจะสร้างแบบฝึกหัดหรือข้อสอบ แล้วจึงเริ่มเลือกโจทย์และตั้งค่า
              </p>
            </div>
          </div>
          <Button className="mt-auto w-full" render={<Link href={createHref} />}>
            <Plus data-icon="inline-start" /> สร้างงานใหม่
          </Button>
        </Card>
      </div>
    </div>
  )
}

interface AssignmentTypeChoiceProps {
  backHref: string
  exerciseHref: string
  examHref: string
  practiceHref?: string
}

export function AssignmentTypeChoice({
  backHref,
  exerciseHref,
  examHref,
  practiceHref,
}: AssignmentTypeChoiceProps) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Button variant="ghost" className="w-fit" render={<Link href={backHref} />}>
        <ArrowLeft data-icon="inline-start" /> กลับไปเลือกวิธีมอบหมายงาน
      </Button>

      <div>
        <h1 className="text-2xl font-bold text-foreground">สร้างงานใหม่</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          เลือกประเภทงานก่อนเข้าสู่หน้าสร้าง เพื่อให้ระบบเตรียมค่าที่เหมาะสมให้
        </p>
      </div>

      <div className={cn('grid gap-4 md:grid-cols-2', practiceHref && 'lg:grid-cols-3')}>
        <Card padding="md" className="flex min-w-0 flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-work-exercise/10 text-work-exercise">
              <ExerciseIcon className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground">แบบฝึกหัด</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                เหมาะกับการฝึกซ้ำ ตรวจคำตอบระหว่างทำ และเปิดให้ลองใหม่ได้
              </p>
            </div>
          </div>
          <Button variant="workExercise" className="mt-auto w-full" render={<Link href={exerciseHref} />}>
            <ExerciseIcon data-icon="inline-start" /> สร้างแบบฝึกหัด
          </Button>
        </Card>

        <Card padding="md" className="flex min-w-0 flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-work-exam/10 text-work-exam">
              <ExamIcon className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground">ข้อสอบ</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                เหมาะกับการประเมินผลแบบจำกัดครั้ง พร้อมตัวเลือกการคุมสอบ
              </p>
            </div>
          </div>
          <Button variant="workExam" className="mt-auto w-full" render={<Link href={examHref} />}>
            <ExamIcon data-icon="inline-start" /> สร้างข้อสอบ
          </Button>
        </Card>

        {practiceHref && (
          <Card padding="md" className="flex min-w-0 flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-work-practice/10 text-work-practice">
                <PracticeIcon className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-foreground">คลังฝึก</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  ให้นักเรียนเลือกฝึกเอง ครูเห็นจำนวนครั้ง แต่ไม่มีคะแนน
                </p>
              </div>
            </div>
            <Button variant="workPractice" className="mt-auto w-full" render={<Link href={practiceHref} />}>
              <PracticeIcon data-icon="inline-start" /> สร้างคลังฝึก
            </Button>
          </Card>
        )}
      </div>
    </div>
  )
}
