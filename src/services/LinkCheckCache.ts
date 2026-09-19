/**
 * A small TTL cache with in-flight de-duplication, shared by the link checker.
 *
 * Why it exists: a site's nav and footer put the same forty-odd external links
 * on every page, so a 40-page scan used to hit LinkedIn 40 times from one
 * lambda and get rate-limited for its trouble. Verdicts memoised here for a few
 * minutes mean page two onward pays nothing for links page one already settled.
 *
 * The store is module-level state that lives as long as the lambda instance
 * does. Nothing is persisted; a cold start simply begins empty. It is generic so
 * that it knows nothing about link verdicts and cannot form an import cycle with
 * the checker.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<T>>();

  constructor(private readonly maxEntries: number) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: string, now: number = Date.now()): T | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    // Re-insert so Map iteration order doubles as least-recently-used order.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }

  set(key: string, value: T, ttlMs: number, now: number = Date.now()): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: now + ttlMs });
    // Evict from the front, which after the re-insert-on-read above is the
    // least recently used entry. Bounded so a long-lived instance scanning many
    // sites cannot grow without limit.
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  /**
   * Return the cached value or compute it, with concurrent callers for the same
   * key sharing one computation. Two pages checked at once in the same lambda
   * should not both fetch the same footer link. `ttlFor` lets the caller keep
   * transient failures for less time than settled answers.
   */
  async resolve(
    key: string,
    compute: () => Promise<T>,
    ttlFor: (value: T) => number
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const promise = compute()
      .then((value) => {
        this.set(key, value, ttlFor(value));
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, promise);
    return promise;
  }

  clear(): void {
    this.entries.clear();
    this.inflight.clear();
  }
}
