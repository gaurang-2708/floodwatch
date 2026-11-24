import { useEffect, useState } from 'react';
import { Droplets, Info } from 'lucide-react';
import { formatTime } from './ui';

export function Header({ live, onAbout }: { live: boolean; onAbout: () => void }) {
  const now = useClock();
  return (
    <header className="flex items-center justify-between gap-3 border-b border-gold/30 pb-5">
      <div className="flex min-w-0 items-center gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-gold/50 text-gold">
          <Droplets className="h-5 w-5" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold leading-none tracking-tight sm:text-[28px]">FloodWatch</h1>
          <p className="label-lux mt-1.5 truncate"><span className="hidden sm:inline">Demo City · </span>Road flood monitoring</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-5">
        <div className="hidden text-right sm:block">
          <p className="label-lux">Local time</p>
          <time className="num block text-xl font-light tracking-wide text-ivory" dateTime={now.toISOString()}>
            {formatTime(now.getTime())}
          </time>
        </div>
        <span className="hidden h-9 w-px bg-stone sm:block" aria-hidden />
        <span
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-stone/70 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-ivory"
          title={live ? 'Readings streamed from the server over Socket.IO' : 'Server unreachable: the same simulator runs in your browser'}
        >
          <span className="relative flex h-1.5 w-1.5">
            {live && <span className="absolute inset-0 animate-ping rounded-full bg-gold" />}
            <span className={`relative h-1.5 w-1.5 rounded-full ${live ? 'bg-gold' : 'bg-muted-dark'}`} />
          </span>
          {live ? 'Live' : 'Offline demo'}
          <span className="hidden text-muted-dark md:inline">{live ? '· server stream' : '· local simulator'}</span>
        </span>
        <button onClick={onAbout} className="btn-ghost" aria-label="What is this dashboard?">
          <Info className="h-5 w-5" strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    </header>
  );
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
