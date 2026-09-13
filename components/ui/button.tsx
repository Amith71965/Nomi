import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap select-none transition-[background-color,color,box-shadow,transform,filter] duration-[var(--motion)] active:translate-y-px disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground shadow-soft hover:brightness-[1.06]",
  secondary: "bg-surface text-text border border-border-strong hover:bg-surface-2",
  quiet: "text-muted hover:text-text hover:bg-surface-2",
  danger: "bg-danger-soft text-danger hover:brightness-95",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-[15px]",
  lg: "h-12 px-5 text-base",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string): string {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  external = false,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
  external?: boolean;
}) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClasses(variant, size, className)}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={buttonClasses(variant, size, className)}>
      {children}
    </Link>
  );
}
