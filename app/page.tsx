import Link from 'next/link'
import Image from 'next/image'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function LandingPage() {
  return (
    <main className="flex flex-col min-h-screen">
      {/* Navbar */}
      <nav className="border-b bg-white/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image
              src="/logo.png"
              alt="KorKru logo"
              width={120}
              height={48}
              className="h-10 w-auto object-contain"
              priority
            />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: 'ghost' }))}
            >
              เข้าสู่ระบบ
            </Link>
            <Link
              href="/register"
              className={cn(buttonVariants({ variant: 'default' }))}
            >
              สมัครใช้งาน
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-20 bg-gradient-to-b from-blue-50 to-white text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Logo mark in hero */}
          <div className="flex justify-center mb-2">
            <Image
              src="/logo.png"
              alt="KorKru"
              width={160}
              height={160}
              className="h-32 w-auto object-contain drop-shadow-md"
              priority
            />
          </div>

          <h1 className="text-4xl sm:text-6xl font-bold text-gray-900 leading-tight">
            ก่อการเรียนรู้{' '}
            <span className="text-blue-600">โดยครู</span>
          </h1>

          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            สร้างโจทย์ฟิสิกส์ที่{' '}
            <strong>สุ่มตัวเลขต่างกันทุกคน</strong>{' '}
            วิเคราะห์ผู้เรียน ประหยัดเวลาครู พิมพ์ใบงาน A4 ได้ทันที
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/register"
              className={cn(buttonVariants({ size: 'lg' }), 'text-base px-8')}
            >
              เริ่มใช้งานฟรี
            </Link>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'text-base px-8')}
            >
              เข้าสู่ระบบ
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            ทำอะไรได้บ้าง?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="border rounded-xl p-6 space-y-3 hover:shadow-md transition-shadow"
              >
                <div className="text-3xl">{f.icon}</div>
                <h3 className="font-semibold text-lg">{f.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-12">วิธีใช้งาน</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {steps.map((s, i) => (
              <div key={i} className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold">
                  {i + 1}
                </div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-gray-600 text-sm">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-blue-600 text-white text-center">
        <div className="max-w-2xl mx-auto space-y-4">
          <h2 className="text-3xl font-bold">พร้อมเริ่มใช้งานแล้วหรือยัง?</h2>
          <p className="text-blue-100">ใช้งานฟรี ไม่ต้องใช้บัตรเครดิต</p>
          <Link
            href="/register"
            className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'mt-4')}
          >
            สมัครใช้งานฟรี
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 bg-white">
        <div className="max-w-6xl mx-auto px-4 flex flex-col items-center gap-3">
          <Image
            src="/logo.png"
            alt="KorKru"
            width={80}
            height={80}
            className="h-12 w-auto object-contain opacity-70"
          />
          <p className="text-sm text-gray-500">© 2026 KorKru — Built by Teachers, For Teachers</p>
        </div>
      </footer>
    </main>
  )
}

const features = [
  {
    icon: '🔢',
    title: 'โจทย์สุ่มตัวเลข',
    desc: 'ระบบสุ่มค่าตัวแปรอัตโนมัติ นักเรียนแต่ละคนได้โจทย์ตัวเลขไม่เหมือนกัน ลดการลอกคำตอบ',
  },
  {
    icon: '📝',
    title: 'Editor สร้างโจทย์ง่าย',
    desc: '4 วิธีสร้างสูตรคำตอบ ทั้งพิมพ์เอง คลังสูตร ปุ่มกด และลอกจากโจทย์เดิม',
  },
  {
    icon: '🏫',
    title: 'ระบบห้องเรียน',
    desc: 'สร้างห้องเรียน แชร์ Class Code ให้นักเรียนเข้าร่วม มอบหมายชุดข้อสอบ',
  },
  {
    icon: '🖨️',
    title: 'พิมพ์ใบงาน A4',
    desc: 'สร้างใบงาน Print-Ready พร้อม QR Code ประจำตัว พิมพ์แจกนักเรียนได้ทันที',
  },
  {
    icon: '📊',
    title: 'Dashboard คะแนน',
    desc: 'ดูคะแนนนักเรียนรายคน วิเคราะห์ผู้เรียน Export เป็น Excel',
  },
  {
    icon: '🔗',
    title: 'โจทย์ต่อเนื่อง',
    desc: 'สร้างโจทย์หลายข้อที่ใช้สถานการณ์เดียวกัน ผลลัพธ์ข้อก่อนนำมาคำนวณข้อต่อไป',
  },
]

const steps = [
  {
    title: 'สร้างโจทย์',
    desc: 'ครูสร้างโจทย์ฟิสิกส์พร้อมสูตรคำตอบและตัวแปรที่ต้องการสุ่ม',
  },
  {
    title: 'มอบหมายให้ห้องเรียน',
    desc: 'เพิ่มโจทย์เป็นชุดข้อสอบ มอบหมายให้ห้องเรียน หรือพิมพ์ใบงาน',
  },
  {
    title: 'ดูผลคะแนน',
    desc: 'ระบบตรวจคะแนนอัตโนมัติ ครูดูผลและวิเคราะห์ได้ทันที',
  },
]
