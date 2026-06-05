import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-line1 bg-sunken px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 shadow-xs transition-[background,border,box-shadow] duration-120 ease-smooth focus-visible:border-transparent focus-visible:bg-surface focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";
