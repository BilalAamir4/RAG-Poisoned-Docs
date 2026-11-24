import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({
  className,
  ...props
}) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-sh-lg border border-sh-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-sh-muted-foreground focus-visible:border-sh-ring focus-visible:ring-3 focus-visible:ring-sh-ring/50 disabled:cursor-not-allowed disabled:bg-sh-input/50 disabled:opacity-50 aria-invalid:border-sh-destructive aria-invalid:ring-3 aria-invalid:ring-sh-destructive/20 md:text-sm dark:bg-sh-input/30 dark:disabled:bg-sh-input/80 dark:aria-invalid:border-sh-destructive/50 dark:aria-invalid:ring-sh-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
