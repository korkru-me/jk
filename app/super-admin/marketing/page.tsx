import { MarketingGrowth } from '@/components/super-admin/marketing-growth'

export default function MarketingPage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Marketing & Growth
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          ระบบประกาศข่าวสาร · Referral Engine · ติดตามการเติบโต
        </p>
      </div>
      <MarketingGrowth />
    </div>
  )
}
