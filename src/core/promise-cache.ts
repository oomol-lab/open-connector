/**
 * A one-slot promise cache for work that should run once per process and be shared by every caller.
 *
 * Boot work such as loading a catalog, deriving a secret codec or importing an optional module is
 * memoized in module state so many requests pay for it once. Memoizing a *rejected* promise would
 * turn one transient failure into sustained errors for as long as the process (or Workers isolate)
 * lives, with no self-healing in between. Each slot therefore drops itself as soon as its promise
 * rejects, so the next caller retries, while concurrent callers still share the in-flight promise
 * and do the work once.
 */
export class PromiseCache<T> {
  private entry: PromiseCacheEntry<T> | undefined;

  /**
   * Return the cached promise for `key`, creating and memoizing it when the slot holds another key
   * or is empty. `create` runs synchronously on a miss, so a burst of concurrent callers arriving
   * before the first one settles all share the same promise.
   */
  get(key: string, create: () => Promise<T>): Promise<T> {
    if (this.entry?.key === key) {
      return this.entry.value;
    }

    const entry: PromiseCacheEntry<T> = { key, value: create() };
    this.entry = entry;
    // Evict only while this entry still owns the slot: a different key may have replaced it while
    // the promise was in flight, and that newer entry must survive.
    void entry.value.catch(() => {
      if (this.entry === entry) {
        this.entry = undefined;
      }
    });
    return entry.value;
  }
}

interface PromiseCacheEntry<T> {
  key: string;
  value: Promise<T>;
}
