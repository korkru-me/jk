import { cn } from '@/lib/utils'

interface BrandLogoProps {
  layout?: 'horizontal' | 'stacked'
  subtitle?: string
  compact?: boolean
  className?: string
}

/** One mark and one spelling across the app, public pages and account screens. */
export function BrandLogo({ layout = 'horizontal', subtitle, compact = false, className }: BrandLogoProps) {
  const stacked = layout === 'stacked'

  return (
    <span className={cn(
      'inline-flex shrink-0 items-center',
      stacked ? 'flex-col gap-0.5' : (compact ? 'gap-2' : 'gap-2.5'),
      className,
    )}>
      <span
        aria-hidden="true"
        style={{
          WebkitMask: "url('/brand/deer-mark.svg') center / contain no-repeat",
          mask: "url('/brand/deer-mark.svg') center / contain no-repeat",
        }}
        className={cn(
          'block aspect-[580/1045] shrink-0 bg-brand-accent',
          stacked
            ? (compact ? 'h-8' : 'h-10')
            : (compact ? 'h-8' : 'h-11'),
        )}
      />
      <span className={cn('flex flex-col', stacked && 'items-center')}>
        <span className={cn(
          'font-bold leading-none tracking-tight text-brand-foreground',
          stacked
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
