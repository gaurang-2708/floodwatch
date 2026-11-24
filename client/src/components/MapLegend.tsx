import { SEVERITIES, SEVERITY_ORDER } from '@floodwatch/shared';

export function MapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-6 left-3 z-[1000] rounded-md border border-stone/70 bg-obsidian/85 px-4 py-3 text-xs backdrop-blur-sm">
      <p className="label-lux mb-2 text-gold">Water on the road</p>
      <ul className="space-y-1.5">
        {[...SEVERITY_ORDER].reverse().map((s) => {
          const { label, color, minLevelCm, roadImpact } = SEVERITIES[s];
          return (
            <li key={s} className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
              <span className="w-14 font-medium" style={{ color }}>{label}</span>
              <span className="num hidden text-muted-dark sm:inline">
                {minLevelCm > 0 ? `${minLevelCm}+ cm` : `< ${SEVERITIES.watch.minLevelCm} cm`} · {roadImpact}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
