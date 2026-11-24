import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  SITES, TICK_MS, findSite, nextAlertState, severityOf, simulateHistory, simulateReading, waterLevelCm,
  type Reading, type Severity,
} from '@floodwatch/shared';

// No server configured in a production build means a static deploy: run the simulator in the browser.
const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '');

export interface Alert {
  id: string;
  siteId: string;
  severity: Severity;
  levelCm: number;
  ts: number;
}

const snapshot = (ts: number) => Object.fromEntries(SITES.map((s) => [s.id, simulateReading(s, ts)]));

export function levelOf(r: Reading) {
  return waterLevelCm(findSite(r.siteId)!, r.distanceCm);
}

export function useFloodData() {
  const [readings, setReadings] = useState<Record<string, Reading>>(() => snapshot(Date.now()));
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [live, setLive] = useState(false);
  const latest = useRef(readings);
  // Highest severity already alerted per site; starts at the current state so page load doesn't alert.
  const alerted = useRef<Record<string, Severity>>(
    Object.fromEntries(Object.values(readings).map((r) => [r.siteId, severityOf(levelOf(r))])),
  );

  const apply = useCallback((batch: Reading[]) => {
    const next = { ...latest.current };
    const raised: Alert[] = [];
    for (const r of batch) {
      if (!findSite(r.siteId)) continue;
      next[r.siteId] = r;
      const levelCm = levelOf(r);
      const state = nextAlertState(alerted.current[r.siteId] ?? 'normal', levelCm);
      alerted.current[r.siteId] = state.alerted;
      if (state.raised) raised.push({ id: `${r.siteId}-${r.ts}`, siteId: r.siteId, severity: state.raised, levelCm, ts: r.ts });
    }
    latest.current = next;
    setReadings(next);
    if (raised.length) setAlerts((a) => [...raised, ...a].slice(0, 50));
  }, []);

  useEffect(() => {
    const tickLocally = () => apply(SITES.map((s) => simulateReading(s, Date.now())));
    let timer = setInterval(tickLocally, TICK_MS);
    if (!SERVER_URL) return () => clearInterval(timer);

    const socket = io(SERVER_URL);
    socket.on('connect', () => {
      clearInterval(timer);
      setLive(true);
    });
    socket.on('disconnect', () => {
      clearInterval(timer);
      timer = setInterval(tickLocally, TICK_MS);
      setLive(false);
    });
    socket.on('reading', (r: Reading) => apply([r]));
    return () => {
      clearInterval(timer);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [apply]);

  return { readings, alerts, live };
}

export async function loadHistory(siteId: string, live: boolean): Promise<Reading[]> {
  if (live) {
    try {
      const res = await fetch(`${SERVER_URL}/api/sites/${siteId}/history?minutes=30`);
      if (res.ok) return await res.json();
    } catch {
      // fall through to the local simulator
    }
  }
  return simulateHistory(findSite(siteId)!, Date.now(), 30);
}
