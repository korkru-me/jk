import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A styled native `<select>`.
 *
 * components/ui/select.tsx is the base-ui composite — Trigger, Content, Item —
 * which is the right choice for a rich picker but a structural rewrite for the
 * 34 plain selects in this app. This gives those the same border, height and
 * focus ring as Input, so form controls match and follow the theme, without
 * changing their behaviour.
 *
 * Deliberately no `appearance-none` and no wrapper element: the browser keeps
 * drawing its own chevron, and the select stays exactly where it was in the
 * layout, so width and inline classes on the call site still apply.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        "md:text-sm dark:bg-input/30 dark:disabled:bg-input/80",
        className
      )}
      {...props}
    />
  )
}

export { NativeSelect }
