'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/questions', label: 'โจทย์รายข้อ' },
  { href: '/questions/sets', label: 'ชุดโจทย์' },
]

// Only shown on the two browse pages themselves — not on /questions/new,
// /questions/[id]/edit, /questions/sets/new, etc.
export function QuestionsTabs() {
  const pathname = usePathname()
  if (pathname !== '/questions' && pathname !== '/questions/sets') return null

  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-gray-100 mb-4">
      {TABS.map(tab => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            'px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors',
            pathname === tab.href
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}
