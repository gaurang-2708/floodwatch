import type { ReactNode } from 'react';
import { CircleCheck, Eye, OctagonX, TriangleExclamationPoint, type LucideIcon } from 'lucide-react';
import { SEVERITIES, SEVERITY_ORDER, type Severity } from '@floodwatch/shared';

export const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const SEVERITY_ICONS: Record<Severity, LucideIcon> = {
  normal: CircleCheck,
  watch: Eye,
  warning: TriangleExclamationPoint,
  critical: OctagonX,
};

/** Depth at which the depth bar is full; everything above reads as "off the scale". */
export const SCALE_MAX_CM = 70;

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { label, color } = SEVERITIES[severity];
  const Icon = SEVERITY_ICONS[severity];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color, borderColor: `${color}55`, backgroundColor: `${color}14` }}>
      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
      {label}
    </span>
  );
}

/** Horizontal water-depth gauge with tick marks at each severity threshold. */
export function DepthBar({ levelCm, severity, className = '' }: { levelCm: number; severity: Severity; className?: string }) {
  const pct = Math.min(levelCm / SCALE_MAX_CM, 1) * 100;
  return (
    <div className={`relative h-1 rounded-full bg-graphite ${className}`} aria-hidden>
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: SEVERITIES[severity].color }} />
      {SEVERITY_ORDER.slice(1).map((s) => (
        <span key={s} className="absolute -top-1 h-3 w-px bg-muted-dark/40" style={{ left: `${(SEVERITIES[s].minLevelCm / SCALE_MAX_CM) * 100}%` }} />
      ))}
    </div>
  );
}

export function Panel({ title, icon: Icon, action, children, className = '' }: { title: string; icon: LucideIcon; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card flex min-h-0 flex-col overflow-hidden ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gold/25 px-5 py-3">
        <h2 className="label-lux flex items-center gap-2.5 text-ivory">
          <Icon className="h-4 w-4 text-gold" strokeWidth={1.5} aria-hidden />
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}
