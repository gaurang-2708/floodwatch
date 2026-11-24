import { describe, expect, it } from 'vitest';
import { SITES, SEVERITY_ORDER, findSite, nextAlertState, severityOf, simulateHistory, simulateReading, waterLevelCm, type Severity } from './index';

const site = SITES[0];
const t0 = Date.UTC(2026, 6, 15, 10, 0, 0);

describe('waterLevelCm', () => {
  it('is mount height minus measured distance', () => {
    expect(waterLevelCm({ ...site, mountHeightCm: 300 }, 262.5)).toBe(37.5);
  });

  it('never goes negative when the road is dry', () => {
    expect(waterLevelCm({ ...site, mountHeightCm: 300 }, 305)).toBe(0);
  });
});

describe('severityOf', () => {
  it.each([
    [0, 'normal'],
    [14.9, 'normal'],
    [15, 'watch'],
    [29.9, 'watch'],
    [30, 'warning'],
    [50, 'critical'],
    [120, 'critical'],
  ])('%d cm is %s', (level, expected) => {
    expect(severityOf(level)).toBe(expected);
  });
});

describe('simulator', () => {
  it('is deterministic for the same site and time', () => {
    expect(simulateReading(site, t0)).toEqual(simulateReading(site, t0));
    expect(simulateReading(site, t0 + 1000)).toEqual(simulateReading(site, t0)); // same 3 s tick
  });

  it('gives different sites different readings', () => {
    expect(simulateReading(SITES[1], t0).distanceCm).not.toBe(simulateReading(site, t0).distanceCm);
  });

  it('stays physically valid and reaches every severity over a day', () => {
    const seen = new Set<Severity>();
    for (const s of SITES) {
      for (const r of simulateHistory(s, t0, 24 * 60, 60_000)) {
        expect(r.distanceCm).toBeGreaterThan(0);
        expect(r.distanceCm).toBeLessThanOrEqual(s.mountHeightCm);
        seen.add(severityOf(waterLevelCm(s, r.distanceCm)));
      }
    }
    expect([...seen].sort()).toEqual([...SEVERITY_ORDER].sort());
  });

  it('always has some roads flooded, but never the whole city', () => {
    for (let t = t0; t < t0 + 2 * 60 * 60_000; t += 10_000) {
      const severities = SITES.map((s) => severityOf(waterLevelCm(s, simulateReading(s, t).distanceCm)));
      const affected = severities.filter((sev) => sev === 'warning' || sev === 'critical').length;
      expect(affected).toBeGreaterThanOrEqual(1);
      expect(affected).toBeLessThan(SITES.length / 2);
    }
  });

  it('builds an ordered history ending at the requested time', () => {
    const h = simulateHistory(site, t0, 30);
    expect(h).toHaveLength(121); // 30 min at 15 s steps, inclusive
    expect(h.at(-1)!.ts).toBe(t0);
    expect(h.every((r, i) => i === 0 || r.ts > h[i - 1].ts)).toBe(true);
  });
});

describe('findSite', () => {
  it('ignores prototype keys', () => {
    expect(findSite('toString')).toBeUndefined();
    expect(findSite('__proto__')).toBeUndefined();
    expect(findSite(site.id)).toBe(site);
  });
});

describe('nextAlertState', () => {
  it('alerts on the way up and re-arms only after falling past the hysteresis band', () => {
    const raised: (string | undefined)[] = [];
    let alerted = severityOf(10);
    for (const level of [10, 31, 29, 31, 52, 47, 51, 24, 30]) {
      const next = nextAlertState(alerted, level);
      alerted = next.alerted;
      raised.push(next.raised);
    }
    // 31 warns; 29→31 hovers (no repeat); 52 critical; 47→51 hovers; 24 re-arms so 30 warns again
    expect(raised).toEqual([undefined, 'warning', undefined, undefined, 'critical', undefined, undefined, undefined, 'warning']);
  });

  it('never alerts for Watch', () => {
    expect(nextAlertState('normal', 20).raised).toBeUndefined();
  });
});
