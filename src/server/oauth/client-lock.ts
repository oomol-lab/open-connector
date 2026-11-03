/**
 * Per-client critical sections shared by consent approval and client deletion.
 *
 * Consent approval validates the client, then mints a runtime token and an
 * authorization code. Client deletion revokes tokens, deletes codes, and
 * removes the client row. Without serialization, a deletion landing between
 * approval's validation and its code insert leaves an exchangeable code for a
 * deleted client; if the same client id is later re-registered (CIMD ids are
 * derived from the document URL), that code could be redeemed without new
 * consent. Holding a per-client lock across both flows closes that window:
 * approval either sees the live client, or deletion completes first and
 * approval's re-check fails — never a code outliving its client.
 */
const locks = new Map<string, Promise<unknown>>();

/**
 * Run `fn` while holding the lock for `clientId`. Concurrent callers for the
 * same client queue behind each other in arrival order; different clients are
 * independent and never block each other.
 */
export async function withClientLock<T>(clientId: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(clientId) ?? Promise.resolve();
  const { promise: gate, resolve: release } = Promise.withResolvers<void>();
  locks.set(clientId, gate);
  try {
    // Wait for our turn: the previous chain entry resolves when every earlier
    // critical section for this client has released.
    await previous;
    return await fn();
  } finally {
    release();
    if (locks.get(clientId) === gate) {
      locks.delete(clientId);
    }
  }
}
