import type { ComponentProps, CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import styles from './classroom-theme.module.css'

// The same nine semantic tokens used by COVER_PRESETS; never derive CSS from
// description text. The scope only paints explicitly marked decoration.
const ACCENTS: Record<string, string> = {
  blue: 'var(--tint-1)', sky: 'var(--tint-2)', mint: 'var(--tint-4)',
  green: 'var(--success)', amber: 'var(--warning)', orange: 'var(--flag)',
  red: 'var(--tint-3)', purple: 'var(--primary)', slate: 'var(--muted-foreground)',
}

export function ClassroomTheme({ cover, className, style, ...props }: ComponentProps<'div'> & { cover: string }) {
  const theme = Object.hasOwn(ACCENTS, cover) ? cover : 'default'
  return <div
    {...props}
    data-classroom-theme={theme}
    className={cn(styles.scope, className)}
    style={{ ...style, '--classroom-accent': theme === 'default' ? 'var(--primary)' : ACCENTS[theme] } as CSSProperties}
  />
}
