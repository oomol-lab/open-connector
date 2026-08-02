/**
 * A one-slot promise cache scoped to a Workers isolate.
 *
 * An isolate is reused across many requests, so boot work is memoized in module state. Memoizing a
 * *rejected* promise turns one transient failure into sustained errors until the isolate is
 * recycled, with no self-healing in between. Each slot therefore drops itself as soon as its
 * promise rejects, so the next request retries, while concurrent callers still share the in-flight
 * promise and do the work once.
 */
export class IsolatePromiseCache<T> {
  private entry: IsolateCacheEntry<T> | undefined;

  /**
   * Return the cached promise for `key`, creating and memoizing it when the slot holds another key
   * or is empty. `create` runs synchronously on a miss, so a burst of concurrent callers arriving
   * before the first one settles all share the same promise.
   */
  get(key: string, create: () => Promise<T>): Promise<T> {
    if (this.entry?.key === key) {
      return this.entry.value;
    }

    const entry: IsolateCacheEntry<T> = { key, value: create() };
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

interface IsolateCacheEntry<T> {
  key: string;
  value: Promise<T>;
}
