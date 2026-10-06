import Image from 'next/image'
import { cn } from '@/lib/utils'

interface BrandLogoProps {
  layout?: 'horizontal' | 'stacked'
  subtitle?: string
  className?: string
}

/** One mark and one spelling across the app, public pages and account screens. */
export function BrandLogo({ layout = 'horizontal', subtitle, className }: BrandLogoProps) {
  const stacked = layout === 'stacked'

  return (
    <span className={cn(
      'inline-flex shrink-0 items-center',
      stacked ? 'flex-col gap-0.5' : 'gap-2.5',
      className,
    )}>
      <Image
        src="/brand/deer-mark.png"
        alt=""
        width={1024}
        height={1536}
        sizes={stacked ? '24px' : '32px'}
        className={cn(
          'w-auto shrink-0 object-contain dark:brightness-0 dark:invert',
          stacked ? 'h-7' : 'h-9',
        )}
      />
      <span className={cn('flex flex-col', stacked && 'items-center')}>
        <span className={cn('font-bold leading-none tracking-tight text-foreground', stacked ? 'text-sm' : 'text-lg')}>
          KorKru
        </span>
        {subtitle && <span className="mt-1 text-xs text-muted-foreground">{subtitle}</span>}
      </span>
    </span>
  )
}
