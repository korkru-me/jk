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
        sizes={stacked ? '32px' : '36px'}
        className={cn(
          'w-auto shrink-0 object-contain dark:brightness-0 dark:invert',
          stacked ? 'h-10' : 'h-11',
        )}
      />
      <span className={cn('flex flex-col', stacked && 'items-center')}>
        <span className={cn('font-bold leading-none tracking-tight text-brand-foreground', stacked ? 'text-sm' : 'text-lg')}>
          K<span className="text-brand-accent">o</span>rKru
        </span>
        {subtitle && <span className="mt-1 text-xs text-muted-foreground">{subtitle}</span>}
      </span>
    </span>
  )
}
