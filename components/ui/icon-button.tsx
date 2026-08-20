import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ButtonProps = React.ComponentProps<typeof Button>

interface IconButtonProps extends Omit<ButtonProps, "size" | "children"> {
  /** The icon element. Sized by the button unless it carries its own size class. */
  children: React.ReactNode
  /**
   * Required. An icon on its own gives a screen reader nothing to announce, and
   * it doubles as the tooltip.
   */
  label: string
  size?: "2xs" | "xs" | "sm" | "default" | "lg"
}

const SIZE_MAP = {
  "2xs": "icon-2xs",
  xs: "icon-xs",
  sm: "icon-sm",
  default: "icon",
  lg: "icon-lg",
} as const

/**
 * A square, icon-only button.
 *
 * Built on Button so the two share one set of variants — restyling the app
 * means editing button.tsx, not hunting for hand-rolled `w-8 h-8 flex
 * items-center justify-center rounded-lg hover:bg-muted` strings.
 */
export function IconButton({
  children,
  label,
  size = "default",
  variant = "ghost",
  className,
  ...props
}: IconButtonProps) {
  return (
    <Button
      variant={variant}
      size={SIZE_MAP[size]}
      aria-label={label}
      title={label}
      className={cn(className)}
      {...props}
    >
      {children}
    </Button>
  )
}
