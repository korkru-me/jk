'use client'

import { useState } from 'react'
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
    return <Check className="mx-auto h-4 w-4 text-emerald-500" />
  if (value === false)
    return <X className="mx-auto h-4 w-4 text-slate-300 dark:text-slate-600" />
  if (value === null)
    return <Minus className="mx-auto h-4 w-4 text-slate-300 dark:text-slate-600" />
  return (
    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{value}</span>
  )
}

export function PricingTable() {
  const [yearly, setYearly] = useState(false)

  return (
    <div className="space-y-12">
      {/* Toggle */}
      <div className="flex items-center justify-center gap-4">
        <span className={cn('text-sm font-medium', !yearly ? 'text-slate-900 dark:text-white' : 'text-slate-400')}>
          รายเดือน
        </span>
        <button
          onClick={() => setYearly((v) => !v)}
          className={cn(
            'relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none',
            yearly ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600',
          )}
          role="switch"
          aria-checked={yearly}
        >
          <span
            className={cn(
              'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
              yearly ? 'translate-x-8' : 'translate-x-1',
            )}
          />
        </button>
        <span className={cn('text-sm font-medium', yearly ? 'text-slate-900 dark:text-white' : 'text-slate-400')}>
          รายปี
        </span>
        {yearly && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
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
                  ? 'border-indigo-400 shadow-xl shadow-indigo-500/20 ring-1 ring-indigo-400/50 dark:border-indigo-600 dark:shadow-indigo-900/40'
                  : 'border-slate-200 hover:shadow-md dark:border-slate-700/60',
                'bg-white dark:bg-slate-900',
              )}
            >
              {plan.badge && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1 text-xs font-bold text-white">
                  {plan.badge}
                </span>
              )}

              <div className="mb-4 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  {plan.label}
                </p>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{plan.name}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">{plan.description}</p>
              </div>

              <div className="mb-6 flex items-end gap-1">
                {price === 0 ? (
                  <span className="text-4xl font-extrabold text-slate-900 dark:text-white">ฟรี</span>
                ) : (
                  <>
                    <span className="text-4xl font-extrabold text-slate-900 dark:text-white">
                      ฿{price?.toLocaleString()}
                    </span>
                    <span className="mb-1 text-slate-400 dark:text-slate-500">
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
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-500/20'
                    : 'border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800',
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
                      className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                      {row.feature}
                      {typeof row[plan.key] === 'string' && row[plan.key] !== 'ไม่จำกัด' && (
                        <span className="ml-auto shrink-0 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                          {row[plan.key] as string}
                        </span>
                      )}
                      {row[plan.key] === 'ไม่จำกัด' && (
                        <span className="ml-auto shrink-0 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
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
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700/60">
        <table className="w-full bg-white text-sm dark:bg-slate-900">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700/60">
              <th className="px-5 py-4 text-left text-sm font-semibold text-slate-700 dark:text-slate-200 w-2/5">
                ฟีเจอร์
              </th>
              {PLANS.map((plan) => (
                <th
                  key={plan.key}
                  className={cn(
                    'px-4 py-4 text-center text-sm font-semibold',
                    plan.highlighted
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-700 dark:text-slate-200',
                  )}
                >
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURE_GROUPS.map((group) => (
              <>
                <tr
                  key={group.group}
                  className="border-t border-slate-200 bg-slate-50 dark:border-slate-700/60 dark:bg-slate-800/40"
                >
                  <td
                    colSpan={4}
                    className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                  >
                    {group.group}
                  </td>
                </tr>
                {group.rows.map((row) => (
                  <tr
                    key={row.feature}
                    className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-5 py-3 text-sm text-slate-700 dark:text-slate-300">
                      {row.feature}
                    </td>
                    {PLANS.map((plan) => (
                      <td key={plan.key} className="px-4 py-3 text-center">
                        <FeatureCell value={row[plan.key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
