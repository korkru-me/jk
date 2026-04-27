import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { User } from '@/lib/types'

export const metadata = { title: 'หน้าหลัก — KorKru' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!authUser) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  if (!profile) redirect('/login')

  const user = profile as User

  if (user.role === 'teacher' || user.role === 'admin') {
    return <TeacherDashboard user={user} />
  }

  return <StudentDashboard user={user} />
}

function TeacherDashboard({ user }: { user: User }) {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          สวัสดี, {user.full_name} 👋
        </h1>
        <p className="text-gray-600 mt-1">ยินดีต้อนรับสู่ KorKru</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <QuickActionCard
          icon="📝"
          title="สร้างโจทย์ใหม่"
          desc="เพิ่มโจทย์ฟิสิกส์พร้อมสูตรสุ่มตัวเลข"
          href="/questions/new"
          primary
        />
        <QuickActionCard
          icon="🏫"
          title="สร้างห้องเรียน"
          desc="สร้างห้องเรียนและรับ Class Code"
          href="/classrooms/new"
        />
        <QuickActionCard
          icon="📋"
          title="สร้างชุดข้อสอบ"
          desc="รวบรวมโจทย์เป็นชุดและมอบหมาย"
          href="/assignments/new"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="โจทย์ทั้งหมด" value="0" icon="📚" />
        <StatCard label="ห้องเรียน" value="0" icon="🏫" />
        <StatCard label="นักเรียน" value="0" icon="🎒" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">เริ่มต้นใช้งาน</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {[
            { step: 1, text: 'สร้างโจทย์แรกของคุณ', href: '/questions/new' },
            { step: 2, text: 'สร้างห้องเรียน', href: '/classrooms/new' },
            { step: 3, text: 'แชร์ Class Code ให้นักเรียน', href: '/classrooms' },
            { step: 4, text: 'สร้างชุดข้อสอบและมอบหมาย', href: '/assignments/new' },
          ].map((item) => (
            <Link
              key={item.step}
              href={item.href}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <div className="w-7 h-7 rounded-full border-2 border-gray-300 flex items-center justify-center text-xs font-bold text-gray-500 group-hover:border-blue-500 group-hover:text-blue-500 transition-colors">
                {item.step}
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600">
                {item.text}
              </span>
              <span className="ml-auto text-gray-400 group-hover:text-blue-500">→</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function StudentDashboard({ user }: { user: User }) {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          สวัสดี, {user.full_name} 👋
        </h1>
        <p className="text-gray-600 mt-1">ยินดีต้อนรับสู่ KorKru</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <QuickActionCard
          icon="🏫"
          title="เข้าร่วมห้องเรียน"
          desc="ใช้ Class Code ที่ครูแจกให้"
          href="/classrooms/join"
          primary
        />
        <QuickActionCard
          icon="📝"
          title="การส่งงาน"
          desc="ดูชุดข้อสอบที่ต้องทำ"
          href="/my-submissions"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="ห้องเรียน" value="0" icon="🏫" />
        <StatCard label="คะแนนเฉลี่ย" value="—" icon="⭐" />
      </div>
    </div>
  )
}

function QuickActionCard({
  icon, title, desc, href, primary,
}: {
  icon: string; title: string; desc: string; href: string; primary?: boolean
}) {
  return (
    <Card className={`hover:shadow-md transition-shadow ${primary ? 'border-blue-200 bg-blue-50' : ''}`}>
      <CardContent className="pt-6">
        <div className="space-y-3">
          <div className="text-3xl">{icon}</div>
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-gray-600 mt-0.5">{desc}</p>
          </div>
          <Link
            href={href}
            className={cn(
              buttonVariants({ variant: primary ? 'default' : 'outline', size: 'sm' })
            )}
          >
            ไปเลย →
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
          </div>
          <div className="text-4xl opacity-20">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}
