import { ShieldCheck, Award, Globe, Users } from 'lucide-react'
import { Card } from '@/components/ui/card'

const SCHOOLS = [
  { abbr: 'PCCR', name: 'จุฬาภรณราชวิทยาลัย เชียงราย', color: 'indigo' },
  { abbr: 'MWIT', name: 'มหิดลวิทยานุสรณ์', color: 'violet' },
  { abbr: 'KVIS', name: 'กำเนิดวิทย์', color: 'emerald' },
  { abbr: 'OPT', name: 'ฟิสิกส์โอลิมปิก', color: 'amber' },
  { abbr: 'BWF', name: 'Bangkok Wittaya', color: 'cyan' },
  { abbr: 'SPS', name: 'สาธิตพระจอมเกล้า', color: 'rose' },
]

const COLOR_MAP: Record<string, string> = {
  indigo: 'bg-primary/10 text-primary',
  violet: 'bg-tint-1/10 text-tint-1',
  emerald: 'bg-success/10 text-success',
  amber: 'bg-warning/10 text-warning',
  cyan: 'bg-tint-2/10 text-tint-2',
  rose: 'bg-tint-3/10 text-tint-3',
}

const STATS = [
  { icon: Users, value: '14,800+', label: 'ผู้ใช้งานทั้งหมด' },
  { icon: Globe, value: '29', label: 'สถาบันที่ใช้งาน' },
  { icon: Award, value: '28,000+', label: 'โจทย์ในคลัง' },
  { icon: ShieldCheck, value: '99.98%', label: 'Uptime SLA' },
]

const TRUST_ITEMS = [
  {
    icon: ShieldCheck,
    title: 'รองรับกรอบ PISA',
    desc: 'โครงสร้างข้อสอบออกแบบตามกรอบการประเมินสมรรถนะนักเรียนนานาชาติ (PISA) ระดับ OECD',
  },
  {
    icon: Award,
    title: 'เหมาะสำหรับการสอบโอลิมปิก',
    desc: 'ครอบคลุมเนื้อหาระดับ IPhO / ONET / PAT2 พร้อมระบบโจทย์ต่อเนื่องและตัวเลือกลวง',
  },
  {
    icon: Globe,
    title: 'PDPA Compliant',
    desc: 'ระบบปฏิบัติตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) ข้อมูลนักเรียนถูกจัดเก็บอย่างปลอดภัย',
  },
]

export function TrustBadges() {
  return (
    <section className="bg-muted py-20">
      <div className="mx-auto max-w-6xl px-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {STATS.map((stat) => {
            const Icon = stat.icon
            return (
              <div key={stat.label} className="text-center">
                <div className="mb-2 flex justify-center">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <p className="text-3xl font-extrabold text-foreground">
                  {stat.value}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">{stat.label}</p>
              </div>
            )
          })}
        </div>

        {/* Divider */}
        <div className="my-14 border-t border-border/60" />

        {/* School logos */}
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-6">
            เชื่อใจโดยสถาบันชั้นนำทั่วประเทศ
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {SCHOOLS.map((school) => (
              <div
                key={school.abbr}
                title={school.name}
                className={`flex h-12 min-w-[80px] items-center justify-center rounded-xl px-4 text-sm font-bold ${COLOR_MAP[school.color]}`}
              >
                {school.abbr}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            และสถาบันกวดวิชาอีก 20+ แห่งทั่วประเทศ
          </p>
        </div>

        {/* Divider */}
        <div className="my-14 border-t border-border/60" />

        {/* Trust items */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {TRUST_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <Card key={item.title} padding="xl">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
