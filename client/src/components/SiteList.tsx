import { SEVERITIES, type Severity, type Site } from '@floodwatch/shared';
import { DepthBar, SEVERITY_ICONS } from './ui';

interface Props {
  sites: { site: Site; levelCm: number; severity: Severity }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function SiteList({ sites, selectedId, onSelect }: Props) {
  return (
    <ul className="divide-y divide-stone/40">
      {sites.map(({ site, levelCm, severity }) => {
        const { color, roadImpact } = SEVERITIES[severity];
        const Icon = SEVERITY_ICONS[severity];
        return (
          <li key={site.id}>
            <button
              onClick={() => onSelect(site.id)}
              aria-current={site.id === selectedId}
              className={`flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition-colors duration-200 hover:bg-graphite/60 ${site.id === selectedId ? 'bg-gold/[0.08] shadow-[inset_2px_0_0_rgb(var(--gold))]' : ''}`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} style={{ color }} aria-label={SEVERITIES[severity].label} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{site.name}</span>
                  <span className="num shrink-0 text-lg font-light">{levelCm.toFixed(1)}<span className="text-xs text-muted-dark"> cm</span></span>
                </span>
                <span className="block text-[13px] text-muted-dark">{site.zone} · <span style={{ color }}>{roadImpact}</span></span>
                <DepthBar levelCm={levelCm} severity={severity} className="mt-2" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
