'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { Check, X, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

type PlanKey = 'free' | 'pro' | 'enterprise'

const PLANS: {
  key: PlanKey
  label: string
  name: string
  description: string
  monthlyPrice: number | null
  yearlyPrice: number | null
  highlighted: boolean
  cta: string
  ctaHref: string
  badge?: string
}[] = [
  {
    key: 'free',
    label: 'เริ่มต้น',
    name: 'Free',
    description: 'สำหรับครูที่อยากลองใช้งานและสัมผัสระบบ',
    monthlyPrice: 0,
    yearlyPrice: 0,
    highlighted: false,
    cta: 'เริ่มใช้งานฟรี',
    ctaHref: '/signup',
  },
  {
    key: 'pro',
    label: 'ติวเตอร์ / สถาบัน',
    name: 'Pro',
    description: 'สำหรับติวเตอร์อิสระและสถาบันกวดวิชาขนาดเล็ก-กลาง',
    monthlyPrice: 299,
    yearlyPrice: 239,
    highlighted: true,
    cta: 'ทดลองใช้ 14 วัน',
    ctaHref: '/signup',
    badge: 'แนะนำ',
  },
  {
    key: 'enterprise',
    label: 'โรงเรียน / องค์กร',
    name: 'Enterprise',
    description: 'สำหรับโรงเรียนและสถาบันการศึกษาขนาดใหญ่',
    monthlyPrice: 1990,
    yearlyPrice: 1592,
    highlighted: false,
    cta: 'ติดต่อทีมขาย',
    ctaHref: 'mailto:sales@korkru.app',
  },
]

type FeatureValue = boolean | string | null

type FeatureRow = {
  feature: string
  tooltip?: string
  free: FeatureValue
  pro: FeatureValue
  enterprise: FeatureValue
}

const FEATURE_GROUPS: { group: string; rows: FeatureRow[] }[] = [
  {
    group: 'คลังโจทย์',
    rows: [
      {
        feature: 'จำนวนโจทย์สูงสุด',
        free: '20 ข้อ',
        pro: 'ไม่จำกัด',
        enterprise: 'ไม่จำกัด',
      },
      {
        feature: 'โจทย์สุ่มตัวเลขอัตโนมัติ',
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: 'โจทย์ต่อเนื่อง (Multi-step)',
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: 'ข้อสอบ MCQ พร้อมตัวลวง',
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: 'โจทย์แนว PISA บริบทชีวิตจริง',
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: 'พื้นที่จัดเก็บรูปภาพโจทย์',
        free: '100 MB',
        pro: '5 GB',
        enterprise: '50 GB',
      },
    ],
  },
  {
    group: 'ห้องเรียนและผู้ใช้',
    rows: [
      {
        feature: 'จำนวนห้องเรียน',
        free: '1 ห้อง',
        pro: 'ไม่จำกัด',
        enterprise: 'ไม่จำกัด',
      },
      {
        feature: 'จำนวนนักเรียนสูงสุด',
        free: '30 คน',
        pro: '500 คน',
        enterprise: 'ไม่จำกัด',
      },
      {
        feature: 'บัญชีครูหลายคน',
        free: false,
        pro: '3 คน',
        enterprise: 'ไม่จำกัด',
      },
      {
        feature: 'แชร์โจทย์ระหว่างครู',
        free: false,
        pro: false,
        enterprise: true,
      },
    ],
  },
  {
    group: 'การส่งออกและรายงาน',
    rows: [
      {
        feature: 'พิมพ์ใบงาน PDF',
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: 'Export PDF แบบสุ่มตัวเลขทุกคนต่างกัน',
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: 'Export คะแนนเป็น Excel',
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: 'รายงานวิเคราะห์ตัวลวง',
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: 'Dashboard สถิติรายชั้นเรียน',
        free: false,
        pro: false,
        enterprise: true,
      },
    ],
  },
  {
    group: 'การสนับสนุน',
    rows: [
      {
        feature: 'ระบบ Supabase Auth & SSO',
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: 'Custom Domain',
        free: false,
        pro: false,
        enterprise: true,
      },
      {
        feature: 'Support ผ่านอีเมล',
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: 'Priority Support + SLA',
        free: false,
        pro: false,
        enterprise: true,
      },
      {
        feature: 'ฝึกอบรมการใช้งาน (Online)',
        free: false,
        pro: false,
        enterprise: true,
      },
    ],
  },
]

function FeatureCell({ value }: { value: FeatureValue }) {
  if (value === true)
    return <Check className="mx-auto h-4 w-4 text-success" />
  if (value === false)
    return <X className="mx-auto h-4 w-4 text-slate-300" />
  if (value === null)
    return <Minus className="mx-auto h-4 w-4 text-slate-300" />
  return (
    <span className="text-xs font-medium text-muted-foreground">{value}</span>
  )
}

export function PricingTable() {
  const [yearly, setYearly] = useState(false)

  return (
    <div className="space-y-12">
      {/* Toggle */}
      <div className="flex items-center justify-center gap-4">
        <span className={cn('text-sm font-medium', !yearly ? 'text-foreground' : 'text-muted-foreground')}>
          รายเดือน
        </span>
        <button
          onClick={() => setYearly((v) => !v)}
          className={cn(
            'relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none',
            yearly ? 'bg-primary' : 'bg-muted dark:bg-slate-600',
          )}
          role="switch"
          aria-checked={yearly}
        >
          <span
            className={cn(
              'inline-block h-5 w-5 rounded-full bg-card shadow-sm transition-transform',
              yearly ? 'translate-x-8' : 'translate-x-1',
            )}
          />
        </button>
        <span className={cn('text-sm font-medium', yearly ? 'text-foreground' : 'text-muted-foreground')}>
          รายปี
        </span>
        {yearly && (
          <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success dark:bg-emerald-950/60">
            ประหยัด 20%
          </span>
        )}
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {PLANS.map((plan) => {
          const price = yearly ? plan.yearlyPrice : plan.monthlyPrice
          return (
            <div
              key={plan.key}
              className={cn(
                'relative flex flex-col rounded-2xl border p-7 transition-shadow',
                plan.highlighted
                  ? 'border-primary shadow-xl shadow-indigo-500/20 ring-1 ring-primary/50 dark:border-primary dark:shadow-indigo-900/40'
                  : 'border-border hover:shadow-md dark:border-slate-700/60',
                'bg-card',
              )}
            >
              {plan.badge && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-bold text-white">
                  {plan.badge}
                </span>
              )}

              <div className="mb-4 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {plan.label}
                </p>
                <h2 className="text-2xl font-bold text-foreground">{plan.name}</h2>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </div>

              <div className="mb-6 flex items-end gap-1">
                {price === 0 ? (
                  <span className="text-4xl font-extrabold text-foreground">ฟรี</span>
                ) : (
                  <>
                    <span className="text-4xl font-extrabold text-foreground">
                      ฿{price?.toLocaleString()}
                    </span>
                    <span className="mb-1 text-muted-foreground">
                      / {yearly ? 'เดือน (ชำระรายปี)' : 'เดือน'}
                    </span>
                  </>
                )}
              </div>

              <Link
                href={plan.ctaHref}
                className={cn(
                  'mb-6 block w-full rounded-xl py-3 text-center text-sm font-semibold transition-colors',
                  plan.highlighted
                    ? 'bg-primary text-white hover:bg-primary/90 shadow-md shadow-indigo-500/20'
                    : 'border border-border text-muted-foreground hover:bg-muted dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800',
                )}
              >
                {plan.cta}
              </Link>

              <ul className="space-y-2.5 flex-1">
                {FEATURE_GROUPS.flatMap((g) => g.rows)
                  .filter((row) => row[plan.key] !== false)
                  .slice(0, 6)
                  .map((row) => (
                    <li
                      key={row.feature}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {row.feature}
                      {typeof row[plan.key] === 'string' && row[plan.key] !== 'ไม่จำกัด' && (
                        <span className="ml-auto shrink-0 text-xs font-semibold text-primary">
                          {row[plan.key] as string}
                        </span>
                      )}
                      {row[plan.key] === 'ไม่จำกัด' && (
                        <span className="ml-auto shrink-0 text-xs font-semibold text-success">
                          ไม่จำกัด
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          )
        })}
      </div>

      {/* Comparison Table */}
      <div className="overflow-x-auto rounded-2xl border border-border/60">
        <table className="w-full bg-card text-sm dark:bg-slate-900">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-5 py-4 text-left text-sm font-semibold text-muted-foreground w-2/5">
                ฟีเจอร์
              </th>
              {PLANS.map((plan) => (
                <th
                  key={plan.key}
                  className={cn(
                    'px-4 py-4 text-center text-sm font-semibold',
                    plan.highlighted
                      ? 'text-primary'
                      : 'text-muted-foreground',
                  )}
                >
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURE_GROUPS.map((group) => (
              <Fragment key={group.group}>
                <tr
                  className="border-t border-border bg-muted dark:border-slate-700/60 dark:bg-slate-800/40"
                >
                  <td
                    colSpan={4}
                    className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    {group.group}
                  </td>
                </tr>
                {group.rows.map((row) => (
                  <tr
                    key={row.feature}
                    className="border-t border-border hover:bg-muted dark:border-slate-800 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-5 py-3 text-sm text-muted-foreground">
                      {row.feature}
                    </td>
                    {PLANS.map((plan) => (
                      <td key={plan.key} className="px-4 py-3 text-center">
                        <FeatureCell value={row[plan.key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
