import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * The app's card surface.
 *
 * This file previously held the stock shadcn Card with its header/content/
 * footer slot system. Nothing in the app ever imported it — 563 card surfaces
 * were hand-written instead, in 82 distinct class combinations. It is
 * redefined here to match how cards are actually built in this codebase, so
 * adopting it is a small edit per call site rather than a restructure.
 *
 * Defaults are the most common combination measured across those 227 outer
 * surfaces: rounded-2xl (120 of them), a border edge (159), no shadow (193).
 * `padding` has no default because most cards pad their inner sections
 * instead of the surface.
 */
const cardVariants = cva("bg-card text-card-foreground", {
  variants: {
    radius: {
      sm: "rounded-lg",
      md: "rounded-xl",
      lg: "rounded-2xl",
    },
    /**
     * How the edge is drawn. `border` and `ring` look nearly identical; both
     * exist because the codebase uses both. Prefer `border`.
     */
    edge: {
      border: "border border-border",
      ring: "ring-1 ring-border",
      dashed: "border border-dashed border-border",
      none: "",
    },
    padding: {
      none: "",
      sm: "p-3",
      md: "p-4",
      lg: "p-5",
      xl: "p-6",
      "2xl": "p-8",
    },
    elevation: {
      none: "",
      sm: "shadow-sm",
      md: "shadow-md",
      lg: "shadow-lg",
      xl: "shadow-xl",
    },
    /** Lift on hover — for cards that are themselves a link or button. */
    interactive: {
      true: "transition-shadow hover:shadow-md",
      false: "",
    },
  },
  defaultVariants: {
    radius: "lg",
    edge: "border",
    padding: "none",
    elevation: "none",
    interactive: false,
  },
})

export type CardProps = React.ComponentProps<"div"> &
  VariantProps<typeof cardVariants>

export function Card({
  className,
  radius,
  edge,
  padding,
  elevation,
  interactive,
  ...props
}: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        cardVariants({ radius, edge, padding, elevation, interactive }),
        className
      )}
      {...props}
    />
  )
}

export { cardVariants }
