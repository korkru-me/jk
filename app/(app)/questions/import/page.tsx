import { ImportChoice } from './_components/import-choice'

export default function ImportQuestionsPage() {
  return (
    <div className="@container flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">นำเข้าโจทย์</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          เลือกนำเข้าจากไฟล์ Word หรือไฟล์ที่ส่งออกจาก KorKru
        </p>
      </div>

      <ImportChoice />
    </div>
  )
}
