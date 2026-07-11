import { UserSupport } from '@/components/super-admin/user-support'

export default function UsersPage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Users & Support
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          จัดการบัญชีผู้ใช้งาน · Impersonation · Support Tickets
        </p>
      </div>
      <UserSupport />
    </div>
  )
}
