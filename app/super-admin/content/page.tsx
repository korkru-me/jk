import { MasterContent } from '@/components/super-admin/master-content'

export default function ContentPage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Master Question Bank
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          สร้างและแจกจ่ายชุดข้อสอบมาตรฐานระดับชาติสู่ทุกสถาบัน
        </p>
      </div>
      <MasterContent />
    </div>
  )
}
