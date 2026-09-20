import type { AnchorHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const base =
  "inline-flex items-center justify-center no-underline transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97]";

const variants = {
  primary: "font-semibold text-surface-0 bg-ember hover:bg-[#FFB855] hover:text-surface-0",
  secondary:
    "font-medium text-text-primary border border-white/16 hover:border-white/30 hover:bg-white/5 hover:text-text-primary",
  neutral:
    "font-medium text-text-primary bg-white/10 border border-white/10 hover:bg-white/15 hover:text-text-primary",
} as const;

interface ButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: keyof typeof variants;
}

export function Button({ variant = "primary", className, children, ...props }: ButtonProps) {
  return (
    <a className={cn(base, variants[variant], className)} {...props}>
      {children}
    </a>
  );
}
