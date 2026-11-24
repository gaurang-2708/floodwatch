import { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { Siren } from 'lucide-react';
import { SEVERITIES, SEVERITY_ORDER, SITES, severityOf, simulateReading, waterLevelCm, type Severity } from '@floodwatch/shared';
import { SEVERITY_ICONS } from './ui';

const PLAIN_LABEL: Record<Severity, string> = {
  critical: 'Road closed',
  warning: 'Avoid small vehicles',
  watch: 'Drive with caution',
  normal: 'Clear',
};

const TREND_MINUTES = 30;

export function KpiCards({ counts }: { counts: Record<Severity, number> }) {
  const trend = useSeverityTrend();
  const affected = counts.warning + counts.critical;

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
      {[...SEVERITY_ORDER].reverse().map((s) => {
        const { label, color } = SEVERITIES[s];
        const Icon = SEVERITY_ICONS[s];
        return (
          <div key={s} className="card animate-fade-in p-4 sm:p-5">
            <div className="label-lux flex items-center gap-2" style={{ color }}>
              <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
              {label}
            </div>
            <div className="mt-3 flex items-end justify-between gap-2">
              <p className="num text-4xl font-light leading-none tracking-tight sm:text-5xl">{counts[s]}</p>
              <Sparkline data={trend} dataKey={s} color={color} />
            </div>
            <p className="mt-3 border-t border-stone/50 pt-2.5 text-[13px] text-muted-dark">{PLAIN_LABEL[s]}</p>
          </div>
        );
      })}

      <div className="card gold-rule col-span-2 animate-fade-in border-gold/40 bg-gradient-to-b from-gold/[0.07] to-onyx p-4 sm:p-5 md:col-span-1">
        <div className="label-lux flex items-center gap-2 text-gold">
          <Siren className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          Roads affected now
        </div>
        <p className="num mt-3 font-display text-4xl font-medium leading-none sm:text-5xl">
          {affected}
          <span className="font-sans text-xl font-light text-muted-dark"> / {SITES.length}</span>
        </p>
        <div className="mt-4 flex h-1 gap-px overflow-hidden rounded-full bg-graphite" role="img" aria-label={SEVERITY_ORDER.map((s) => `${counts[s]} ${SEVERITIES[s].label}`).join(', ')}>
          {SEVERITY_ORDER.map((s) => (
            <span key={s} className="h-full transition-[width] duration-700" style={{ width: `${(counts[s] / SITES.length) * 100}%`, backgroundColor: SEVERITIES[s].color }} />
          ))}
        </div>
        <p className="mt-2.5 text-[13px] text-muted-dark">at Warning or Critical</p>
      </div>
    </div>
  );
}

function Sparkline({ data, dataKey, color }: { data: Record<Severity, number>[]; dataKey: Severity; color: string }) {
  return (
    <div className="h-8 w-20 sm:h-10 sm:w-24" aria-hidden title={`Last ${TREND_MINUTES} minutes`}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <YAxis hide domain={[0, 'dataMax + 1']} />
          <Area dataKey={dataKey} type="monotone" stroke={color} strokeWidth={1.25} fill={color} fillOpacity={0.06} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Sites per severity for each of the last 30 minutes. The simulator is a pure function of
 * (site, time) shared with the server, so past counts can be recomputed here in both modes.
 */
function useSeverityTrend() {
  const minute = Math.floor(Date.now() / 60_000);
  return useMemo(() => {
    const points: Record<Severity, number>[] = [];
    for (let m = minute - TREND_MINUTES; m <= minute; m++) {
      const count = { normal: 0, watch: 0, warning: 0, critical: 0 };
      for (const site of SITES) count[severityOf(waterLevelCm(site, simulateReading(site, m * 60_000).distanceCm))]++;
      points.push(count);
    }
    return points;
  }, [minute]);
}
