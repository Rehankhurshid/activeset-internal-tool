/**
 * The shape of the motion: hold, one eased scroll of most of a screen, hold,
 * and again, to the bottom. Not one continuous glide — each section sits still
 * long enough to be read, and scroll-triggered animations get to play.
 */

export interface ScrollTiming {
  fps: number;
  /** Still at the top before the first scroll. */
  introMs: number;
  /** One scroll, start to stop. */
  scrollMs: number;
  /** Still after each scroll. */
  holdMs: number;
  /** Still at the bottom. */
  outroMs: number;
  /** How far one scroll goes, as a share of the viewport height. */
  step: number;
  /** A ceiling, so a never-ending page does not record forever. */
  maxScrolls: number;
}

export const DEFAULT_SCROLL_TIMING: ScrollTiming = {
  fps: 60,
  introMs: 1500,
  scrollMs: 900,
  holdMs: 1200,
  outroMs: 1200,
  step: 0.85,
  maxScrolls: 40,
};

/** Ease in and out (cubic): starts and stops gently, like a hand on a trackpad. */
export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

export function framesFor(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

/** Where the next scroll stops: one step on, but never past the bottom. */
export function nextStop(from: number, viewportHeight: number, maxScroll: number, step: number): number {
  return Math.min(Math.max(0, maxScroll), from + Math.round(viewportHeight * step));
}

/** The scroll position on each frame of one scroll from `from` to `to`, ending exactly on `to`. */
export function scrollFrames(from: number, to: number, frames: number): number[] {
  return Array.from({ length: frames }, (_, i) => Math.round(from + (to - from) * easeInOutCubic((i + 1) / frames)));
}
