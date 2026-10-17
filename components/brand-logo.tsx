import { cn } from '@/lib/utils'
import { BRAND_MARK_ASPECT_RATIO, BRAND_MARK_URL } from '@/components/brand-mark-data'

interface BrandLogoProps {
  layout?: 'horizontal' | 'stacked'
  subtitle?: string
  compact?: boolean
  size?: 'default' | 'large'
  className?: string
}

/** One mark and one spelling across the app, public pages and account screens. */
export function BrandLogo({ layout = 'horizontal', subtitle, compact = false, size = 'default', className }: BrandLogoProps) {
  const stacked = layout === 'stacked'
  const large = size === 'large'

  return (
    <span className={cn(
      'inline-flex shrink-0 items-center',
      stacked ? 'flex-col gap-0.5' : (compact ? 'gap-2' : 'gap-2.5'),
      className,
    )}>
      <span
        aria-hidden="true"
        style={{
          WebkitMask: `url('${BRAND_MARK_URL}') center / contain no-repeat`,
          mask: `url('${BRAND_MARK_URL}') center / contain no-repeat`,
          aspectRatio: BRAND_MARK_ASPECT_RATIO,
        }}
        className={cn(
          'block shrink-0 bg-brand-accent',
          large ? 'h-14 sm:h-16' : stacked
            ? (compact ? 'h-8' : 'h-10')
            : (compact ? 'h-8' : 'h-11'),
        )}
      />
      <span className={cn('flex flex-col', stacked && 'items-center')}>
        <span className={cn(
          'font-bold leading-none tracking-tight text-brand-foreground',
          large ? 'text-3xl sm:text-4xl' : stacked
            ? (compact ? 'text-xs' : 'text-sm')
            : (compact ? 'text-sm' : 'text-lg'),
        )}>
          K<span className="text-brand-accent">o</span>rKru
        </span>
        {subtitle && <span className="mt-1 text-xs text-muted-foreground">{subtitle}</span>}
      </span>
    </span>
  )
}
