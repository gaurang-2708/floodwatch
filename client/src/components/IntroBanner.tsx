import { MousePointerClick, Radio, X } from 'lucide-react';

export function IntroBanner({ onClose }: { onClose: () => void }) {
  return (
    <section aria-label="About this dashboard" className="card gold-rule relative animate-fade-in p-5 pr-14 sm:p-7 sm:pr-16">
      <p className="label-lux text-gold">About this dashboard</p>
      <h2 className="mt-2 max-w-3xl font-display text-2xl font-medium leading-snug tracking-tight sm:text-[28px]">
        A live control room for the city&rsquo;s flood-prone roads.
      </h2>
      <p className="mt-2 max-w-3xl leading-relaxed text-muted-dark">
        25 sensors above low-lying roads measure how deep the water is, every 3 seconds. Each road is graded from Normal to Critical, so
        anyone can tell at a glance whether it is safe to drive.
      </p>
      <ul className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-sm text-ivory/90">
        <li className="flex items-center gap-2.5">
          <MousePointerClick className="h-4 w-4 text-gold" strokeWidth={1.5} aria-hidden />
          Click any red dot to see why the road is closed
        </li>
        <li className="flex items-center gap-2.5">
          <Radio className="h-4 w-4 text-gold" strokeWidth={1.5} aria-hidden />
          New warnings appear in the alert feed as water rises
        </li>
      </ul>
      <button onClick={onClose} className="btn-ghost absolute right-3 top-3 border-transparent" aria-label="Dismiss introduction">
        <X className="h-5 w-5" strokeWidth={1.5} aria-hidden />
      </button>
    </section>
  );
}
