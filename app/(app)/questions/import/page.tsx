import { ImportChoice } from './_components/import-choice'

export default function ImportQuestionsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">นำเข้าโจทย์</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ก่อคลังโจทย์โดยครู — เอาโจทย์ที่มีอยู่แล้วเข้าคลัง โดยไม่ต้องพิมพ์ใหม่
        </p>
      </div>

      <ImportChoice />
    </div>
  )
}
