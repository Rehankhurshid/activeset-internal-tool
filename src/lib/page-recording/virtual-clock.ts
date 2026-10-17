/**
 * A clock the recorder winds by hand.
 *
 * Capturing a frame takes 40–60 ms, so a real-time screen recording of a page
 * at 60 fps is not possible — it drops frames and stutters. Instead the page's
 * own idea of time is frozen once it has loaded, and moved on exactly 1/60 s
 * before each screenshot. Every animation then plays at its true speed in the
 * video however long the capture takes.
 *
 * What is wound: `requestAnimationFrame`, `performance.now`, `Date`, timers,
 * and every CSS animation and transition (paused and seeked through the Web
 * Animations API). What is not: the network, image decoding and `<video>`
 * elements, which run in real time — so lazy images arrive sooner, never later.
 *
 * Runs inside the page. It is passed to `evaluateOnNewDocument`, so it must not
 * close over anything in this module.
 */
export function installVirtualClock(): void {
  type Timer = { at: number; fn: () => void; every?: number };
  const w = window as unknown as Record<string, unknown>;

  const realRaf = window.requestAnimationFrame.bind(window);
  const realCancelRaf = window.cancelAnimationFrame.bind(window);
  const realSetTimeout = window.setTimeout.bind(window);
  const realClearTimeout = window.clearTimeout.bind(window);
  const realSetInterval = window.setInterval.bind(window);
  const realClearInterval = window.clearInterval.bind(window);
  const realPerfNow = performance.now.bind(performance);
  const realDateNow = Date.now;
  const RealDate = Date;

  let on = false;
  let now = 0;
  let dateBase = 0;
  let rafId = 0;
  let rafQueue = new Map<number, FrameRequestCallback>();
  let timerId = 1_000_000;
  const timers = new Map<number, Timer>();
  const born = new WeakMap<Animation, number>();

  window.requestAnimationFrame = (cb) => {
    if (!on) return realRaf(cb);
    const id = ++rafId;
    rafQueue.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (!rafQueue.delete(id)) realCancelRaf(id);
  };
  performance.now = () => (on ? now : realPerfNow());

  const vNow = () => (on ? dateBase + now : realDateNow());
  const VirtualDate = function (this: unknown, ...args: unknown[]) {
    if (!(this instanceof VirtualDate)) return new RealDate(vNow()).toString();
    return args.length ? new (RealDate as unknown as new (...a: unknown[]) => Date)(...args) : new RealDate(vNow());
  } as unknown as DateConstructor;
  Object.assign(VirtualDate, { now: vNow, parse: RealDate.parse, UTC: RealDate.UTC, prototype: RealDate.prototype });
  w.Date = VirtualDate;

  const call = (fn: unknown, args: unknown[]) => () => {
    if (typeof fn === 'function') fn(...args);
  };
  w.setTimeout = (fn: TimerHandler, ms?: number, ...args: unknown[]) => {
    if (!on) return realSetTimeout(fn, ms, ...args);
    const id = ++timerId;
    timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn: call(fn, args) });
    return id;
  };
  w.setInterval = (fn: TimerHandler, ms?: number, ...args: unknown[]) => {
    if (!on) return realSetInterval(fn, ms, ...args);
    const every = Math.max(4, Number(ms) || 0);
    const id = ++timerId;
    timers.set(id, { at: now + every, every, fn: call(fn, args) });
    return id;
  };
  w.clearTimeout = (id?: number) => {
    if (id === undefined || !timers.delete(id)) realClearTimeout(id);
  };
  w.clearInterval = (id?: number) => {
    if (id === undefined || !timers.delete(id)) realClearInterval(id);
  };

  const seekAnimations = () => {
    for (const animation of document.getAnimations()) {
      if (animation.playState === 'finished') continue;
      let start = born.get(animation);
      if (start === undefined) {
        start = now - (Number(animation.currentTime) || 0) / (animation.playbackRate || 1);
        born.set(animation, start);
        animation.pause();
      }
      animation.currentTime = (now - start) * (animation.playbackRate || 1);
    }
  };

  w.__recordingClock = {
    start() {
      if (on) return;
      dateBase = realDateNow() - realPerfNow();
      now = realPerfNow();
      on = true;
      seekAnimations();
    },
    step(ms: number) {
      const target = now + ms;
      // Timers in time order, so a 100 ms timeout still fires before a 200 ms one
      // that was set first. The guard stops a 0 ms interval spinning forever.
      for (let guard = 0; guard < 2000; guard++) {
        let next: [number, Timer] | undefined;
        for (const entry of timers) if (entry[1].at <= target && (!next || entry[1].at < next[1].at)) next = entry;
        if (!next) break;
        const [id, timer] = next;
        now = Math.max(now, timer.at);
        if (timer.every) timer.at += timer.every;
        else timers.delete(id);
        try {
          timer.fn();
        } catch (error) {
          console.error(error);
        }
      }
      now = target;
      const queue = rafQueue;
      rafQueue = new Map();
      for (const cb of queue.values()) {
        try {
          cb(now);
        } catch (error) {
          console.error(error);
        }
      }
      seekAnimations();
    },
  };
}

/**
 * tsx (esbuild with keepNames) rewrites named functions inside the clock to
 * call a `__name` helper that only exists in Node. In the page it does not, so
 * the clock would throw before installing. This defines it first.
 */
export const NAME_HELPER_SHIM = 'globalThis.__name = globalThis.__name || ((fn) => fn);';
