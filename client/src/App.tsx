import { useCallback, useMemo, useState } from 'react';
import { ArrowUpDown, BellRing, ListOrdered } from 'lucide-react';
import { SITES, findSite, ZONES, severityOf, severityRank, type Severity, type Zone } from '@floodwatch/shared';
import { AlertFeed } from './components/AlertFeed';
import { Header } from './components/Header';
import { IntroBanner } from './components/IntroBanner';
import { KpiCards } from './components/KpiCards';
import { SiteDetail } from './components/SiteDetail';
import { SiteList } from './components/SiteList';
import { SiteMap } from './components/SiteMap';
import { Panel } from './components/ui';
import { levelOf, useFloodData } from './useFloodData';

const INTRO_KEY = 'floodwatch:intro-dismissed';

export default function App() {
  const { readings, alerts, live } = useFloodData();
  const [zone, setZone] = useState<Zone | 'All'>('All');
  const [sortBy, setSortBy] = useState<'severity' | 'name'>('severity');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(() => readFlag(INTRO_KEY) !== '1');
  const closeDetail = useCallback(() => setSelectedId(null), []);

  const sites = useMemo(
    () => SITES.map((site) => {
      const levelCm = levelOf(readings[site.id]);
      return { site, levelCm, severity: severityOf(levelCm) };
    }),
    [readings],
  );

  const counts = { normal: 0, watch: 0, warning: 0, critical: 0 } as Record<Severity, number>;
  for (const s of sites) counts[s.severity]++;

  const visible = sites
    .filter((s) => zone === 'All' || s.site.zone === zone)
    .sort((a, b) => sortBy === 'name' ? a.site.name.localeCompare(b.site.name) : severityRank(b.severity) - severityRank(a.severity) || b.levelCm - a.levelCm);

  const selected = selectedId ? findSite(selectedId) : undefined;

  const dismissIntro = () => {
    setShowIntro(false);
    writeFlag(INTRO_KEY, '1');
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-4 py-5 sm:space-y-6 sm:px-8 sm:py-7">
      <Header live={live} onAbout={() => setShowIntro(true)} />
      {showIntro && <IntroBanner onClose={dismissIntro} />}
      <KpiCards counts={counts} />

      <div className="grid gap-4 sm:gap-5 lg:h-[max(560px,calc(100dvh-270px))] lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="card h-[56vh] min-h-[340px] overflow-hidden lg:h-full">
          <SiteMap sites={visible} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        <div className="grid min-h-0 gap-4 sm:gap-5 lg:grid-rows-[minmax(0,1fr)_260px]">
          <Panel
            title={`Roads (${visible.length})`}
            icon={ListOrdered}
            action={
              <button
                onClick={() => setSortBy(sortBy === 'severity' ? 'name' : 'severity')}
                className="flex min-h-9 items-center gap-1.5 rounded-md border border-stone/70 px-2.5 text-xs font-medium text-muted-dark transition-colors duration-200 hover:border-gold/60 hover:text-gold"
              >
                <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                {sortBy === 'severity' ? 'Worst first' : 'A to Z'}
              </button>
            }
          >
            <div className="flex gap-1.5 overflow-x-auto border-b border-stone/50 px-5 py-2.5" role="group" aria-label="Filter by zone">
              {(['All', ...ZONES] as const).map((z) => (
                <button
                  key={z}
                  onClick={() => setZone(z)}
                  aria-pressed={zone === z}
                  className={`min-h-8 shrink-0 rounded-md border px-3 text-xs font-medium transition-colors duration-200 ${zone === z ? 'border-gold bg-gold text-obsidian' : 'border-stone/70 text-muted-dark hover:border-gold/60 hover:text-ivory'}`}
                >
                  {z === 'All' ? 'All zones' : z}
                </button>
              ))}
            </div>
            <div className="max-h-[420px] overflow-y-auto lg:max-h-none lg:flex-1">
              <SiteList sites={visible} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
          </Panel>

          <Panel title="Alert feed" icon={BellRing} action={alerts.length > 0 && <span className="num text-xs text-muted-dark">{alerts.length} this session</span>}>
            <div className="max-h-72 overflow-y-auto lg:max-h-none lg:flex-1">
              <AlertFeed alerts={alerts} onSelect={setSelectedId} />
            </div>
          </Panel>
        </div>
      </div>

      <footer className="label-lux flex items-center justify-center gap-3 pb-2 text-center">
        <span className="h-px w-10 bg-gold/40" aria-hidden />
        Portfolio demo · all sites and readings are simulated
        <span className="h-px w-10 bg-gold/40" aria-hidden />
      </footer>

      {selected && <SiteDetail key={selected.id} site={selected} reading={readings[selected.id]} live={live} onClose={closeDetail} />}
    </div>
  );
}

// Storage can be unavailable (private mode, blocked cookies); the intro then simply shows again.
function readFlag(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore: see readFlag
  }
}
