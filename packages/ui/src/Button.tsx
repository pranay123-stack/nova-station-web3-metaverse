import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
  readonly icon?: ReactNode;
  readonly full?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-sky-500/15 border-sky-400/60 text-sky-100 hover:bg-sky-500/25 hover:border-sky-300 focus-visible:ring-sky-400',
  secondary:
    'bg-slate-800/60 border-slate-600/70 text-slate-200 hover:bg-slate-700/70 hover:border-slate-500 focus-visible:ring-slate-400',
  ghost:
    'bg-transparent border-transparent text-slate-300 hover:bg-slate-800/50 hover:text-slate-100 focus-visible:ring-slate-500',
  danger:
    'bg-rose-500/15 border-rose-400/60 text-rose-100 hover:bg-rose-500/25 hover:border-rose-300 focus-visible:ring-rose-400',
  success:
    'bg-emerald-500/15 border-emerald-400/60 text-emerald-100 hover:bg-emerald-500/25 hover:border-emerald-300 focus-visible:ring-emerald-400',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'text-[11px] px-2.5 py-1 gap-1.5',
  md: 'text-xs px-3.5 py-1.5 gap-2',
  lg: 'text-sm px-5 py-2.5 gap-2.5',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  full = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-sm border font-medium uppercase tracking-[0.14em]',
        'transition-colors duration-150 outline-none',
        'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
        'disabled:cursor-not-allowed disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        full && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
        />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
