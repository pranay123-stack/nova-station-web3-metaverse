import type { ReactNode } from 'react';
import { cn } from './cn.js';
import { RARITY_BORDER, RARITY_TEXT } from './tokens.js';

export interface BadgeProps {
  readonly children: ReactNode;
  readonly rarity?: string;
  readonly color?: string;
  readonly className?: string;
}

export function Badge({ children, rarity, color, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em]',
        rarity ? cn(RARITY_TEXT[rarity], RARITY_BORDER[rarity]) : 'border-slate-600/70 text-slate-300',
        className,
      )}
      style={color ? { color, borderColor: `${color}80` } : undefined}
    >
      {children}
    </span>
  );
}
