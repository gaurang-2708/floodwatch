import { SITES, ZONES, type Site } from './sites';

export * from './sites';

/** What a sensor actually reports. Level and severity are always derived from it. */
export interface Reading {
  siteId: string;
  ts: number;
  distanceCm: number;
}

export type Severity = 'normal' | 'watch' | 'warning' | 'critical';

export const SEVERITY_ORDER: Severity[] = ['normal', 'watch', 'warning', 'critical'];

export const SEVERITIES: Record<Severity, { label: string; color: string; minLevelCm: number; roadImpact: string }> = {
  normal: { label: 'Normal', color: '#6BAA88', minLevelCm: 0, roadImpact: 'Passable' },
  watch: { label: 'Watch', color: '#D8C47A', minLevelCm: 15, roadImpact: 'Passable with caution' },
  warning: { label: 'Warning', color: '#DA8447', minLevelCm: 30, roadImpact: 'Avoid small vehicles' },
  critical: { label: 'Critical', color: '#E2585D', minLevelCm: 50, roadImpact: 'Closed' },
};

export const TICK_MS = 3000;

export function waterLevelCm(site: Site, distanceCm: number): number {
  return Math.max(0, Math.round((site.mountHeightCm - distanceCm) * 10) / 10);
}

export function severityOf(levelCm: number): Severity {
  return SEVERITY_ORDER.findLast((s) => levelCm >= SEVERITIES[s].minLevelCm) ?? 'normal';
}

export const severityRank = (s: Severity) => SEVERITY_ORDER.indexOf(s);

/** How far (cm) a level must fall below a threshold before that alert can fire again. */
export const ALERT_HYSTERESIS_CM = 5;

/**
 * Alert rule for one site. `alerted` is the highest severity already alerted on.
 * A rise into Warning/Critical above it raises an alert; it only re-arms once the level
 * drops ALERT_HYSTERESIS_CM below the threshold, so readings hovering at a line don't spam.
 */
export function nextAlertState(alerted: Severity, levelCm: number): { alerted: Severity; raised?: Severity } {
  const current = severityOf(levelCm);
  if (severityRank(current) > severityRank(alerted) && severityRank(current) >= severityRank('warning')) {
    return { alerted: current, raised: current };
  }
  const rearmed = severityOf(levelCm + ALERT_HYSTERESIS_CM);
  return { alerted: severityRank(rearmed) < severityRank(alerted) ? rearmed : alerted };
}

// FNV-1a: a stable pseudo-random number in [0, 1) from a string.
function hash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
}

const STORM_PERIOD_MS = 15 * 60_000;

/**
 * Where each site sits in the storm cycle (0–1). Zones take turns a quarter cycle apart and
 * sites are spread evenly inside their zone's quarter, so some roads are always flooding
 * while others are dry, instead of the whole city peaking (or drying out) together.
 */
const STORM_PHASE = new Map(
  ZONES.flatMap((zone, z) => {
    const inZone = SITES.filter((s) => s.zone === zone);
    return inZone.map((s, i) => [s.id, (z + (i + 0.5) / inZone.length) / ZONES.length] as const);
  }),
);

/**
 * Deterministic reading for a site at a time: the same (site, time) always gives the
 * same value, so server and browser agree without sharing any state.
 */
export function simulateReading(site: Site, ts: number): Reading {
  const t = Math.floor(ts / TICK_MS) * TICK_MS;
  const phase = STORM_PHASE.get(site.id) ?? hash01(site.id);
  const exposure = 0.4 + hash01(`${site.id}:exposure`); // how flood-prone the spot is
  const storm = Math.max(0, Math.sin(2 * Math.PI * (t / STORM_PERIOD_MS + phase)));
  const ripple = 2 * Math.sin(t / 47_000 + phase * 10);
  const noise = (hash01(`${site.id}:${t}`) - 0.5) * 1.5;
  const levelCm = Math.max(0, 3 + 75 * exposure * storm ** 2 + ripple + noise);
  return { siteId: site.id, ts: t, distanceCm: Math.round((site.mountHeightCm - levelCm) * 10) / 10 };
}

export function simulateHistory(site: Site, endTs: number, minutes: number, stepMs = 15_000): Reading[] {
  const end = Math.floor(endTs / stepMs) * stepMs;
  const readings: Reading[] = [];
  for (let t = end - minutes * 60_000; t <= end; t += stepMs) readings.push(simulateReading(site, t));
  return readings;
}
