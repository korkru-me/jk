import type { Metadata } from 'next'
import Link from 'next/link'
import { SignupForm } from '@/components/auth/signup-form'

export const metadata: Metadata = { title: 'สมัครสมาชิก — KorKru' }

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      {/* Logo mark */}
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-base font-bold text-white shadow-md">
          K
        </div>
        <div>
          <p className="text-lg font-bold text-slate-900 dark:text-white leading-none">KorKru</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">คลังข้อสอบอัจฉริยะ</p>
        </div>
      </Link>

      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">สมัครสมาชิก</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            เริ่มสร้างโจทย์ฟิสิกส์ได้เลย ฟรีทันที ไม่ต้องใช้บัตรเครดิต
          </p>
        </div>
        <SignupForm />
      </div>

      <p className="mt-6 text-xs text-slate-400 dark:text-slate-600">
        © 2026 KorKru — ก่อการเรียนรู้ โดยครู
      </p>
    </div>
  )
}
