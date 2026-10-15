import type { LucideProps } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { workTypeConfig } from '@/lib/assignment-display'
import { cn } from '@/lib/utils'

export function WorkTypeIcon({ type, className, ...props }: LucideProps & { type: string }) {
  const config = workTypeConfig(type)
  const Icon = config.icon
  return <Icon aria-hidden="true" className={cn(config.text, className)} {...props} />
}

export function WorkTypeBadge({ type, className }: { type: string; className?: string }) {
  const config = workTypeConfig(type)
  const Icon = config.icon
  return <Badge variant={config.variant} className={className}><Icon aria-hidden="true" />{config.label}</Badge>
}
