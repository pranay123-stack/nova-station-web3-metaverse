/**
 * Design tokens.
 *
 * The HUD and the 3D world share a palette, so a faction colour on a nameplate
 * is the same colour as the light in that faction's sector. Keeping them in one
 * module is what makes that true rather than approximately true.
 */
export const COLORS = {
  void: '#05070d',
  hull: '#0b1119',
  panel: '#111a26',
  panelRaised: '#16212f',
  line: '#233246',
  lineBright: '#3a5170',
  text: '#e7eefc',
  textMuted: '#8ea3bf',
  textFaint: '#5b7292',
  accent: '#38bdf8',
  accentWarm: '#fbbf24',
  success: '#4ade80',
  danger: '#f43f5e',
  epic: '#c084fc',
} as const;

export const AREA_COLORS: Record<string, string> = {
  habitat: '#5eead4',
  market: '#fbbf24',
  hangar: '#38bdf8',
  lab: '#a78bfa',
  command_deck: '#60a5fa',
  mining_bay: '#f97316',
  docking_bay: '#22d3ee',
  corridor: '#64748b',
};

export const RARITY_TEXT: Record<string, string> = {
  common: 'text-slate-300',
  uncommon: 'text-emerald-300',
  rare: 'text-sky-300',
  epic: 'text-violet-300',
  legendary: 'text-amber-300',
};

export const RARITY_BORDER: Record<string, string> = {
  common: 'border-slate-600/60',
  uncommon: 'border-emerald-500/50',
  rare: 'border-sky-500/50',
  epic: 'border-violet-500/50',
  legendary: 'border-amber-400/60',
};

export const RARITY_GLOW: Record<string, string> = {
  common: 'shadow-none',
  uncommon: 'shadow-[0_0_18px_-6px_rgba(52,211,153,0.7)]',
  rare: 'shadow-[0_0_18px_-6px_rgba(56,189,248,0.7)]',
  epic: 'shadow-[0_0_22px_-6px_rgba(192,132,252,0.8)]',
  legendary: 'shadow-[0_0_26px_-6px_rgba(251,191,36,0.9)]',
};
