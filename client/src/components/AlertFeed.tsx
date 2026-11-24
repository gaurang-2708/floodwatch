import { BellOff } from 'lucide-react';
import { SEVERITIES, findSite } from '@floodwatch/shared';
import type { Alert } from '../useFloodData';
import { SEVERITY_ICONS, formatTime } from './ui';

export function AlertFeed({ alerts, onSelect }: { alerts: Alert[]; onSelect: (id: string) => void }) {
  if (!alerts.length) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-8 text-center text-sm text-muted-dark">
        <span className="grid h-11 w-11 place-items-center rounded-full border border-gold/40 text-gold">
          <BellOff className="h-5 w-5" strokeWidth={1.5} aria-hidden />
        </span>
        All quiet so far. When water at a road rises to Warning or Critical, it appears here.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-stone/40" aria-live="polite">
      {alerts.map((a) => {
        const { label, color, roadImpact } = SEVERITIES[a.severity];
        const Icon = SEVERITY_ICONS[a.severity];
        return (
          <li key={a.id} className="animate-fade-in">
            <button onClick={() => onSelect(a.siteId)} className="flex w-full items-start gap-3.5 px-5 py-3.5 text-left transition-colors duration-200 hover:bg-graphite/60">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md border" style={{ color, borderColor: `${color}55`, backgroundColor: `${color}12` }}>
                <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{findSite(a.siteId)?.name}</span>
                <span className="block text-[13px] text-muted-dark">
                  Rose to <span style={{ color }}>{label}</span> at {a.levelCm.toFixed(1)} cm · {roadImpact}
                </span>
              </span>
              <time className="num shrink-0 text-xs text-muted-dark">{formatTime(a.ts)}</time>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
