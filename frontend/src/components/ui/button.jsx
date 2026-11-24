import * as React from "react"
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-sh-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-sh-ring focus-visible:ring-3 focus-visible:ring-sh-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-sh-destructive aria-invalid:ring-3 aria-invalid:ring-sh-destructive/20 dark:aria-invalid:border-sh-destructive/50 dark:aria-invalid:ring-sh-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-sh-primary text-sh-primary-foreground hover:bg-sh-primary/80",
        outline:
          "border-sh-border bg-sh-background hover:bg-sh-muted hover:text-sh-foreground aria-expanded:bg-sh-muted aria-expanded:text-sh-foreground dark:border-sh-input dark:bg-sh-input/30 dark:hover:bg-sh-input/50",
        secondary:
          "bg-sh-secondary text-sh-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-sh-secondary aria-expanded:text-sh-secondary-foreground",
        ghost:
          "hover:bg-sh-muted hover:text-sh-foreground aria-expanded:bg-sh-muted aria-expanded:text-sh-foreground dark:hover:bg-sh-muted/50",
        destructive:
          "bg-sh-destructive/10 text-sh-destructive hover:bg-sh-destructive/20 focus-visible:border-sh-destructive/40 focus-visible:ring-sh-destructive/20 dark:bg-sh-destructive/20 dark:hover:bg-sh-destructive/30 dark:focus-visible:ring-sh-destructive/40",
        link: "text-sh-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-sh-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-sh-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-sh-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-sh-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
