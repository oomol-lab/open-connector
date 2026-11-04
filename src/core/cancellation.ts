/** Stop a caller's wait without cancelling shared work; optionally handle its late result. */
export function waitForSignal<T>(
  pending: Promise<T>,
  signal: AbortSignal | undefined,
  onLate?: (value: T) => void,
): Promise<T> {
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    let cancelled = false;
    const abort = (): void => {
      cancelled = true;
      reject(signal.reason);
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    void pending.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        if (cancelled) onLate?.(value);
        else resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}
