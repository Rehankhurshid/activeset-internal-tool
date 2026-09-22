'use client';

export type Phase = 'describing' | 'optimising';

/**
 * The image the worker is on, animated by what is happening to it: a scan
 * line while it is being described, a squeeze while it is being shrunk. A
 * progress bar says how far through a run is; this says which image, which is
 * what someone watching actually wants to know.
 */
export function WorkingThumb({ src, phase, size }: { src: string; phase: Phase; size: 'sm' | 'md' }) {
  return (
    <span
      className={`relative shrink-0 overflow-hidden rounded border border-primary/60 bg-background ${
        size === 'sm' ? 'h-7 w-7' : 'h-10 w-10'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className={`h-full w-full object-cover ${phase === 'optimising' ? 'animate-image-squeeze' : ''}`}
      />
      {phase === 'describing' && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-transparent via-primary/70 to-transparent animate-image-scan" />
      )}
    </span>
  );
}

