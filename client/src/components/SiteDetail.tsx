import { useEffect, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { X } from 'lucide-react';
import { SEVERITIES, SEVERITY_ORDER, severityOf, waterLevelCm, type Reading, type Severity, type Site } from '@floodwatch/shared';
import { loadHistory } from '../useFloodData';
import { DepthBar, SEVERITY_ICONS, SeverityBadge, formatTime } from './ui';

const WINDOW_MS = 30 * 60_000;
const hhmm = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** One plain sentence answering "why is this road coloured like this?". */
function explain(severity: Severity): string {
  const at = (s: Severity) => `${SEVERITIES[s].minLevelCm} cm`;
  switch (severity) {
    case 'critical': return `Water is deeper than ${at('critical')}, so the road is closed to all traffic.`;
    case 'warning': return `Water is deeper than ${at('warning')}. Cars and two-wheelers should avoid this road.`;
    case 'watch': return `Water is collecting (over ${at('watch')}). Still passable, but drive with caution.`;
    case 'normal': return `Little or no water on the road (under ${at('watch')}). Traffic moves normally.`;
  }
}

interface Props {
  site: Site;
  reading: Reading;
  live: boolean;
  onClose: () => void;
}

export function SiteDetail({ site, reading, live, onClose }: Props) {
  const [points, setPoints] = useState<Reading[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadHistory(site.id, live).then((h) => !cancelled && setPoints(h));
    return () => {
      cancelled = true;
    };
  }, [site.id, live]);

  useEffect(() => {
    setPoints((p) => (!p.length || p.at(-1)!.ts >= reading.ts ? p : [...p.filter((x) => x.ts > reading.ts - WINDOW_MS), reading]));
  }, [reading]);

  useEffect(() => closeRef.current?.focus(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const levelCm = waterLevelCm(site, reading.distanceCm);
  const severity = severityOf(levelCm);
  const { color } = SEVERITIES[severity];
  const Icon = SEVERITY_ICONS[severity];
  const data = points.map((p) => ({ ts: p.ts, level: waterLevelCm(site, p.distanceCm) }));
  const yMax = Math.max(70, Math.ceil(Math.max(0, ...data.map((d) => d.level)) / 10) * 10);

  return (
    <>
      {/* Phone only: dim the page behind the bottom sheet. On wider screens the map stays usable. */}
      <button className="fixed inset-0 z-[1100] !mt-0 bg-obsidian/70 sm:hidden" onClick={onClose} aria-label="Close details" tabIndex={-1} />
      <aside
        role="dialog"
        aria-labelledby="site-detail-title"
        className="fixed inset-x-0 bottom-0 z-[1200] !mt-0 max-h-[88dvh] animate-sheet-up overflow-y-auto rounded-t-xl border border-stone bg-onyx shadow-2xl shadow-black/70 sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[460px] sm:animate-sheet-in sm:rounded-none sm:border-y-0 sm:border-r-0 sm:border-l-gold/30"
      >
        <header className="sticky top-0 z-10 flex items-start gap-3.5 border-b border-gold/30 bg-onyx/95 px-6 py-5 backdrop-blur">
          <span className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-md border" style={{ color, borderColor: `${color}55`, backgroundColor: `${color}12` }}>
            <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="label-lux">{site.zone} zone · sensor {site.id}</p>
            <h2 id="site-detail-title" className="mt-1 truncate font-display text-[26px] font-medium leading-tight tracking-tight">{site.name}</h2>
          </div>
          <button ref={closeRef} onClick={onClose} className="btn-ghost shrink-0" aria-label="Close details">
            <X className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          </button>
        </header>

        <div className="space-y-7 px-6 py-6">
          <section className="gold-rule rounded-lg border p-5" style={{ borderColor: `${color}44`, background: `linear-gradient(160deg, ${color}14, transparent 65%)` }}>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="label-lux">Water on the road</p>
                <p className="num mt-2 whitespace-nowrap text-5xl font-extralight leading-none tracking-tight sm:text-6xl">
                  {levelCm.toFixed(1)}
                  <span className="text-2xl font-light text-muted-dark"> cm</span>
                </p>
              </div>
              <SeverityBadge severity={severity} />
            </div>
            <DepthBar levelCm={levelCm} severity={severity} className="mt-4" />
            <p className="mt-4 leading-relaxed text-ivory/90">{explain(severity)}</p>
          </section>

          <section>
            <h3 className="label-lux mb-3 text-ivory">Water depth · last 30 minutes</h3>
            <div className="h-64 rounded-lg border border-stone/60 bg-obsidian/60 pb-2 pt-3">
              <ResponsiveContainer>
                <AreaChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: -12 }}>
                  <defs>
                    <linearGradient id="depth-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(var(--gold))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="rgb(var(--gold))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  {SEVERITY_ORDER.slice(1).map((s, i, arr) => (
                    <ReferenceArea
                      key={s}
                      y1={SEVERITIES[s].minLevelCm}
                      y2={i + 1 < arr.length ? SEVERITIES[arr[i + 1]].minLevelCm : yMax}
                      fill={SEVERITIES[s].color}
                      fillOpacity={0.06}
                      stroke={SEVERITIES[s].color}
                      strokeOpacity={0.3}
                      strokeDasharray="3 3"
                      label={{ value: SEVERITIES[s].label.toUpperCase(), position: 'insideTopLeft', fontSize: 10, fontWeight: 500, letterSpacing: 1.4, fill: SEVERITIES[s].color }}
                      ifOverflow="hidden"
                    />
                  ))}
                  <CartesianGrid stroke="rgb(var(--stone))" strokeOpacity={0.35} vertical={false} />
                  <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} tickFormatter={hhmm} tick={{ fontSize: 11, fill: 'rgb(var(--muted-dark))' }} stroke="rgb(var(--stone))" />
                  <YAxis domain={[0, yMax]} ticks={[0, ...SEVERITY_ORDER.slice(1).map((s) => SEVERITIES[s].minLevelCm), yMax]} unit=" cm" tick={{ fontSize: 11, fill: 'rgb(var(--muted-dark))' }} stroke="rgb(var(--stone))" width={64} />
                  <Tooltip
                    labelFormatter={(ts) => formatTime(Number(ts))}
                    formatter={(v) => [`${v} cm`, 'Water depth']}
                    contentStyle={{ background: 'rgb(var(--onyx))', border: '1px solid rgb(var(--gold) / 0.4)', borderRadius: 6 }}
                    labelStyle={{ color: 'rgb(var(--muted-dark))' }}
                    itemStyle={{ color: 'rgb(var(--ivory))' }}
                  />
                  <Area dataKey="level" type="monotone" stroke="rgb(var(--gold))" strokeWidth={1.5} fill="url(#depth-fill)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section>
            <h3 className="label-lux mb-3 text-ivory">How it is measured</h3>
            <p className="mb-4 text-sm leading-relaxed text-muted-dark">
              An ultrasonic sensor above the road measures its distance to the surface below. Depth is the sensor height minus that distance.
            </p>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Sensor height" value={`${site.mountHeightCm} cm`} />
              <Stat label="Distance to water" value={`${reading.distanceCm.toFixed(1)} cm`} />
              <Stat label="Last reading" value={formatTime(reading.ts)} />
            </dl>
          </section>
        </div>
      </aside>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-stone/60 px-2 py-3.5">
      <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-dark">{label}</dt>
      <dd className="num mt-1 whitespace-nowrap text-base font-light">{value}</dd>
    </div>
  );
}
