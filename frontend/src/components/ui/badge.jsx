import * as React from "react"
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "group/badge inline-flex h-7 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-sm font-medium whitespace-nowrap transition-all focus-visible:border-sh-ring focus-visible:ring-[3px] focus-visible:ring-sh-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-sh-destructive aria-invalid:ring-sh-destructive/20 dark:aria-invalid:ring-sh-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-sh-primary text-sh-primary-foreground [a]:hover:bg-sh-primary/80",
        secondary:
          "bg-sh-secondary text-sh-secondary-foreground [a]:hover:bg-sh-secondary/80",
        destructive:
          "bg-sh-destructive/10 text-sh-destructive focus-visible:ring-sh-destructive/20 dark:bg-sh-destructive/20 dark:focus-visible:ring-sh-destructive/40 [a]:hover:bg-sh-destructive/20",
        outline:
          "border-sh-border text-sh-foreground [a]:hover:bg-sh-muted [a]:hover:text-sh-muted-foreground",
        ghost:
          "hover:bg-sh-muted hover:text-sh-muted-foreground dark:hover:bg-sh-muted/50",
        link: "text-sh-primary underline-offset-4 hover:underline",
        red: "border-[var(--status-red)] bg-[var(--status-red-dim)] text-[var(--status-red)]",
        teal: "border-[var(--status-teal)] bg-[var(--status-teal-dim)] text-[var(--status-teal)]",
        amber: "border-[var(--status-amber)] bg-[var(--status-amber-dim)] text-[var(--status-amber)]",
        gray: "border-sh-border bg-sh-muted text-sh-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
