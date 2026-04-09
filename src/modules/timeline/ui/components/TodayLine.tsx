'use client';

import { format } from 'date-fns';

/**
 * A nerdy, animated "today" indicator for the Gantt chart.
 *
 * - Glowing pulsing core line
 * - Scanline particle that drifts down the line on a loop
 * - Date badge pinned to the top
 * - Subtle glow bloom behind the line
 */
export function TodayLine({ left }: { left: number }) {
    const today = new Date();
    const label = format(today, 'MMM d');
    const weekday = format(today, 'EEE');

    return (
        <div
            className="absolute top-0 bottom-0 z-20 pointer-events-none"
            style={{ left }}
        >
            {/* Glow bloom — wide, soft, behind everything */}
            <div className="absolute inset-y-0 -translate-x-1/2 w-5 bg-rose-500/[0.06] blur-sm animate-today-glow" />

            {/* Core line */}
            <div className="absolute inset-y-0 w-px -translate-x-1/2 bg-gradient-to-b from-rose-500 via-rose-400/80 to-rose-500/20" />

            {/* Scanline particle — drifts top→bottom in a loop */}
            <div className="absolute left-0 -translate-x-1/2 w-px h-16 bg-gradient-to-b from-transparent via-rose-300 to-transparent animate-today-scan opacity-70" />

            {/* Date badge — sits inside the ruler zone */}
            <div className="absolute top-1 left-0 -translate-x-1/2 flex flex-col items-center z-30">
                {/* Diamond pip */}
                <div className="w-2 h-2 rotate-45 bg-rose-500 ring-2 ring-rose-500/30 animate-today-pulse" />
                {/* Date tag */}
                <div className="mt-1 flex flex-col items-center rounded-md bg-rose-500 px-1.5 py-0.5 shadow-lg shadow-rose-500/25">
                    <span className="text-[8px] font-bold tracking-widest text-white/80 uppercase leading-none">
                        {weekday}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-white leading-tight">
                        {label}
                    </span>
                </div>
            </div>

            {/* Bottom terminal — pulsing dot */}
            <div className="absolute -bottom-1 left-0 -translate-x-1/2 flex flex-col items-center">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500/60 animate-today-pulse" />
            </div>
        </div>
    );
}
