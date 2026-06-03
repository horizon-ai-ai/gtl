import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium shadow-xs transition-[transform,background,border,box-shadow,color] duration-120 ease-snap hover:-translate-y-px active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:translate-y-0 disabled:scale-100 disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-ink-900 text-surface hover:bg-ink-700 hover:shadow-sm",
        outline: "border border-line1 bg-surface text-ink-700 hover:border-line2 hover:bg-hover hover:text-ink-900 hover:shadow-sm",
        ghost: "bg-transparent text-ink-700 shadow-none hover:bg-hover hover:text-ink-900",
        destructive: "bg-err-500 text-[var(--on-accent)] hover:bg-err-500 hover:shadow-sm",
        link: "bg-transparent text-accent-600 shadow-none underline-offset-4 hover:text-accent-500 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-md px-8",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
